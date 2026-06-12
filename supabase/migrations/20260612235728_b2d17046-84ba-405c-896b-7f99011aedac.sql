CREATE OR REPLACE FUNCTION public.ensure_visit_on_transaction()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_today date;
  v_existing uuid;
BEGIN
  -- Tips (live/poker/floor) and any other transaction without a player
  -- are not visits — skip visit upsert entirely.
  IF NEW.player_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_today := (
    CASE
      WHEN EXTRACT(HOUR FROM (now() AT TIME ZONE 'Africa/Dar_es_Salaam')) < 5
        THEN ((now() AT TIME ZONE 'Africa/Dar_es_Salaam')::date - 1)
      ELSE (now() AT TIME ZONE 'Africa/Dar_es_Salaam')::date
    END
  );

  SELECT id INTO v_existing
    FROM public.casino_visits
   WHERE casino_id = NEW.casino_id
     AND player_id = NEW.player_id
     AND date = v_today
   LIMIT 1;

  IF v_existing IS NULL THEN
    INSERT INTO public.casino_visits (casino_id, player_id, date, checked_in_by, checked_in_at, position)
    VALUES (NEW.casino_id, NEW.player_id, v_today, NEW.operator_id, now(), 'hall');
  ELSE
    UPDATE public.casino_visits
       SET checked_out_at = NULL
     WHERE id = v_existing
       AND checked_out_at IS NOT NULL;
  END IF;

  RETURN NEW;
END;
$function$;