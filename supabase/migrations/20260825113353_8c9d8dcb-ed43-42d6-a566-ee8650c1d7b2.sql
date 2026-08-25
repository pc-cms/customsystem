CREATE OR REPLACE FUNCTION public.close_business_day_with_figures(_casino_id uuid, _drop_slots numeric, _net_win numeric, _cashdesk_win numeric, _client_balance numeric, _notes text DEFAULT NULL::text, _jp_in numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_today date;
  v_open jsonb;
  v_res jsonb;
  v_tables_result numeric := 0;
  v_slots_shift uuid;
  v_jp_posted numeric := 0;
  v_jp_delta numeric := 0;
  v_jp_wallet uuid;
BEGIN
  IF NOT (public.is_manager_op(v_user) OR public.has_role(v_user,'pit'::app_role)) THEN
    RAISE EXCEPTION 'Insufficient privileges to close business day';
  END IF;

  IF _drop_slots IS NULL OR _net_win IS NULL OR _cashdesk_win IS NULL OR _client_balance IS NULL THEN
    RETURN jsonb_build_object('status','figures_required');
  END IF;

  v_today := public.get_current_business_date(_casino_id);

  IF EXISTS (SELECT 1 FROM public.business_day_closures
             WHERE casino_id = _casino_id AND business_date = v_today) THEN
    RETURN jsonb_build_object('status','already_closed','business_date',v_today);
  END IF;

  v_open := public.list_open_cycles_for_day(_casino_id);
  IF jsonb_array_length(COALESCE(v_open->'open_cage_shifts','[]'::jsonb)) > 0
     OR jsonb_array_length(COALESCE(v_open->'open_slots_shifts','[]'::jsonb)) > 0
     OR jsonb_array_length(COALESCE(v_open->'open_tables','[]'::jsonb)) > 0
     OR jsonb_array_length(COALESCE(v_open->'active_sessions','[]'::jsonb)) > 0
     OR jsonb_array_length(COALESCE(v_open->'open_visits','[]'::jsonb)) > 0 THEN
    RETURN jsonb_build_object('status','has_open_cycles','business_date',v_today,'open',v_open);
  END IF;

  SELECT COALESCE(SUM(COALESCE(s.tables_result,0)),0)
    INTO v_tables_result
    FROM public.shifts s
   WHERE s.casino_id = _casino_id
     AND public.business_date_of(s.opened_at) = v_today;

  SELECT cs.id INTO v_slots_shift
    FROM public.cage_slots_shifts cs
   WHERE cs.casino_id = _casino_id
     AND cs.business_date = v_today
     AND cs.status::text IN ('closed','approved','reversed')
   ORDER BY cs.updated_at DESC NULLS LAST, cs.created_at DESC
   LIMIT 1;

  IF v_slots_shift IS NOT NULL THEN
    UPDATE public.cage_slots_shifts
       SET manual_drop_slots   = _drop_slots,
           manual_slots_result = _net_win,
           cash_desk_result    = _cashdesk_win,
           manual_slots_deposits = _client_balance,
           updated_at = now()
     WHERE id = v_slots_shift;
  END IF;

  -- Canonical: slots_result = cashdesk_win (Card Balance stays separate).
  INSERT INTO public.fin_day_closing AS d (
    casino_id, business_date, drop_slots, net_win, cashdesk_win,
    slots_result, tables_result, players_card_balance, notes, closed_by
  ) VALUES (
    _casino_id, v_today, _drop_slots, _net_win, _cashdesk_win,
    _cashdesk_win, v_tables_result, _client_balance, _notes, v_user
  )
  ON CONFLICT (casino_id, business_date) DO UPDATE SET
    drop_slots = EXCLUDED.drop_slots,
    net_win = EXCLUDED.net_win,
    cashdesk_win = EXCLUDED.cashdesk_win,
    slots_result = EXCLUDED.slots_result,
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

  v_res := public.close_business_day(_casino_id, 'manual', false);
  RETURN v_res || jsonb_build_object(
    'figures_saved', true,
    'tables_result', v_tables_result,
    'slots_shift_updated', v_slots_shift
  );
END;
$function$;