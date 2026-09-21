CREATE OR REPLACE FUNCTION public.close_business_day(_casino_id uuid, _method text, _force_close_cycles boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_tables numeric;
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

    -- Boss Monthly Report counts a day only when a fin_day_closing row exists.
    -- The row must therefore exist for EVERY closed day, regardless of whether
    -- ACE delivered slot figures in time and regardless of the manager's lock
    -- (`locked_at` is intentionally left NULL so the manager still confirms).
    -- Table result is seeded from the day's table shifts; slot fields stay 0
    -- and are later overwritten by ACE or manual entry.
    BEGIN
      SELECT COALESCE(SUM(s.tables_result), 0) INTO v_tables
        FROM public.shifts s
       WHERE s.casino_id = _casino_id
         AND public.business_date_of(s.opened_at) = v_today;

      INSERT INTO public.fin_day_closing(casino_id, business_date, tables_result)
      VALUES (_casino_id, v_today, COALESCE(v_tables, 0))
      ON CONFLICT (casino_id, business_date) DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

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
$function$;