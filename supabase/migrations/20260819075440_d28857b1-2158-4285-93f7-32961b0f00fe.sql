CREATE OR REPLACE FUNCTION public.force_close_business_day_0800()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_now timestamptz := now();
  v_hour int := EXTRACT(HOUR FROM (now() AT TIME ZONE 'Africa/Dar_es_Salaam'))::int;
  v_yesterday date := (now() AT TIME ZONE 'Africa/Dar_es_Salaam')::date - 1;
  v_grace boolean;
  v_c record;
  v_res jsonb := '[]'::jsonb;
  v_cage int;
  v_shift int;
  v_sessions int;
  v_visits int;
  v_day jsonb;
  v_err text;
  v_waiting int := 0;
BEGIN
  -- Business day rolls over at 07:00 EAT. Between 07:00 and 11:59 we close only
  -- casinos whose ACE closed report for yesterday has already arrived (grace
  -- window). From 12:00 the close is unconditional.
  IF v_hour < 7 THEN
    RETURN jsonb_build_object('status','skipped','hour',v_hour);
  END IF;
  v_grace := (v_hour BETWEEN 7 AND 11);

  PERFORM set_config('app.force_close_shift', 'on', true);

  FOR v_c IN
    SELECT c.id AS casino_id, c.name
    FROM public.casinos c
    WHERE NOT EXISTS (
      SELECT 1 FROM public.business_day_closures b
      WHERE b.casino_id = c.id AND b.business_date = v_yesterday
    )
  LOOP
    -- In the grace window skip casinos that run an ACE collector but have not
    -- delivered the closed report for yesterday yet.
    IF v_grace
       AND EXISTS (SELECT 1 FROM public.ace_ingest_keys k
                    WHERE k.casino_id = v_c.casino_id AND k.is_active)
       AND NOT EXISTS (SELECT 1 FROM public.ace_finance_snapshots s
                        WHERE s.casino_id = v_c.casino_id
                          AND s.period_id <> 0
                          AND s.business_date = v_yesterday)
    THEN
      v_waiting := v_waiting + 1;
      CONTINUE;
    END IF;

    BEGIN
      WITH upd AS (
        UPDATE public.cage_slots_shifts
           SET status = 'closed',
               closed_at = COALESCE(closed_at, v_now),
               updated_at = v_now
         WHERE casino_id = v_c.casino_id
           AND business_date = v_yesterday
           AND status NOT IN ('closed','reversed')
        RETURNING id
      ) SELECT count(*) INTO v_cage FROM upd;

      WITH upd AS (
        UPDATE public.shifts
           SET status = 'closed',
               closed_at = v_now,
               notes = COALESCE(NULLIF(notes,''),'') ||
                       CASE WHEN COALESCE(notes,'') = '' THEN '' ELSE E'\n' END ||
                       '[FORCED AUTO-CLOSE — no manual Close Day]'
         WHERE casino_id = v_c.casino_id
           AND status = 'open'
        RETURNING id
      ) SELECT count(*) INTO v_shift FROM upd;

      WITH upd AS (
        UPDATE public.client_sessions
           SET stopped_at = v_now,
               duration_minutes = GREATEST(0, EXTRACT(EPOCH FROM (v_now - started_at))::int / 60)
         WHERE casino_id = v_c.casino_id
           AND stopped_at IS NULL
        RETURNING id
      ) SELECT count(*) INTO v_sessions FROM upd;

      WITH upd AS (
        UPDATE public.casino_visits
           SET checked_out_at = v_now
         WHERE casino_id = v_c.casino_id
           AND checked_out_at IS NULL
        RETURNING id
      ) SELECT count(*) INTO v_visits FROM upd;

      v_day := public.close_business_day(v_c.casino_id, 'auto_0800'::text, true);

      v_res := v_res || jsonb_build_object(
        'casino', v_c.name,
        'grace', v_grace,
        'cage_shifts_closed', v_cage,
        'table_shifts_closed', v_shift,
        'sessions_closed', v_sessions,
        'visits_closed', v_visits,
        'day', v_day
      );
    EXCEPTION WHEN OTHERS THEN
      v_err := SQLERRM;
      v_res := v_res || jsonb_build_object('casino', v_c.name, 'error', v_err);
      INSERT INTO public.cron_run_log(job_name, status, details)
      VALUES ('force_close_business_day_0800','error',
              jsonb_build_object('casino', v_c.name, 'business_date', v_yesterday, 'error', v_err));
    END;
  END LOOP;

  PERFORM set_config('app.force_close_shift', 'off', true);

  IF jsonb_array_length(v_res) > 0 OR NOT v_grace THEN
    INSERT INTO public.cron_run_log(job_name, status, details)
    VALUES ('force_close_business_day_0800','ok',
            jsonb_build_object('business_date', v_yesterday, 'grace', v_grace,
                               'waiting_for_ace', v_waiting, 'results', v_res));
  END IF;

  RETURN jsonb_build_object('status','ok','business_date',v_yesterday,
                            'grace',v_grace,'waiting_for_ace',v_waiting,'results',v_res);
END;
$function$;