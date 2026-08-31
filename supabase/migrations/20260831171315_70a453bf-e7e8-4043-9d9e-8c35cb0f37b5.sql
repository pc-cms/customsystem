CREATE OR REPLACE FUNCTION public.boss_monthly_report(_casino_ids uuid[], _year integer, _month integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_from date := make_date(_year, _month, 1);
  v_to   date := (make_date(_year, _month, 1) + interval '1 month - 1 day')::date;
  v_uid  uuid := auth.uid();
  v_all  boolean;
  v_ids  uuid[];
  v_out  jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  v_all := public.has_role(v_uid, 'super_admin'::app_role)
        OR public.can_finance(v_uid)
        OR public.has_role(v_uid, 'boss'::app_role)
        OR public.has_role(v_uid, 'general_manager'::app_role);

  IF v_all THEN
    v_ids := _casino_ids;
  ELSE
    SELECT COALESCE(array_agg(cid), '{}'::uuid[]) INTO v_ids
      FROM unnest(COALESCE(_casino_ids, '{}'::uuid[])) AS cid
     WHERE public.user_has_casino_access(v_uid, cid)
        OR public.has_casino_scope(v_uid, cid);
  END IF;

  IF v_ids IS NULL OR array_length(v_ids, 1) IS NULL THEN
    RETURN jsonb_build_object(
      'from', v_from, 'to', v_to,
      'closed_days', '[]'::jsonb, 'closed_days_count', 0,
      'per_casino', '[]'::jsonb, 'daily', '[]'::jsonb,
      'daily_collection', '[]'::jsonb, 'extras', '[]'::jsonb);
  END IF;

  WITH ids AS (
    SELECT cid FROM unnest(v_ids) AS cid
  ),
  closed AS (
    SELECT c.casino_id, c.business_date
      FROM public.business_day_closures c
      JOIN ids ON ids.cid = c.casino_id
     WHERE c.business_date BETWEEN v_from AND v_to
  ),
  -- CANON (identical to Dashboard TV monthly):
  --   Slot Result = SUM per closed day of (cashdesk_win - players_card_balance), signed.
  dc AS (
    SELECT d.casino_id, d.business_date,
           COALESCE(d.tables_result,0)::numeric AS tables_result,
           COALESCE(d.cashdesk_win,0)::numeric  AS cashdesk_win,
           COALESCE(d.players_card_balance,0)::numeric AS cards,
           (COALESCE(d.cashdesk_win,0) - COALESCE(d.players_card_balance,0))::numeric AS slots_net
      FROM public.fin_day_closing d
      JOIN closed cl ON cl.casino_id = d.casino_id AND cl.business_date = d.business_date
  ),
  dc_agg AS (
    SELECT casino_id,
           SUM(tables_result) AS tables,
           SUM(slots_net)     AS slots,
           SUM(cards)         AS cards
      FROM dc GROUP BY casino_id
  ),
  coll_exp AS (
    SELECT e.casino_id, e.business_date, e.amount, e.amount_tzs,
           upper(COALESCE(e.currency,'TZS')) AS cur
      FROM public.expenses e
      JOIN ids ON ids.cid = e.casino_id
      JOIN public.fin_categories fc ON fc.id = e.fin_category_id
     WHERE e.business_date BETWEEN v_from AND v_to
       AND e.voided_at IS NULL
       AND COALESCE(fc.is_income,false) = false
       AND fc.group_code = 'collections'
  ),
  budget AS (
    SELECT b.casino_id, upper(COALESCE(b.currency,'TZS')) AS cur, b.planned_amount
      FROM public.fin_budget b
      JOIN ids ON ids.cid = b.casino_id
     WHERE b.year = _year AND b.month = _month
  ),
  fx_need AS (
    SELECT DISTINCT casino_id, cur, business_date AS d
      FROM coll_exp WHERE amount_tzs IS NULL AND cur <> 'TZS'
    UNION
    SELECT DISTINCT casino_id, cur, v_to FROM budget WHERE cur <> 'TZS'
  ),
  fx AS (
    SELECT n.casino_id, n.cur, n.d,
           COALESCE(r.rate_to_tzs, x.rate_to_tzs,
             CASE n.cur WHEN 'USD' THEN 2600 WHEN 'EUR' THEN 2800
                        WHEN 'GBP' THEN 3000 WHEN 'KES' THEN 17 ELSE 1 END) AS rate
      FROM fx_need n
      LEFT JOIN LATERAL (
        SELECT r.rate_to_tzs FROM public.fin_daily_rates r
         WHERE r.casino_id = n.casino_id AND upper(r.currency) = n.cur
           AND r.business_date <= n.d
         ORDER BY r.business_date DESC LIMIT 1) r ON true
      LEFT JOIN LATERAL (
        SELECT e.rate_to_tzs FROM public.cage_slots_exchange_rates e
         WHERE e.casino_id = n.casino_id AND upper(e.currency_code) = n.cur
         ORDER BY e.created_at DESC LIMIT 1) x ON true
  ),
  coll_tzs AS (
    SELECT c.casino_id, c.business_date,
           COALESCE(c.amount_tzs,
                    c.amount * CASE WHEN c.cur = 'TZS' THEN 1 ELSE COALESCE(f.rate, 1) END) AS amt
      FROM coll_exp c
      LEFT JOIN fx f ON f.casino_id = c.casino_id AND f.cur = c.cur AND f.d = c.business_date
  ),
  coll_agg AS (
    SELECT casino_id, SUM(amt) AS collection FROM coll_tzs GROUP BY casino_id
  ),
  daily_collection AS (
    SELECT business_date AS date, SUM(amt) AS collection
      FROM coll_tzs GROUP BY business_date
  ),
  budget_agg AS (
    SELECT b.casino_id,
           SUM(b.planned_amount * CASE WHEN b.cur = 'TZS' THEN 1 ELSE COALESCE(f.rate, 1) END) AS estimated
      FROM budget b
      LEFT JOIN fx f ON f.casino_id = b.casino_id AND f.cur = b.cur AND f.d = v_to
     GROUP BY b.casino_id
  ),
  other_agg AS (
    SELECT oi.casino_id, SUM(oi.amount * COALESCE(oi.fx_rate,1)) AS other
      FROM public.fin_other_incomes oi
      JOIN ids ON ids.cid = oi.casino_id
     WHERE oi.business_date BETWEEN v_from AND v_to
       AND oi.reverses_id IS NULL
       AND oi.source IN ('other','refund','fee')
     GROUP BY oi.casino_id
  ),
  per_casino AS (
    SELECT i.cid AS casino_id,
           COALESCE(a.tables,0)      AS tables,
           COALESCE(a.slots,0)       AS slots,
           COALESCE(a.cards,0)       AS players_cards,
           COALESCE(o.other,0)       AS other,
           COALESCE(co.collection,0) AS collection,
           COALESCE(bg.estimated,0)  AS estimated
      FROM ids i
      LEFT JOIN dc_agg a      ON a.casino_id  = i.cid
      LEFT JOIN other_agg o   ON o.casino_id  = i.cid
      LEFT JOIN coll_agg co   ON co.casino_id = i.cid
      LEFT JOIN budget_agg bg ON bg.casino_id = i.cid
  ),
  daily AS (
    SELECT d.business_date AS date, d.casino_id,
           (d.tables_result + d.slots_net) AS result
      FROM dc d
  ),
  extras AS (
    SELECT x.casino_id, x.label, x.amount, x.sort_order
      FROM public.boss_report_extras x
      JOIN ids ON ids.cid = x.casino_id
     WHERE x.year = _year AND x.month = _month
  )
  SELECT jsonb_build_object(
    'from', v_from,
    'to', v_to,
    'closed_days', COALESCE((SELECT jsonb_agg(DISTINCT business_date ORDER BY business_date) FROM closed),'[]'::jsonb),
    'closed_days_count', (SELECT COUNT(DISTINCT business_date) FROM closed),
    'per_casino', COALESCE((SELECT jsonb_agg(to_jsonb(p)) FROM per_casino p),'[]'::jsonb),
    'daily', COALESCE((SELECT jsonb_agg(to_jsonb(d)) FROM daily d),'[]'::jsonb),
    'daily_collection', COALESCE((SELECT jsonb_agg(to_jsonb(dc3)) FROM daily_collection dc3),'[]'::jsonb),
    'extras', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.sort_order, x.label) FROM extras x),'[]'::jsonb)
  ) INTO v_out;

  RETURN v_out;
END;
$function$;