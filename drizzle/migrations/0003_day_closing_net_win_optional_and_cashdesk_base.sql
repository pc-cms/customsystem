CREATE OR REPLACE FUNCTION public.close_business_day_with_figures(
  _casino_id uuid,
  _drop_slots numeric,
  _net_win numeric,
  _cashdesk_win numeric,
  _client_balance numeric,
  _notes text DEFAULT NULL::text,
  _jp_in numeric DEFAULT NULL::numeric,
  _business_date date DEFAULT NULL::date
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_user uuid := auth.uid();
  v_today date;
  v_open jsonb;
  v_res jsonb;
  v_tables_result numeric := 0;
  v_jp_posted numeric := 0;
  v_jp_delta numeric := 0;
  v_jp_wallet uuid;
  v_already boolean;
  v_in numeric := 0;
  v_out numeric := 0;
BEGIN
  IF NOT (public.is_manager_op(v_user) OR public.has_role(v_user,'pit'::app_role)) THEN
    RAISE EXCEPTION 'Insufficient privileges to close business day';
  END IF;

  -- Net Win is no longer entered at Close Day (ACE Collector / Statistics own it).
  IF _drop_slots IS NULL OR _cashdesk_win IS NULL OR _client_balance IS NULL THEN
    RETURN jsonb_build_object('status','figures_required');
  END IF;

  v_today := COALESCE(_business_date, public.get_current_business_date(_casino_id));

  IF v_today > public.get_current_business_date(_casino_id) THEN
    RETURN jsonb_build_object('status','future_date','business_date',v_today);
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.business_day_closures
                 WHERE casino_id = _casino_id AND business_date = v_today)
    INTO v_already;

  IF NOT v_already THEN
    v_open := public.list_open_cycles_for_day(_casino_id);
    IF jsonb_array_length(COALESCE(v_open->'open_cage_shifts','[]'::jsonb)) > 0
       OR jsonb_array_length(COALESCE(v_open->'open_slots_shifts','[]'::jsonb)) > 0
       OR jsonb_array_length(COALESCE(v_open->'open_tables','[]'::jsonb)) > 0
       OR jsonb_array_length(COALESCE(v_open->'active_sessions','[]'::jsonb)) > 0
       OR jsonb_array_length(COALESCE(v_open->'open_visits','[]'::jsonb)) > 0 THEN
      RETURN jsonb_build_object('status','has_open_cycles','business_date',v_today,'open',v_open);
    END IF;
  END IF;

  SELECT COALESCE(SUM(COALESCE(s.tables_result,0)),0)
    INTO v_tables_result
    FROM public.shifts s
   WHERE s.casino_id = _casino_id
     AND public.business_date_of(s.opened_at) = v_today;

  SELECT COALESCE(d.cashdesk_in,0), COALESCE(d.cashdesk_out,0)
    INTO v_in, v_out
    FROM public.fin_day_closing d
   WHERE d.casino_id = _casino_id AND d.business_date = v_today;
  v_in := COALESCE(v_in,0);
  v_out := COALESCE(v_out,0);

  INSERT INTO public.fin_day_closing AS d (
    casino_id, business_date, drop_slots, net_win, cashdesk_win, cashdesk_win_base,
    slots_result, tables_result, players_card_balance, notes, closed_by
  ) VALUES (
    _casino_id, v_today, _drop_slots, _net_win, _cashdesk_win + v_out - v_in, _cashdesk_win,
    _net_win, v_tables_result, _client_balance, _notes, v_user
  )
  ON CONFLICT (casino_id, business_date) DO UPDATE SET
    drop_slots = EXCLUDED.drop_slots,
    net_win = COALESCE(EXCLUDED.net_win, d.net_win),
    cashdesk_win_base = EXCLUDED.cashdesk_win_base,
    cashdesk_win = COALESCE(EXCLUDED.cashdesk_win_base,0) + COALESCE(d.cashdesk_out,0) - COALESCE(d.cashdesk_in,0),
    slots_result = COALESCE(EXCLUDED.slots_result, d.slots_result),
    tables_result = EXCLUDED.tables_result,
    players_card_balance = EXCLUDED.players_card_balance,
    notes = COALESCE(EXCLUDED.notes, d.notes),
    closed_by = EXCLUDED.closed_by,
    updated_at = now();

  IF _jp_in IS NOT NULL AND _jp_in <> 0 THEN
    SELECT COALESCE(SUM(oi.amount),0) INTO v_jp_posted
      FROM public.fin_other_incomes oi
     WHERE oi.casino_id = _casino_id
       AND oi.business_date = v_today
       AND oi.source = 'jp';

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

      INSERT INTO public.fin_other_incomes
        (casino_id, business_date, wallet_id, source, currency, amount, fx_rate, note, created_by)
      VALUES
        (_casino_id, v_today, v_jp_wallet, 'jp', 'TZS', v_jp_delta, 1, 'JP · Close Day', v_user);
    END IF;
  END IF;

  IF v_already THEN
    RETURN jsonb_build_object(
      'status','figures_saved',
      'business_date', v_today,
      'figures_saved', true,
      'tables_result', v_tables_result
    );
  END IF;

  v_res := public.close_business_day(_casino_id, 'manual', false);
  RETURN v_res || jsonb_build_object(
    'figures_saved', true,
    'business_date', v_today,
    'tables_result', v_tables_result
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.ace_apply_closed_report(
  _casino_id uuid,
  _business_date date,
  _drop_slots numeric,
  _net_win numeric,
  _cashdesk_win numeric,
  _client_balance numeric,
  _jp_in numeric DEFAULT NULL::numeric
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_tables_result numeric := 0;
  v_jp_posted numeric := 0;
  v_jp_delta numeric := 0;
  v_jp_wallet uuid;
  v_user uuid;
  v_in numeric := 0;
  v_out numeric := 0;
BEGIN
  IF _casino_id IS NULL OR _business_date IS NULL THEN
    RAISE EXCEPTION 'casino_id and business_date are required';
  END IF;

  SELECT COALESCE(SUM(COALESCE(s.tables_result,0)),0)
    INTO v_tables_result
    FROM public.shifts s
   WHERE s.casino_id = _casino_id
     AND public.business_date_of(s.opened_at) = _business_date;

  SELECT COALESCE(d.cashdesk_in,0), COALESCE(d.cashdesk_out,0)
    INTO v_in, v_out
    FROM public.fin_day_closing d
   WHERE d.casino_id = _casino_id AND d.business_date = _business_date;
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
    drop_slots = EXCLUDED.drop_slots,
    net_win = EXCLUDED.net_win,
    cashdesk_win_base = EXCLUDED.cashdesk_win_base,
    cashdesk_win = COALESCE(EXCLUDED.cashdesk_win_base,0) + COALESCE(d.cashdesk_out,0) - COALESCE(d.cashdesk_in,0),
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
$fn$;