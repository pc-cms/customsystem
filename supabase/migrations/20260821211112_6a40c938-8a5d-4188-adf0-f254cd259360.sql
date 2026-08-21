DROP FUNCTION IF EXISTS public.finance_hub_transactions(timestamptz, integer);

CREATE OR REPLACE FUNCTION public.finance_hub_transactions(
  p_since timestamptz DEFAULT NULL,
  p_limit integer DEFAULT 1000,
  p_cursor text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit,1000),1), 1000);
  v_ts timestamptz;
  v_id uuid;
  v_rows jsonb;
  v_last jsonb;
  v_more boolean := false;
BEGIN
  IF p_cursor IS NOT NULL AND p_cursor <> '' THEN
    v_ts := NULLIF(split_part(p_cursor, '|', 1), '')::timestamptz;
    v_id := NULLIF(split_part(p_cursor, '|', 2), '')::uuid;
  ELSE
    v_ts := p_since;
  END IF;

  SELECT COALESCE(jsonb_agg(x ORDER BY ord), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT row_number() OVER (ORDER BY t.created_at ASC, t.id ASC) AS ord,
    jsonb_build_object(
      'source_tx_id', t.id,
      'wallet_id', t.wallet_id,
      'wallet_canonical_code', w.canonical_code,
      'casino_id', t.casino_id,
      'business_date', t.business_date,
      'created_at', t.created_at,
      'posted_at', t.posted_at,
      'kind', t.kind,
      'direction', CASE WHEN t.kind IN ('expense','manual_expense','collection','change_out','transfer_out') THEN 'out' ELSE 'in' END,
      'sign', CASE WHEN t.kind IN ('expense','manual_expense','collection','change_out','transfer_out') THEN -1 ELSE 1 END,
      'amount_native', COALESCE(t.amount,0),
      'signed_amount_native', CASE WHEN t.kind IN ('expense','manual_expense','collection','change_out','transfer_out')
                                   THEN -abs(COALESCE(t.amount,0)) ELSE COALESCE(t.amount,0) END,
      'currency', t.currency,
      'fx_rate', t.fx_rate,
      'amount_tzs', t.amount_tzs,
      'signed_amount_tzs', CASE WHEN t.kind IN ('expense','manual_expense','collection','change_out','transfer_out')
                                THEN -abs(COALESCE(t.amount_tzs,0)) ELSE COALESCE(t.amount_tzs,0) END,
      'note', t.note,
      'ref_table', t.ref_table,
      'ref_id', t.ref_id,
      'reversal_of', t.reversal_of,
      'transfer_group_ref', CASE WHEN t.ref_id IS NOT NULL THEN COALESCE(t.ref_table,'') || ':' || t.ref_id::text ELSE NULL END,
      'counterpart_tx_id', pair.id,
      'legacy_unpaired', (t.kind = 'transfer' AND pair.id IS NULL),
      'cursor', to_char(t.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') || '|' || t.id::text
    ) AS x
    FROM fin_wallet_tx t
    LEFT JOIN fin_wallets w ON w.id = t.wallet_id
    LEFT JOIN LATERAL (
      SELECT t2.id FROM fin_wallet_tx t2
       WHERE t.ref_id IS NOT NULL
         AND t2.ref_id = t.ref_id
         AND COALESCE(t2.ref_table,'') = COALESCE(t.ref_table,'')
         AND t2.id <> t.id
       LIMIT 1
    ) pair ON TRUE
    WHERE (v_ts IS NULL OR t.created_at > v_ts OR (v_id IS NOT NULL AND t.created_at = v_ts AND t.id > v_id))
    ORDER BY t.created_at ASC, t.id ASC
    LIMIT v_limit
  ) s;

  v_last := v_rows->-1;
  IF jsonb_array_length(v_rows) = v_limit AND v_last IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM fin_wallet_tx t
       WHERE t.created_at > (v_last->>'created_at')::timestamptz
          OR (t.created_at = (v_last->>'created_at')::timestamptz AND t.id > (v_last->>'source_tx_id')::uuid)
    ) INTO v_more;
  END IF;

  RETURN jsonb_build_object(
    'generated_at', now(),
    'mode', 'transactions',
    'since', p_since,
    'cursor', p_cursor,
    'limit', v_limit,
    'count', jsonb_array_length(v_rows),
    'row_count', jsonb_array_length(v_rows),
    'has_more', v_more,
    'next_cursor', CASE WHEN v_more THEN v_last->>'cursor' ELSE NULL END,
    'transactions', v_rows
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.finance_hub_performance(
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL,
  p_casino_ids uuid[] DEFAULT NULL,
  p_limit integer DEFAULT 1000,
  p_cursor text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_from date := COALESCE(p_from, (now() AT TIME ZONE 'Africa/Dar_es_Salaam')::date);
  v_to   date := COALESCE(p_to, COALESCE(p_from, (now() AT TIME ZONE 'Africa/Dar_es_Salaam')::date));
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit,1000),1), 1000);
  v_cd date;
  v_cc uuid;
  v_rows jsonb;
  v_last jsonb;
  v_more boolean := false;
