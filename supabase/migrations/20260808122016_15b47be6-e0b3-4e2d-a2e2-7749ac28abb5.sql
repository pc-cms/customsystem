CREATE OR REPLACE FUNCTION public.tg_tdr_to_tracker_final()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_by uuid;
BEGIN
  IF current_setting('cms.applying_sync', true) = 'true' THEN
    RETURN NULL;
  END IF;

  IF NEW.result IS NULL OR NEW.table_id IS NULL THEN
    RETURN NULL;
  END IF;

  v_by := COALESCE(
    NEW.created_by,
    auth.uid(),
    (SELECT tt.recorded_by FROM public.table_tracker tt
      WHERE tt.table_id = NEW.table_id AND tt.date = NEW.date
      ORDER BY tt.created_at DESC LIMIT 1)
  );

  IF v_by IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.table_tracker
    (casino_id, table_id, date, time_slot, value, recorded_by)
  VALUES
    (NEW.casino_id, NEW.table_id, NEW.date, '06:00', NEW.result, v_by)
  ON CONFLICT (table_id, date, time_slot)
  DO UPDATE SET value = EXCLUDED.value;

  RETURN NULL;
END;
$function$;
