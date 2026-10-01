CREATE OR REPLACE FUNCTION public.miss_chips_carry(p_casino_id uuid, p_month_start date)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  WITH s AS (
    SELECT s.closing_count cc FROM shifts s
    WHERE s.casino_id = p_casino_id AND s.status = 'closed' AND s.closing_count IS NOT NULL
      AND business_date_of(s.opened_at) >= DATE '2026-09-01'
      AND business_date_of(s.opened_at) < p_month_start
  ), d AS (
    SELECT e.key k, SUM(e.value::numeric) q FROM s, jsonb_each_text(COALESCE(s.cc->'chip_miss_by_denom','{}'::jsonb)) e GROUP BY e.key
  )
  SELECT jsonb_build_object(
    'total', COALESCE((SELECT SUM(COALESCE((cc->>'chip_miss_total')::numeric,0)) FROM s),0),
    'by_denom', COALESCE((SELECT jsonb_object_agg(k, q) FROM d WHERE q <> 0),'{}'::jsonb));
$$;
GRANT EXECUTE ON FUNCTION public.miss_chips_carry(uuid, date) TO authenticated, service_role;

DO $do$
DECLARE v text;
BEGIN
  SELECT pg_get_functiondef('public.fin_balance_snapshot(uuid,date,date)'::regprocedure) INTO v;
  IF position('miss_chips_carry' in v) = 0 THEN
    v := replace(v, '  SELECT -COALESCE(SUM(COALESCE(cs.cards_miss,0)),0) INTO v_missed_cards',
      E'  -- Start Month carry (cumulative since 2026-09-01), only for whole-month windows\n  IF p_period_start = date_trunc(''month'', p_period_start)::date THEN\n    v_missed_chips := v_missed_chips - COALESCE((public.miss_chips_carry(p_casino_id, p_period_start)->>''total'')::numeric, 0);\n  END IF;\n\n  SELECT -COALESCE(SUM(COALESCE(cs.cards_miss,0)),0) INTO v_missed_cards');
    IF position('miss_chips_carry' in v) = 0 THEN RAISE EXCEPTION 'anchor not found'; END IF;
    EXECUTE v;
  END IF;
END $do$;