BEGIN
  IF p_cursor IS NOT NULL AND p_cursor <> '' THEN
    v_cd := NULLIF(split_part(p_cursor,'|',1),'')::date;
    v_cc := NULLIF(split_part(p_cursor,'|',2),'')::uuid;
  END IF;

  WITH cas AS (
    SELECT c.id, c.name, c.code FROM casinos c
    WHERE p_casino_ids IS NULL OR c.id = ANY(p_casino_ids)
  ),
  keys AS (
    SELECT d.casino_id, d.business_date FROM fin_day_closing d
      JOIN cas ON cas.id = d.casino_id
     WHERE d.business_date BETWEEN v_from AND v_to
    UNION
    SELECT b.casino_id, b.business_date FROM business_day_closures b
      JOIN cas ON cas.id = b.casino_id
     WHERE b.business_date BETWEEN v_from AND v_to
  ),
  exp AS (
    SELECT e.casino_id, e.business_date,
           SUM(COALESCE(e.amount_tzs, e.amount * COALESCE(e.exchange_rate,1))) AS amt
      FROM expenses e
      JOIN keys k ON k.casino_id = e.casino_id AND k.business_date = e.business_date
      LEFT JOIN fin_categories fc ON fc.id = e.fin_category_id
     WHERE e.voided_at IS NULL AND COALESCE(fc.is_income,false) = false
     GROUP BY 1,2
  ),
  inc AS (
    SELECT o.casino_id, o.business_date,
           SUM(COALESCE(o.amount,0) * COALESCE(o.fx_rate,1)) AS amt
      FROM fin_other_incomes o
      JOIN keys k ON k.casino_id = o.casino_id AND k.business_date = o.business_date
     WHERE o.reverses_id IS NULL AND o.reversed_by_id IS NULL
     GROUP BY 1,2
  ),
  drop_t AS (
    SELECT p.casino_id, p.business_date, SUM(COALESCE(p.peak,0)) AS amt
      FROM player_day_drop_cache p
      JOIN keys k ON k.casino_id = p.casino_id AND k.business_date = p.business_date
     GROUP BY 1,2
  ),
  base AS (
    SELECT
      k.casino_id, cas.name AS casino_name, cas.code AS casino_code, k.business_date,
      d.tables_result, d.slots_result, d.drop_slots, d.net_win, d.cashdesk_win,
      d.players_card_balance, d.updated_at, d.locked_at,
      exp.amt AS expenses_tzs, inc.amt AS other_income_tzs, drop_t.amt AS tables_drop_tzs,
      b.closed_at, b.closed_method
    FROM keys k
    JOIN cas ON cas.id = k.casino_id
    LEFT JOIN fin_day_closing d ON d.casino_id = k.casino_id AND d.business_date = k.business_date
    LEFT JOIN business_day_closures b ON b.casino_id = k.casino_id AND b.business_date = k.business_date
    LEFT JOIN exp ON exp.casino_id = k.casino_id AND exp.business_date = k.business_date
    LEFT JOIN inc ON inc.casino_id = k.casino_id AND inc.business_date = k.business_date
    LEFT JOIN drop_t ON drop_t.casino_id = k.casino_id AND drop_t.business_date = k.business_date
    WHERE (v_cd IS NULL OR k.business_date > v_cd OR (k.business_date = v_cd AND k.casino_id > v_cc))
    ORDER BY k.business_date ASC, k.casino_id ASC
    LIMIT v_limit
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'casino_id', casino_id,
    'casino_name', casino_name,
    'casino_code', casino_code,
    'city', NULL,
    'business_date', business_date,
    'tables_result_tzs', tables_result,
    'slots_result_tzs', slots_result,
    'total_gaming_result_tzs', CASE WHEN tables_result IS NULL AND slots_result IS NULL THEN NULL
                                    ELSE COALESCE(tables_result,0) + COALESCE(slots_result,0) END,
    'expenses_tzs', expenses_tzs,
    'other_income_tzs', other_income_tzs,
    'net_result_tzs', CASE WHEN tables_result IS NULL AND slots_result IS NULL THEN NULL
                           ELSE COALESCE(tables_result,0) + COALESCE(slots_result,0)
                                - COALESCE(expenses_tzs,0) + COALESCE(other_income_tzs,0) END,
    'tables_drop_tzs', tables_drop_tzs,
    'tables_payout_tzs', NULL,
    'slots_drop_tzs', drop_slots,
    'slots_payout_tzs', NULL,
    'slots_net_win_tzs', net_win,
    'slots_cashdesk_win_tzs', cashdesk_win,
    'players_card_balance_tzs', players_card_balance,
    'is_day_closed', (closed_at IS NOT NULL),
    'day_closed_at', closed_at,
    'day_closed_method', closed_method,
    'source_updated_at', COALESCE(updated_at, locked_at, closed_at),
    'cursor', business_date::text || '|' || casino_id::text
  ) ORDER BY business_date, casino_id), '[]'::jsonb) INTO v_rows FROM base;

  v_last := v_rows->-1;
  IF jsonb_array_length(v_rows) = v_limit AND v_last IS NOT NULL THEN
    v_more := TRUE;
  END IF;

  RETURN jsonb_build_object(
    'generated_at', now(),
    'mode', 'performance',
    'from', v_from, 'to', v_to, 'limit', v_limit, 'cursor', p_cursor,
    'row_count', jsonb_array_length(v_rows),
    'has_more', v_more,
    'next_cursor', CASE WHEN v_more THEN v_last->>'cursor' ELSE NULL END,
    'performance', v_rows
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.finance_hub_expenses(
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL,
  p_casino_ids uuid[] DEFAULT NULL,
  p_limit integer DEFAULT 1000,
  p_cursor text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit,1000),1), 1000);
  v_ts timestamptz;
  v_id uuid;
  v_rows jsonb;
  v_last jsonb;
  v_more boolean := false;
