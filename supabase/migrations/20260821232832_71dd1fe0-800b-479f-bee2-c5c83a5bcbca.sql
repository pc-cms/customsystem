CREATE OR REPLACE FUNCTION public.finance_hub_fx_rates(
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL,
  p_casino_ids uuid[] DEFAULT NULL,
  p_currencies text[] DEFAULT NULL,
  p_source_types text[] DEFAULT NULL,
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
  v_cid uuid;
  v_rows jsonb;
  v_last jsonb;
  v_more boolean := false;
BEGIN
  IF p_cursor IS NOT NULL AND p_cursor <> '' THEN
    v_cd := NULLIF(split_part(p_cursor,'|',1),'')::date;
    v_cid := NULLIF(split_part(p_cursor,'|',2),'')::uuid;
  END IF;

  SELECT COALESCE(jsonb_agg(x ORDER BY ord), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT row_number() OVER (ORDER BY u.effective_business_date ASC, u.source_id ASC) AS ord,
      jsonb_build_object(
        'source_id', u.source_id,
        'source_type', u.source_type,
        'source_table', u.source_table,
        'source_ref_id', u.source_ref_id,
        'precedence', u.precedence,
        'casino_id', u.casino_id,
        'casino_name', c.name,
        'casino_code', c.code,
        'currency', u.currency,
        'rate_to_tzs', u.rate_to_tzs,
        'effective_business_date', u.effective_business_date,
        'period_year', EXTRACT(YEAR FROM u.effective_business_date)::int,
        'period_month', EXTRACT(MONTH FROM u.effective_business_date)::int,
        'is_frozen', (
          mc.id IS NOT NULL
          OR dc.locked_at IS NOT NULL
          OR bdc.id IS NOT NULL
          OR (u.source_type <> 'office_daily_rate' AND u.shift_closed)
        ),
        'frozen_reason', CASE
          WHEN mc.id IS NOT NULL THEN 'month_closed'
          WHEN dc.locked_at IS NOT NULL THEN 'day_closing_locked'
          WHEN bdc.id IS NOT NULL THEN 'business_day_closed'
          WHEN u.source_type <> 'office_daily_rate' AND u.shift_closed THEN 'shift_closed'
          ELSE NULL END,
        'month_closed_at', mc.closed_at,
        'day_locked_at', dc.locked_at,
        'source_updated_at', u.source_updated_at,
        'cursor', u.effective_business_date::text || '|' || u.source_id::text
      ) AS x
    FROM (
      -- Layer 1 (authoritative for finance reporting): Office daily rates
      SELECT d.id AS source_id,
             'office_daily_rate'::text AS source_type,
             'fin_daily_rates'::text AS source_table,
             d.id AS source_ref_id,
             1 AS precedence,
             d.casino_id,
             d.currency::text AS currency,
             d.rate_to_tzs::numeric AS rate_to_tzs,
             d.business_date AS effective_business_date,
             d.set_at AS source_updated_at,
             false AS shift_closed
      FROM fin_daily_rates d
      UNION ALL
      -- Layer 2: cage (live) shift rates actually used at the cash desk
      SELECT md5(s.id::text || '|' || kv.key)::uuid AS source_id,
             'cage_shift_rate'::text,
             'shifts.exchange_rates'::text,
             s.id,
             2,
             s.casino_id,
             kv.key::text,
             NULLIF(kv.value #>> '{}','')::numeric,
             (COALESCE(s.closed_at, s.opened_at) AT TIME ZONE 'Africa/Dar_es_Salaam')::date,
             COALESCE(s.closed_at, s.opened_at),
             (s.closed_at IS NOT NULL)
      FROM shifts s
      CROSS JOIN LATERAL jsonb_each(COALESCE(s.exchange_rates,'{}'::jsonb)) kv
      WHERE NULLIF(kv.value #>> '{}','') ~ '^[0-9]+(\.[0-9]+)?$'
      UNION ALL
      -- Layer 3: cage slots shift rates
      SELECT md5(x.cage_slots_shift_id::text || '|' || x.currency_code)::uuid,
             'cage_slots_shift_rate'::text,
             'cage_slots_exchange_rates'::text,
             x.cage_slots_shift_id,
             3,
             x.casino_id,
             x.currency_code::text,
             x.rate_to_tzs::numeric,
             (COALESCE(sh.closed_at, sh.created_at) AT TIME ZONE 'Africa/Dar_es_Salaam')::date,
             COALESCE(x.updated_at, x.created_at),
             (sh.closed_at IS NOT NULL)
      FROM cage_slots_exchange_rates x
      JOIN cage_slots_shifts sh ON sh.id = x.cage_slots_shift_id
    ) u
    JOIN casinos c ON c.id = u.casino_id
    LEFT JOIN fin_month_closures mc
      ON mc.casino_id = u.casino_id
     AND mc.year = EXTRACT(YEAR FROM u.effective_business_date)::int
     AND mc.month = EXTRACT(MONTH FROM u.effective_business_date)::int
    LEFT JOIN fin_day_closing dc
      ON dc.casino_id = u.casino_id AND dc.business_date = u.effective_business_date
    LEFT JOIN business_day_closures bdc
      ON bdc.casino_id = u.casino_id AND bdc.business_date = u.effective_business_date
    WHERE u.rate_to_tzs IS NOT NULL
      AND (p_casino_ids IS NULL OR u.casino_id = ANY(p_casino_ids))
      AND (p_from IS NULL OR u.effective_business_date >= p_from)
      AND (p_to IS NULL OR u.effective_business_date <= p_to)
      AND (p_currencies IS NULL OR u.currency = ANY(p_currencies))
      AND (p_source_types IS NULL OR u.source_type = ANY(p_source_types))
      AND (v_cd IS NULL
           OR u.effective_business_date > v_cd
           OR (v_cid IS NOT NULL AND u.effective_business_date = v_cd AND u.source_id > v_cid))
    ORDER BY u.effective_business_date ASC, u.source_id ASC
    LIMIT v_limit
  ) s2;

  v_last := v_rows->-1;
  IF jsonb_array_length(v_rows) = v_limit AND v_last IS NOT NULL THEN v_more := TRUE; END IF;

  RETURN jsonb_build_object(
    'generated_at', now(),
    'mode', 'fx_rates',
    'from', p_from, 'to', p_to, 'limit', v_limit, 'cursor', p_cursor,
    'base_currency', 'TZS',
    'precedence', jsonb_build_array('office_daily_rate','cage_shift_rate','cage_slots_shift_rate'),
    'row_count', jsonb_array_length(v_rows),
    'has_more', v_more,
    'next_cursor', CASE WHEN v_more THEN v_last->>'cursor' ELSE NULL END,
    'fx_rates', v_rows
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.finance_hub_fx_rates(date,date,uuid[],text[],text[],integer,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finance_hub_fx_rates(date,date,uuid[],text[],text[],integer,text) TO service_role;