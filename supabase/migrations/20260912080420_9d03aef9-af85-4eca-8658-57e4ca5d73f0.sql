ALTER TABLE public.fin_day_closing
  ADD COLUMN IF NOT EXISTS ace_provisional boolean NOT NULL DEFAULT false;

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
  IF v_hour < 7 THEN
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
       AND s.received_at > now() - interval '60 minutes'
       -- real closed ACE report for that date must not exist yet
       AND NOT EXISTS (
             SELECT 1 FROM public.ace_finance_snapshots a
              WHERE a.casino_id = s.casino_id
                AND a.period_id > 0
                AND a.business_date = v_date
                AND a.apply_status = 'applied')
       -- never touch a real / manual day closing
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
      casino_id, business_date, drop_slots, net_win, cashdesk_win,
      tables_result, slots_result, players_card_balance, ace_provisional
    ) VALUES (
      v_r.casino_id, v_date,
      COALESCE(v_r.total_drop, 0), COALESCE(v_r.net_win, 0), COALESCE(v_r.win_cashdesk, 0),
      v_tables, COALESCE(v_r.net_win, 0), COALESCE(v_r.cashless_money_difference, 0), true
    )
    ON CONFLICT (casino_id, business_date) DO UPDATE SET
      drop_slots = EXCLUDED.drop_slots,
      net_win = EXCLUDED.net_win,
      cashdesk_win = EXCLUDED.cashdesk_win,
      tables_result = CASE WHEN EXCLUDED.tables_result <> 0 THEN EXCLUDED.tables_result
                           ELSE d.tables_result END,
      slots_result = EXCLUDED.slots_result,
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

CREATE OR REPLACE FUNCTION public.ace_apply_closed_report(_casino_id uuid, _business_date date, _drop_slots numeric, _net_win numeric, _cashdesk_win numeric, _client_balance numeric, _jp_in numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tables_result numeric := 0;
  v_jp_posted numeric := 0;
  v_jp_delta numeric := 0;
  v_jp_wallet uuid;
  v_user uuid;
BEGIN
  IF _casino_id IS NULL OR _business_date IS NULL THEN
    RAISE EXCEPTION 'casino_id and business_date are required';
  END IF;

  SELECT COALESCE(SUM(COALESCE(s.tables_result,0)),0)
    INTO v_tables_result
    FROM public.shifts s
   WHERE s.casino_id = _casino_id
     AND public.business_date_of(s.opened_at) = _business_date;

  INSERT INTO public.fin_day_closing AS d (
    casino_id, business_date, drop_slots, net_win, cashdesk_win,
    tables_result, slots_result, players_card_balance, ace_provisional
  ) VALUES (
    _casino_id, _business_date, _drop_slots, _net_win, _cashdesk_win,
    v_tables_result, _net_win, _client_balance, false
  )
  ON CONFLICT (casino_id, business_date) DO UPDATE SET
    drop_slots = EXCLUDED.drop_slots,
    net_win = EXCLUDED.net_win,
    cashdesk_win = EXCLUDED.cashdesk_win,
    tables_result = CASE WHEN v_tables_result <> 0 THEN v_tables_result
                         ELSE COALESCE(NULLIF(d.tables_result, 0), v_tables_result) END,
    slots_result = EXCLUDED.slots_result,
    players_card_balance = EXCLUDED.players_card_balance,
    ace_provisional = false,
    updated_at = now();

  IF _jp_in IS NOT NULL THEN
    SELECT COALESCE(SUM(oi.amount),0) INTO v_jp_posted
      FROM public.fin_other_incomes oi
     WHERE oi.casino_id = _casino_id
       AND oi.business_date = _business_date
       AND oi.source = 'jp'
       AND (oi.note LIKE 'JP · ACE%' OR oi.note LIKE 'JP · Close Day%');

    v_jp_delta := _jp_in - v_jp_posted;

    IF v_jp_delta <> 0 THEN
      SELECT w.id INTO v_jp_wallet
        FROM public.fin_wallets w
       WHERE w.casino_id = _casino_id
         AND COALESCE(w.currency,'TZS') = 'TZS'
         AND COALESCE(w.is_active, true)
       ORDER BY (w.kind = 'cash') DESC, w.created_at
       LIMIT 1;

      IF v_jp_wallet IS NULL THEN
        RAISE EXCEPTION 'No TZS wallet configured for JP';
      END IF;

      v_user := auth.uid();
      IF v_user IS NULL THEN
        SELECT p.user_id INTO v_user
          FROM public.profiles p
          JOIN public.user_roles ur ON ur.user_id = p.user_id AND ur.role = 'super_admin'
         WHERE p.disabled_at IS NULL
         ORDER BY (p.casino_id = _casino_id) DESC, p.created_at
         LIMIT 1;
      END IF;
      IF v_user IS NULL THEN
        RAISE EXCEPTION 'No system user available to record JP';
      END IF;

      INSERT INTO public.fin_other_incomes
        (casino_id, business_date, wallet_id, source, currency, amount, fx_rate, note, created_by)
      VALUES
        (_casino_id, _business_date, v_jp_wallet, 'jp', 'TZS', v_jp_delta, 1,
         CASE WHEN v_jp_posted = 0 THEN 'JP · ACE' ELSE 'JP · ACE correction' END, v_user);
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'business_date', _business_date,
                            'tables_result', v_tables_result,
                            'jp_target', _jp_in, 'jp_delta', v_jp_delta);
END;
$function$;