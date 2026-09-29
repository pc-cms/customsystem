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
  v_in numeric := 0;
  v_out numeric := 0;
  v_manual boolean := false;
  v_manual_jp boolean := false;
  v_jp_allowed boolean := true;
BEGIN
  IF _casino_id IS NULL OR _business_date IS NULL THEN
    RAISE EXCEPTION 'casino_id and business_date are required';
  END IF;

  -- Serialize redundant collectors for this casino/day, including first insert.
  PERFORM pg_advisory_xact_lock(hashtextextended('ace-closing:' || _casino_id::text || ':' || _business_date::text, 0));

  SELECT COALESCE(SUM(COALESCE(s.tables_result,0)),0)
    INTO v_tables_result
    FROM public.shifts s
   WHERE s.casino_id = _casino_id
     AND public.business_date_of(s.opened_at) = _business_date;

  SELECT COALESCE(d.cashdesk_in,0), COALESCE(d.cashdesk_out,0), d.closed_by IS NOT NULL
    INTO v_in, v_out, v_manual
    FROM public.fin_day_closing d
   WHERE d.casino_id = _casino_id AND d.business_date = _business_date
   FOR UPDATE;
  v_manual := COALESCE(v_manual, false);
  v_in := COALESCE(v_in,0);
  v_out := COALESCE(v_out,0);

  INSERT INTO public.fin_day_closing AS d (
    casino_id, business_date, drop_slots, net_win, cashdesk_win, cashdesk_win_base,
    tables_result, slots_result, players_card_balance, ace_provisional
  ) VALUES (
    _casino_id, _business_date, _drop_slots, _net_win, _cashdesk_win + v_out - v_in, _cashdesk_win,
    v_tables_result, _net_win, _client_balance, false
  )
  ON CONFLICT (casino_id, business_date) DO UPDATE SET
    drop_slots = CASE WHEN d.closed_by IS NOT NULL THEN d.drop_slots ELSE EXCLUDED.drop_slots END,
    net_win = CASE WHEN d.closed_by IS NOT NULL THEN COALESCE(NULLIF(d.net_win,0), EXCLUDED.net_win) ELSE EXCLUDED.net_win END,
    cashdesk_win_base = CASE WHEN d.closed_by IS NOT NULL THEN d.cashdesk_win_base ELSE EXCLUDED.cashdesk_win_base END,
    cashdesk_win = CASE WHEN d.closed_by IS NOT NULL THEN d.cashdesk_win ELSE COALESCE(EXCLUDED.cashdesk_win_base,0) + COALESCE(d.cashdesk_out,0) - COALESCE(d.cashdesk_in,0) END,
    tables_result = CASE WHEN d.closed_by IS NOT NULL THEN d.tables_result WHEN v_tables_result <> 0 THEN v_tables_result
                         ELSE COALESCE(NULLIF(d.tables_result, 0), v_tables_result) END,
    slots_result = CASE WHEN d.closed_by IS NOT NULL THEN COALESCE(NULLIF(d.slots_result,0), EXCLUDED.slots_result) ELSE EXCLUDED.slots_result END,
    players_card_balance = CASE WHEN d.closed_by IS NOT NULL THEN d.players_card_balance ELSE EXCLUDED.players_card_balance END,
    ace_provisional = false,
    updated_at = now()
  RETURNING d.closed_by IS NOT NULL INTO v_manual;

  -- Manual JP (including Day Closings) is authoritative. Never repost it.
  SELECT EXISTS (SELECT 1 FROM public.fin_other_incomes oi
    WHERE oi.casino_id=_casino_id AND oi.business_date=_business_date
      AND oi.source='jp' AND (COALESCE(oi.note,'') LIKE 'JP · Day Closings%' OR COALESCE(oi.note,'') LIKE 'JP · Close Day%')
      AND oi.reversed_by_id IS NULL AND oi.reverses_id IS NULL
  ) INTO v_manual_jp;

  -- Into a manager-closed day ACE may write JP only until 12:30 EAT.
  -- After 12:30 EAT a closed day is final: ACE JP is skipped entirely.
  IF v_manual AND (now() AT TIME ZONE 'Africa/Dar_es_Salaam')::time >= time '12:30' THEN
    v_jp_allowed := false;
  END IF;

  IF _jp_in IS NOT NULL AND NOT v_manual_jp AND v_jp_allowed THEN
    SELECT COALESCE(SUM(oi.amount),0) INTO v_jp_posted
      FROM public.fin_other_incomes oi
     WHERE oi.casino_id = _casino_id
       AND oi.business_date = _business_date
       AND oi.source = 'jp'
       AND COALESCE(oi.currency,'TZS') = 'TZS'
       AND COALESCE(oi.note,'') LIKE 'JP · ACE%'
       AND oi.reversed_by_id IS NULL AND oi.reverses_id IS NULL;

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
                            'jp_target', _jp_in, 'jp_delta', v_jp_delta,
                            'manual_fields_preserved', v_manual,
                            'manual_jp_preserved', v_manual OR v_manual_jp,
                            'jp_blocked_after_1230', NOT v_jp_allowed);
END;
$function$;