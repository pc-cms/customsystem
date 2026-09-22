-- Global rule (all casinos): when the business day closes and no ACE closed
-- report exists yet, seed the day's slot figures from the LAST live ACE
-- snapshot taken before the rollover. They stay frozen until a real closed
-- ACE report (or manual entry) replaces them.
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
  v_live record;
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
    -- Table result is seeded from the day's table shifts. Slot fields are
    -- seeded from the last live ACE snapshot captured BEFORE the rollover
    -- (provisional) so the day is never left at zero; a later closed ACE report
    -- or manual entry overwrites them.
    BEGIN
      SELECT COALESCE(SUM(s.tables_result), 0) INTO v_tables
        FROM public.shifts s
       WHERE s.casino_id = _casino_id
         AND public.business_date_of(s.opened_at) = v_today;

      SELECT s.total_drop, s.win_cashdesk, s.cashless_money_difference
        INTO v_live
        FROM public.ace_finance_snapshots s
       WHERE s.casino_id = _casino_id
         AND s.period_id = 0
         AND s.received_at > now() - interval '90 minutes'
         AND NOT EXISTS (
               SELECT 1 FROM public.ace_finance_snapshots a
                WHERE a.casino_id = _casino_id
                  AND a.period_id > 0
                  AND a.business_date = v_today
                  AND a.apply_status = 'applied')
       LIMIT 1;

      INSERT INTO public.fin_day_closing(
        casino_id, business_date, tables_result,
        drop_slots, cashdesk_win_base, cashdesk_win, players_card_balance,
        ace_provisional
      )
      VALUES (
        _casino_id, v_today, COALESCE(v_tables, 0),
        COALESCE(v_live.total_drop, 0),
        COALESCE(v_live.win_cashdesk, 0),
        COALESCE(v_live.win_cashdesk, 0),
        COALESCE(v_live.cashless_money_difference, 0),
        v_live IS NOT NULL
      )
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

-- Provisional seeding may only run during the rollover hour (07:00 EAT).
-- Later in the day the live ACE counter already belongs to the NEW business
-- day, so writing it into yesterday's row corrupts the closed day.
CREATE OR REPLACE FUNCTION public.ace_seed_provisional_day_closing()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_eat timestamp := (now() AT TIME ZONE 'Africa/Dar_es_Salaam');
  v_hour int := EXTRACT(HOUR FROM v_eat)::int;
  v_date date := v_eat::date - 1;
  v_r record;
  v_tables numeric;
  v_seeded int := 0;
  v_list jsonb := '[]'::jsonb;
BEGIN
  IF v_hour <> 7 THEN
    RETURN jsonb_build_object('status', 'skipped', 'hour', v_hour);
  END IF;

  FOR v_r IN
    SELECT s.casino_id,
           s.total_drop,
           s.net_win,
           s.win_cashdesk,
           s.cashless_money_difference
      FROM public.ace_finance_snapshots s
     WHERE s.period_id = 0
       AND s.casino_id IS NOT NULL
       AND s.received_at > now() - interval '90 minutes'
       AND NOT EXISTS (
             SELECT 1 FROM public.ace_finance_snapshots a
              WHERE a.casino_id = s.casino_id
                AND a.period_id > 0
                AND a.business_date = v_date
                AND a.apply_status = 'applied')
       AND NOT EXISTS (
             SELECT 1 FROM public.fin_day_closing d
              WHERE d.casino_id = s.casino_id
                AND d.business_date = v_date
                AND d.ace_provisional = false)
  LOOP
    SELECT COALESCE(SUM(COALESCE(sh.tables_result, 0)), 0)
      INTO v_tables
      FROM public.shifts sh
     WHERE sh.casino_id = v_r.casino_id
       AND public.business_date_of(sh.opened_at) = v_date;

    INSERT INTO public.fin_day_closing AS d (
      casino_id, business_date, drop_slots, cashdesk_win, cashdesk_win_base,
      tables_result, players_card_balance, ace_provisional
    ) VALUES (
      v_r.casino_id, v_date,
      COALESCE(v_r.total_drop, 0), COALESCE(v_r.win_cashdesk, 0), COALESCE(v_r.win_cashdesk, 0),
      v_tables, COALESCE(v_r.cashless_money_difference, 0), true
    )
    ON CONFLICT (casino_id, business_date) DO UPDATE SET
      drop_slots = EXCLUDED.drop_slots,
      cashdesk_win_base = EXCLUDED.cashdesk_win_base,
      cashdesk_win = COALESCE(EXCLUDED.cashdesk_win_base,0) + COALESCE(d.cashdesk_out,0) - COALESCE(d.cashdesk_in,0),
      tables_result = CASE WHEN EXCLUDED.tables_result <> 0 THEN EXCLUDED.tables_result
                           ELSE d.tables_result END,
      players_card_balance = EXCLUDED.players_card_balance,
      ace_provisional = true,
      updated_at = now()
    WHERE d.ace_provisional = true;

    v_seeded := v_seeded + 1;
    v_list := v_list || jsonb_build_object('casino_id', v_r.casino_id, 'drop', v_r.total_drop);
  END LOOP;

  INSERT INTO public.cron_run_log(job_name, status, details)
  VALUES ('ace_seed_provisional_day_closing', 'ok',
          jsonb_build_object('business_date', v_date, 'seeded', v_seeded, 'rows', v_list));

  RETURN jsonb_build_object('business_date', v_date, 'seeded', v_seeded);
END;
$function$;