BEGIN
  IF p_cursor IS NOT NULL AND p_cursor <> '' THEN
    v_ts := NULLIF(split_part(p_cursor,'|',1),'')::timestamptz;
    v_id := NULLIF(split_part(p_cursor,'|',2),'')::uuid;
  END IF;

  SELECT COALESCE(jsonb_agg(x ORDER BY ord), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT row_number() OVER (ORDER BY e.created_at ASC, e.id ASC) AS ord,
    jsonb_build_object(
      'source_expense_id', e.id,
      'casino_id', e.casino_id,
      'casino_name', c.name,
      'business_date', e.business_date,
      'category_id', e.fin_category_id,
      'category_name', fc.name,
      'category_group', fc.group_code,
      'legacy_category', e.category::text,
      'wallet_id', e.wallet_id,
      'wallet_canonical_code', w.canonical_code,
      'currency', COALESCE(e.currency,'TZS'),
      'amount_native', COALESCE(e.amount,0),
      'fx_rate', COALESCE(e.exchange_rate,1),
      'amount_tzs', COALESCE(e.amount_tzs, e.amount * COALESCE(e.exchange_rate,1)),
      'description', e.description,
      'attachment_present', (e.attachment_url IS NOT NULL),
      'attachment_ref', CASE WHEN e.attachment_url IS NULL THEN NULL ELSE md5(e.attachment_url) END,
      'source', e.source,
      'approved', e.approved,
      'approved_at', e.approved_at,
      'is_voided', (e.voided_at IS NOT NULL),
      'voided_at', e.voided_at,
      'reversal_of', e.reversal_of,
      'reversed_by', e.reversed_by,
      'created_at', e.created_at,
      'updated_at', e.created_at,
      'created_by', e.created_by,
      'cursor', to_char(e.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') || '|' || e.id::text
    ) AS x
    FROM expenses e
    JOIN casinos c ON c.id = e.casino_id
    LEFT JOIN fin_categories fc ON fc.id = e.fin_category_id
    LEFT JOIN fin_wallets w ON w.id = e.wallet_id
    WHERE (p_casino_ids IS NULL OR e.casino_id = ANY(p_casino_ids))
      AND (p_from IS NULL OR e.business_date >= p_from)
      AND (p_to IS NULL OR e.business_date <= p_to)
      AND (v_ts IS NULL OR e.created_at > v_ts OR (v_id IS NOT NULL AND e.created_at = v_ts AND e.id > v_id))
    ORDER BY e.created_at ASC, e.id ASC
    LIMIT v_limit
  ) s;

  v_last := v_rows->-1;
  IF jsonb_array_length(v_rows) = v_limit AND v_last IS NOT NULL THEN v_more := TRUE; END IF;

  RETURN jsonb_build_object(
    'generated_at', now(),
    'mode', 'expenses',
    'from', p_from, 'to', p_to, 'limit', v_limit, 'cursor', p_cursor,
    'row_count', jsonb_array_length(v_rows),
    'has_more', v_more,
    'next_cursor', CASE WHEN v_more THEN v_last->>'cursor' ELSE NULL END,
    'expenses', v_rows
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.finance_hub_closings(
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL,
  p_casino_ids uuid[] DEFAULT NULL,
  p_limit integer DEFAULT 1000,
  p_cursor text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit,1000),1), 1000);
  v_cd date;
  v_cc uuid;
  v_rows jsonb;
  v_months jsonb;
  v_last jsonb;
  v_more boolean := false;
