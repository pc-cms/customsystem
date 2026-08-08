-- 1) Bridge: final window writes to 06:00 (Final) instead of 05:00
CREATE OR REPLACE FUNCTION public.bridge_chip_snapshot_to_tracker()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r record;
BEGIN
  IF current_setting('cms.applying_sync', true) = 'true' THEN
    RETURN NULL;
  END IF;

  FOR r IN
    WITH new_table_rows AS (
      SELECT casino_id, location_id, date, recorded_by, created_at,
             denomination, actual_quantity, expected_quantity
        FROM new_rows
       WHERE location_type = 'table' AND location_id IS NOT NULL
    ),
    latest AS (
      SELECT casino_id, location_id, date, max(created_at) AS latest_ts
        FROM new_table_rows
       GROUP BY casino_id, location_id, date
    ),
    batch AS (
      SELECT n.casino_id, n.location_id, n.date, n.recorded_by, n.created_at,
             sum((n.actual_quantity - n.expected_quantity) * n.denomination)::numeric AS result
        FROM new_table_rows n
        JOIN latest l
          ON l.casino_id = n.casino_id
         AND l.location_id = n.location_id
         AND l.date = n.date
         AND l.latest_ts = n.created_at
       GROUP BY n.casino_id, n.location_id, n.date, n.recorded_by, n.created_at
    )
    SELECT * FROM batch
  LOOP
    DECLARE
      ts_eat   timestamp := (r.created_at AT TIME ZONE 'Africa/Dar_es_Salaam');
      h        int       := extract(hour   from ts_eat)::int;
      m        int       := extract(minute from ts_eat)::int;
      final_w  boolean   := (h = 4 AND m >= 50) OR h IN (5,6,7);
      target_h int;
      only_if_empty boolean;
      slot text;
    BEGIN
      IF final_w THEN
        target_h := 6; only_if_empty := false;
      ELSIF m >= 50 THEN
        target_h := (h + 1) % 24; only_if_empty := false;
      ELSIF m <= 10 THEN
        target_h := h; only_if_empty := false;
      ELSE
        target_h := h; only_if_empty := true;
      END IF;

      IF NOT (target_h BETWEEN 19 AND 23 OR target_h BETWEEN 0 AND 4 OR final_w) THEN
        CONTINUE;
      END IF;

      slot := lpad(target_h::text, 2, '0') || ':00';

      IF only_if_empty THEN
        INSERT INTO public.table_tracker
          (casino_id, table_id, date, time_slot, value, recorded_by)
        VALUES
          (r.casino_id, r.location_id, r.date, slot, r.result, r.recorded_by)
        ON CONFLICT (table_id, date, time_slot) DO NOTHING;
      ELSE
        INSERT INTO public.table_tracker
          (casino_id, table_id, date, time_slot, value, recorded_by)
        VALUES
          (r.casino_id, r.location_id, r.date, slot, r.result, r.recorded_by)
        ON CONFLICT (table_id, date, time_slot)
        DO UPDATE SET value = EXCLUDED.value, recorded_by = EXCLUDED.recorded_by;
      END IF;
    END;
  END LOOP;

  RETURN NULL;
END;
$function$;

-- 2) Closing result per table -> Final slot (06:00)
CREATE OR REPLACE FUNCTION public.tg_tdr_to_tracker_final()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF current_setting('cms.applying_sync', true) = 'true' THEN
    RETURN NULL;
  END IF;

  IF NEW.result IS NULL OR NEW.table_id IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.table_tracker
    (casino_id, table_id, date, time_slot, value, recorded_by)
  VALUES
    (NEW.casino_id, NEW.table_id, NEW.date, '06:00', NEW.result, NEW.created_by)
  ON CONFLICT (table_id, date, time_slot)
  DO UPDATE SET value = EXCLUDED.value,
                recorded_by = COALESCE(EXCLUDED.recorded_by, public.table_tracker.recorded_by);

  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS trg_tdr_to_tracker_final ON public.table_daily_results;
CREATE TRIGGER trg_tdr_to_tracker_final
AFTER INSERT OR UPDATE OF result ON public.table_daily_results
FOR EACH ROW EXECUTE FUNCTION public.tg_tdr_to_tracker_final();
