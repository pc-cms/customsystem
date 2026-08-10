CREATE OR REPLACE FUNCTION public.record_table_drop_slot()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ts_eat timestamp := (now() AT TIME ZONE 'Africa/Dar_es_Salaam');
  h int := extract(hour from ts_eat)::int;
  m int := extract(minute from ts_eat)::int;
  bdate date := public.business_date_of(now());
  target_h int;
  slot text;
  written int := 0;
BEGIN
  -- Final window: 04:50 → 07:59 EAT collapses into the 06:00 "Final" slot.
  IF (h = 4 AND m >= 50) OR h IN (5, 6, 7) THEN
    target_h := 6;
  ELSIF m >= 50 THEN
    target_h := (h + 1) % 24;
  ELSE
    target_h := h;
  END IF;

  -- Only the 19:00 → 06:00 tracking window is recorded.
  IF NOT (target_h >= 19 OR target_h <= 6) THEN
    RETURN 0;
  END IF;

  slot := lpad(target_h::text, 2, '0') || ':00';

  WITH agg AS (
    SELECT t.casino_id, t.table_id, sum(t.amount)::numeric AS amount
      FROM public.transactions t
     WHERE t.business_date = bdate
       AND t.table_id IS NOT NULL
       AND t.type IN ('in', 'buy')
       AND t.cancelled_at IS NULL
       AND t.created_at <= now()
     GROUP BY t.casino_id, t.table_id
  ), ins AS (
    INSERT INTO public.table_drop_tracker (casino_id, table_id, date, time_slot, amount)
    SELECT casino_id, table_id, bdate, slot, amount FROM agg
    ON CONFLICT (table_id, date, time_slot)
    DO UPDATE SET amount = EXCLUDED.amount, updated_at = now()
    RETURNING 1
  )
  SELECT count(*)::int INTO written FROM ins;

  RETURN written;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_table_drop_slot() TO authenticated, service_role;