BEGIN
  IF p_cursor IS NOT NULL AND p_cursor <> '' THEN
    v_cd := NULLIF(split_part(p_cursor,'|',1),'')::date;
    v_cc := NULLIF(split_part(p_cursor,'|',2),'')::uuid;
  END IF;

  WITH cas AS (
    SELECT c.id, c.name FROM casinos c WHERE p_casino_ids IS NULL OR c.id = ANY(p_casino_ids)
  ),
  keys AS (
    SELECT b.casino_id, b.business_date FROM business_day_closures b JOIN cas ON cas.id = b.casino_id
     WHERE (p_from IS NULL OR b.business_date >= p_from) AND (p_to IS NULL OR b.business_date <= p_to)
    UNION
    SELECT d.casino_id, d.business_date FROM fin_day_closing d JOIN cas ON cas.id = d.casino_id
     WHERE (p_from IS NULL OR d.business_date >= p_from) AND (p_to IS NULL OR d.business_date <= p_to)
  ),
  variance AS (
    SELECT s.casino_id, s.business_date,
           SUM(COALESCE(s.discrepancy,0)) AS discrepancy_total,
           COUNT(*) AS cash_count_rows
      FROM cash_count_snapshots s
      JOIN keys k ON k.casino_id = s.casino_id AND k.business_date = s.business_date
     GROUP BY 1,2
  ),
  base AS (
    SELECT k.casino_id, cas.name AS casino_name, k.business_date,
           b.closed_at, b.closed_by, b.closed_method,
           d.tables_result, d.slots_result, d.players_card_balance, d.locked_at,
           d.variance_note, d.notes, d.updated_at,
           v.discrepancy_total, v.cash_count_rows
      FROM keys k
      JOIN cas ON cas.id = k.casino_id
      LEFT JOIN business_day_closures b ON b.casino_id = k.casino_id AND b.business_date = k.business_date
      LEFT JOIN fin_day_closing d ON d.casino_id = k.casino_id AND d.business_date = k.business_date
      LEFT JOIN variance v ON v.casino_id = k.casino_id AND v.business_date = k.business_date
     WHERE (v_cd IS NULL OR k.business_date > v_cd OR (k.business_date = v_cd AND k.casino_id > v_cc))
     ORDER BY k.business_date ASC, k.casino_id ASC
     LIMIT v_limit
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'casino_id', casino_id,
    'casino_name', casino_name,
    'business_date', business_date,
    'status', CASE WHEN closed_at IS NOT NULL THEN 'closed'
                   WHEN locked_at IS NOT NULL THEN 'locked' ELSE 'open' END,
    'closed_at', closed_at,
    'closed_by', closed_by,
    'closed_method', closed_method,
    'day_closing_locked_at', locked_at,
    'tables_result_tzs', tables_result,
    'slots_result_tzs', slots_result,
    'players_card_balance_tzs', players_card_balance,
    'cash_count_discrepancy_tzs', discrepancy_total,
    'cash_count_rows', cash_count_rows,
    'variance_note', variance_note,
    'notes', notes,
    'source_updated_at', COALESCE(updated_at, closed_at, locked_at),
    'cursor', business_date::text || '|' || casino_id::text
  ) ORDER BY business_date, casino_id), '[]'::jsonb) INTO v_rows FROM base;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'casino_id', m.casino_id, 'year', m.year, 'month', m.month,
    'closed_at', m.closed_at, 'closed_by', m.closed_by,
    'collection_total_tzs', m.collection_total_tzs,
    'collection_total_usd', m.collection_total_usd,
    'note', m.note
  ) ORDER BY m.year DESC, m.month DESC), '[]'::jsonb) INTO v_months
  FROM fin_month_closures m
  WHERE (p_casino_ids IS NULL OR m.casino_id = ANY(p_casino_ids))
    AND (p_from IS NULL OR make_date(m.year, m.month, 1) >= date_trunc('month', p_from)::date)
    AND (p_to IS NULL OR make_date(m.year, m.month, 1) <= p_to);

  v_last := v_rows->-1;
  IF jsonb_array_length(v_rows) = v_limit AND v_last IS NOT NULL THEN v_more := TRUE; END IF;

  RETURN jsonb_build_object(
    'generated_at', now(),
    'mode', 'closings',
    'from', p_from, 'to', p_to, 'limit', v_limit, 'cursor', p_cursor,
    'row_count', jsonb_array_length(v_rows),
    'has_more', v_more,
    'next_cursor', CASE WHEN v_more THEN v_last->>'cursor' ELSE NULL END,
    'day_closings', v_rows,
    'month_closings', v_months
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.finance_hub_transactions(timestamptz,integer,text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.finance_hub_performance(date,date,uuid[],integer,text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.finance_hub_expenses(date,date,uuid[],integer,text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.finance_hub_closings(date,date,uuid[],integer,text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finance_hub_transactions(timestamptz,integer,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.finance_hub_performance(date,date,uuid[],integer,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.finance_hub_expenses(date,date,uuid[],integer,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.finance_hub_closings(date,date,uuid[],integer,text) TO service_role;