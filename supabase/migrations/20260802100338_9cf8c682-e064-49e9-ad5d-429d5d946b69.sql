CREATE OR REPLACE FUNCTION public.ensure_visit_on_session_start()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_today date;
  v_existing uuid;
BEGIN
  -- Business date with unified 07:00 rollover (Africa/Dar_es_Salaam)
  v_today := public.business_date_of(now());

  SELECT id INTO v_existing
    FROM public.casino_visits
   WHERE casino_id = NEW.casino_id
     AND player_id = NEW.player_id
     AND date = v_today
   LIMIT 1;

  IF v_existing IS NULL THEN
    INSERT INTO public.casino_visits (casino_id, player_id, date, checked_in_by, checked_in_at, position)
    VALUES (NEW.casino_id, NEW.player_id, v_today, NEW.created_by, now(), 'table');
  ELSE
    UPDATE public.casino_visits
       SET checked_out_at = NULL,
           position = 'table'
     WHERE id = v_existing;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_populate_daily_results_on_shift_close()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_date date;
BEGIN
  IF NEW.status = 'closed' AND (OLD.status IS DISTINCT FROM 'closed') THEN
    v_date := public.business_date_of(NEW.opened_at);
    PERFORM public.populate_table_daily_results_for_day(NEW.casino_id, v_date, NULL);
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.close_open_sessions_5am()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _eat timestamp := (now() AT TIME ZONE 'Africa/Dar_es_Salaam');
  _hour int := EXTRACT(HOUR FROM _eat)::int;
  v_sessions int := 0; v_visits int := 0;
BEGIN
  -- Shift now runs until 06:00; only auto-close from 07:00 (business-day rollover)
  IF _hour < 7 OR _hour >= 11 THEN
    RETURN jsonb_build_object('status','skipped','hour',_hour);
  END IF;

  WITH upd AS (
    UPDATE public.client_sessions SET stopped_at = now()
     WHERE stopped_at IS NULL RETURNING 1
  ) SELECT count(*) INTO v_sessions FROM upd;

  WITH upd AS (
    UPDATE public.casino_visits
       SET checked_out_at = now(), position = 'hall'
     WHERE checked_out_at IS NULL RETURNING 1
  ) SELECT count(*) INTO v_visits FROM upd;

  INSERT INTO public.cron_run_log(job_name, status, duration_ms, details)
  VALUES('close_open_sessions_5am','ok',0, jsonb_build_object('sessions',v_sessions,'visits',v_visits));

  RETURN jsonb_build_object('status','ok','sessions',v_sessions,'visits',v_visits);
END;
$function$;