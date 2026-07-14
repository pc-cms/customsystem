DO $$
DECLARE
  v_casino uuid := '1d71e231-8ef9-40aa-bc5d-75274f4945d3';
  v_shift  uuid := '18dac58d-9845-4394-a9e6-d67b44515213';
  v_total  numeric := 0;
  v_opened_by uuid;
  r RECORD;
BEGIN
  SELECT opened_by INTO v_opened_by FROM public.shifts WHERE id = v_shift;

  -- Update each table with closing_chips + closing_result from latest snapshot per denom
  FOR r IN
    WITH latest AS (
      SELECT DISTINCT ON (location_id, denomination)
             location_id, denomination, expected_quantity, actual_quantity
      FROM public.chip_snapshots
      WHERE casino_id = v_casino
        AND location_type = 'table'
        AND date = '2026-07-13'
      ORDER BY location_id, denomination, created_at DESC
    )
    SELECT location_id AS table_id,
           jsonb_object_agg(denomination::text, actual_quantity) AS chips,
           SUM((actual_quantity - expected_quantity) * denomination)::numeric AS result
    FROM latest
    GROUP BY location_id
  LOOP
    UPDATE public.gaming_tables
       SET closing_chips = r.chips,
           closing_result = r.result
     WHERE id = r.table_id;
    v_total := v_total + COALESCE(r.result, 0);
  END LOOP;

  -- Close the shift
  UPDATE public.shifts
     SET status = 'closed',
         closed_at = now(),
         closed_by = COALESCE(closed_by, v_opened_by),
         tables_result = v_total,
         shift_result = v_total,
         notes = COALESCE(notes, '') ||
                 E'\n[FORCE-CLOSE by admin 2026-07-14 — chip counts recorded 14/07 01:39–01:47 UTC, dealers did not press Submit. Tables result = ' ||
                 v_total::text || ' TZS]'
   WHERE id = v_shift
     AND status = 'open';
END $$;