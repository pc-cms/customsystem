
-- FX helper: rate for a casino/currency on a given date
CREATE OR REPLACE FUNCTION public.boss_fx_rate(_casino_id uuid, _currency text, _date date)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT r.rate_to_tzs FROM public.fin_daily_rates r
      WHERE r.casino_id = _casino_id
        AND upper(r.currency) = upper(COALESCE(_currency,'TZS'))
        AND r.business_date <= _date
      ORDER BY r.business_date DESC LIMIT 1),
    (SELECT e.rate_to_tzs FROM public.cage_slots_exchange_rates e
      WHERE e.casino_id = _casino_id
        AND upper(e.currency_code) = upper(COALESCE(_currency,'TZS'))
      ORDER BY e.created_at DESC LIMIT 1),
    CASE upper(COALESCE(_currency,'TZS'))
      WHEN 'TZS' THEN 1 WHEN 'USD' THEN 2600 WHEN 'EUR' THEN 2800
      WHEN 'GBP' THEN 3000 WHEN 'KES' THEN 17 ELSE 1 END
  );
$$;

CREATE OR REPLACE FUNCTION public.boss_monthly_report(_casino_ids uuid[], _year int, _month int)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_from date := make_date(_year, _month, 1);
  v_to   date := (make_date(_year, _month, 1) + interval '1 month - 1 day')::date;
  v_out  jsonb;
BEGIN
  WITH closed AS (
    SELECT c.casino_id, c.business_date
      FROM public.business_day_closures c
     WHERE c.casino_id = ANY(_casino_ids)
       AND c.business_date BETWEEN v_from AND v_to
  ),
  dc AS (
    SELECT d.casino_id, d.business_date,
           COALESCE(d.tables_result,0)::numeric AS tables_result,
           COALESCE(d.slots_result,0)::numeric  AS slots_result,
           ABS(COALESCE(d.players_card_balance,0))::numeric AS cards
      FROM public.fin_day_closing d
      JOIN closed cl ON cl.casino_id = d.casino_id AND cl.business_date = d.business_date
  ),
  per_casino AS (
    SELECT cid AS casino_id,
      COALESCE((SELECT SUM(tables_result) FROM dc WHERE dc.casino_id = cid),0) AS tables,
      COALESCE((SELECT SUM(slots_result)  FROM dc WHERE dc.casino_id = cid),0) AS slots,
      COALESCE((SELECT dc2.cards FROM dc dc2 WHERE dc2.casino_id = cid AND dc2.cards > 0
                 ORDER BY dc2.business_date DESC LIMIT 1),0) AS players_cards,
      COALESCE((SELECT SUM(oi.amount * COALESCE(oi.fx_rate,1))
                  FROM public.fin_other_incomes oi
                 WHERE oi.casino_id = cid
                   AND oi.business_date BETWEEN v_from AND v_to
                   AND oi.reverses_id IS NULL),0) AS other,
      COALESCE((SELECT SUM(COALESCE(e.amount_tzs, e.amount * public.boss_fx_rate(cid, e.currency, e.business_date)))
                  FROM public.expenses e
                  JOIN public.fin_categories fc ON fc.id = e.fin_category_id
                 WHERE e.casino_id = cid
                   AND e.business_date BETWEEN v_from AND v_to
                   AND e.voided_at IS NULL
                   AND COALESCE(fc.is_income,false) = false
                   AND fc.group_code = 'collections'),0) AS collection,
      COALESCE((SELECT SUM(b.planned_amount * public.boss_fx_rate(cid, b.currency, v_to))
                  FROM public.fin_budget b
                 WHERE b.casino_id = cid AND b.year = _year AND b.month = _month),0) AS estimated
    FROM unnest(_casino_ids) AS cid
  ),
  daily AS (
    SELECT d.business_date AS date, d.casino_id,
           (d.tables_result + d.slots_result) AS result
      FROM dc d
  ),
  daily_collection AS (
    SELECT e.business_date AS date, SUM(COALESCE(e.amount_tzs, e.amount * public.boss_fx_rate(e.casino_id, e.currency, e.business_date))) AS collection
      FROM public.expenses e
      JOIN public.fin_categories fc ON fc.id = e.fin_category_id
     WHERE e.casino_id = ANY(_casino_ids)
       AND e.business_date BETWEEN v_from AND v_to
       AND e.voided_at IS NULL
       AND COALESCE(fc.is_income,false) = false
       AND fc.group_code = 'collections'
     GROUP BY e.business_date
  ),
  extras AS (
    SELECT x.casino_id, x.label, x.amount, x.sort_order
      FROM public.boss_report_extras x
     WHERE x.casino_id = ANY(_casino_ids) AND x.year = _year AND x.month = _month
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
$$;

GRANT EXECUTE ON FUNCTION public.boss_monthly_report(uuid[], int, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.boss_fx_rate(uuid, text, date) TO authenticated;

-- Remove auto-created empty rows for business days that are not closed yet
DELETE FROM public.fin_day_closing d
 WHERE d.closed_by IS NULL
   AND NOT EXISTS (SELECT 1 FROM public.business_day_closures b
                    WHERE b.casino_id = d.casino_id AND b.business_date = d.business_date)
   AND COALESCE(d.tables_result,0) = 0
   AND COALESCE(d.slots_result,0) = 0
   AND COALESCE(d.players_card_balance,0) = 0
   AND COALESCE(d.drop_slots,0) = 0
   AND COALESCE(d.net_win,0) = 0
   AND COALESCE(d.cashdesk_win,0) = 0
   AND COALESCE(d.income_lines,'[]'::jsonb) = '[]'::jsonb;
