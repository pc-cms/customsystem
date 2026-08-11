-- 1) Escape hatch for forced closing (used by the 08:00 auto-close)
CREATE OR REPLACE FUNCTION public.trg_block_shift_close_if_tables_open()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_open_count int;
  v_names text;
BEGIN
  IF OLD.status = 'open' AND NEW.status = 'closed'
     AND COALESCE(current_setting('app.force_close_shift', true), '') <> 'on' THEN
    SELECT count(*),
           string_agg(gt.name, ', ' ORDER BY gt.name)
    INTO v_open_count, v_names
    FROM gaming_tables gt
    WHERE gt.casino_id = NEW.casino_id
      AND gt.is_archived = false
      AND gt.closing_result IS NULL;

    IF v_open_count > 0 THEN
      RAISE EXCEPTION 'Cannot close shift: % table(s) still open: %', v_open_count, v_names
        USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- 2) close_business_day: treat auto_0800 like auto_11am (closes YESTERDAY)
CREATE OR REPLACE FUNCTION public.close_business_day(_casino_id uuid, _method text, _force_close_cycles boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date;
  v_existing public.business_day_closures%ROWTYPE;
  v_snapshot jsonb;
  v_user uuid;
  v_lock_id uuid;
  v_open jsonb;
  v_finalize jsonb;
  v_avg_finalize jsonb;
  v_reset jsonb;
BEGIN
  v_user := auth.uid();

  IF _method IN ('auto_11am', 'auto_0800') THEN
    v_today := ((now() AT TIME ZONE 'Africa/Dar_es_Salaam')::date - 1);
  ELSE
    v_today := public.get_current_business_date(_casino_id);
  END IF;

  IF _method = 'manual' THEN
    IF NOT (public.is_manager_op(v_user)
         OR public.has_role(v_user, 'pit'::app_role)) THEN
      RAISE EXCEPTION 'Insufficient privileges to close business day';
    END IF;
  END IF;

  SELECT * INTO v_existing
  FROM public.business_day_closures
  WHERE casino_id = _casino_id AND business_date = v_today;

  IF FOUND THEN
    RETURN jsonb_build_object('status','already_closed','business_date',v_today);
  END IF;

  v_open := public.list_open_cycles_for_day(_casino_id);

  IF _method = 'manual' AND NOT _force_close_cycles THEN
    IF jsonb_array_length(COALESCE(v_open->'open_cage_shifts','[]'::jsonb)) > 0
       OR jsonb_array_length(COALESCE(v_open->'active_sessions','[]'::jsonb)) > 0
       OR jsonb_array_length(COALESCE(v_open->'open_visits','[]'::jsonb)) > 0 THEN
      RETURN jsonb_build_object(
        'status','has_open_cycles',
        'business_date', v_today,
        'open', v_open
      );
    END IF;
  END IF;

  INSERT INTO public.system_locks(casino_id, reason, locked_until, created_by)
  VALUES (_casino_id, 'business_day_rollover', now() + interval '90 seconds', v_user)
  RETURNING id INTO v_lock_id;

  BEGIN
    v_finalize := jsonb_build_object('forced', _force_close_cycles);

    BEGIN
      v_avg_finalize := public.finalize_player_daily_avg_bets(_casino_id, v_today);
    EXCEPTION WHEN OTHERS THEN
      v_avg_finalize := jsonb_build_object('error', SQLERRM);
    END;

    v_snapshot := public.build_business_day_snapshot(_casino_id, v_today);

    INSERT INTO public.business_day_closures(
      casino_id, business_date, closed_by, closed_method, snapshot
    ) VALUES (
      _casino_id, v_today, v_user, _method, v_snapshot
    );

    BEGIN
      v_reset := public.reset_operational_dashboards(_casino_id);
    EXCEPTION WHEN OTHERS THEN
      v_reset := jsonb_build_object('error', SQLERRM);
    END;

    DELETE FROM public.system_locks WHERE id = v_lock_id;
  EXCEPTION WHEN OTHERS THEN
    DELETE FROM public.system_locks WHERE id = v_lock_id;
    RAISE;
  END;

  RETURN jsonb_build_object(
    'status','closed',
    'business_date', v_today,
    'forced', _force_close_cycles,
    'finalize', v_finalize,
    'avg_bets_finalize', v_avg_finalize,
    'reset', v_reset
  );
END;
$$;

-- 3) Forced 08:00 EAT close: cages, table shifts, sessions, visits, business day
CREATE OR REPLACE FUNCTION public.force_close_business_day_0800()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
  v_eat timestamp := (now() AT TIME ZONE 'Africa/Dar_es_Salaam');
  v_hour int := EXTRACT(HOUR FROM (now() AT TIME ZONE 'Africa/Dar_es_Salaam'))::int;
  v_yesterday date := (now() AT TIME ZONE 'Africa/Dar_es_Salaam')::date - 1;
  v_c record;
  v_res jsonb := '[]'::jsonb;
  v_cage int;
  v_shift int;
  v_sessions int;
  v_visits int;
  v_day jsonb;
  v_err text;
BEGIN
  IF v_hour < 8 THEN
    RETURN jsonb_build_object('status','skipped','hour',v_hour);
  END IF;

  PERFORM set_config('app.force_close_shift', 'on', true);

  FOR v_c IN
    SELECT c.id AS casino_id, c.name
    FROM public.casinos c
    WHERE NOT EXISTS (
      SELECT 1 FROM public.business_day_closures b
      WHERE b.casino_id = c.id AND b.business_date = v_yesterday
    )
  LOOP
    BEGIN
      -- a) Cage slots shifts of that business day
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

      -- b) Table (cage) shift still open
      WITH upd AS (
        UPDATE public.shifts
           SET status = 'closed',
               closed_at = v_now,
               notes = COALESCE(NULLIF(notes,''),'') ||
                       CASE WHEN COALESCE(notes,'') = '' THEN '' ELSE E'\n' END ||
                       '[FORCED AUTO-CLOSE 08:00 — no manual Close Day]'
         WHERE casino_id = v_c.casino_id
           AND status = 'open'
        RETURNING id
      ) SELECT count(*) INTO v_shift FROM upd;

      -- c) Player sessions / visits
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

      -- d) Business day closure
      v_day := public.close_business_day(v_c.casino_id, 'auto_0800'::text, true);

      v_res := v_res || jsonb_build_object(
        'casino', v_c.name,
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

  INSERT INTO public.cron_run_log(job_name, status, details)
  VALUES ('force_close_business_day_0800','ok',
          jsonb_build_object('business_date', v_yesterday, 'results', v_res));

  RETURN jsonb_build_object('status','ok','business_date',v_yesterday,'results',v_res);
END;
$$;

REVOKE ALL ON FUNCTION public.force_close_business_day_0800() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.force_close_business_day_0800() TO service_role;