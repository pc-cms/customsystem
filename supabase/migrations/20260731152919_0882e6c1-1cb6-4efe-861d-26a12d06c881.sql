DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT * FROM public.table_tracker
     WHERE date = DATE '2026-07-31' AND time_slot = '05:00'
  LOOP
    DELETE FROM public.table_tracker
     WHERE table_id = r.table_id AND date = DATE '2026-07-30' AND time_slot = '05:00';
    UPDATE public.table_tracker SET date = DATE '2026-07-30' WHERE id = r.id;
  END LOOP;
END $$;