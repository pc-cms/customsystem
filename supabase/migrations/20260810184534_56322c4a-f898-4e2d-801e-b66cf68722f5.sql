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
  IF (h = 4 AND m >= 50) OR h IN (5, 6, 7) THEN
    target_h := 6;
  ELSIF m >= 50 THEN
    target_h := (h + 1) % 24;
  ELSE
    target_h := h;
  END IF;

  IF NOT (target_h >= 19 OR target_h <= 6) THEN
    RETURN 0;
  END IF;

  slot := lpad(target_h::text, 2, '0') || ':00';

  -- Per-table snapshot: written ONCE per slot, never overwritten afterwards.
  INSERT INTO public.table_drop_tracker (casino_id, table_id, date, time_slot, amount)
  SELECT t.casino_id, t.table_id, bdate, slot, sum(t.amount)::numeric
    FROM public.transactions t
   WHERE t.business_date = bdate
     AND t.table_id IS NOT NULL
     AND t.type IN ('in', 'buy')
     AND t.cancelled_at IS NULL
     AND t.created_at <= now()
   GROUP BY t.casino_id, t.table_id
  ON CONFLICT (table_id, date, time_slot) DO NOTHING;

  -- Casino TOTAL snapshot (table_id IS NULL): also written once per slot.
  WITH ins AS (
    INSERT INTO public.table_drop_tracker (casino_id, table_id, date, time_slot, amount)
    SELECT c.casino_id, NULL, bdate, slot, c.amount
      FROM (
        SELECT p.casino_id, sum(p.peak)::numeric AS amount
          FROM public.player_day_drop_cache p
         WHERE p.business_date = bdate
         GROUP BY p.casino_id
      ) c
    ON CONFLICT (casino_id, date, time_slot) WHERE table_id IS NULL
    DO NOTHING
    RETURNING 1
  )
  SELECT count(*)::int INTO written FROM ins;

  RETURN written;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_table_drop_slot() TO authenticated, service_role;