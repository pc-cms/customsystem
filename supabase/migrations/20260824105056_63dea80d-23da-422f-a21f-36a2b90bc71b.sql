DROP FUNCTION IF EXISTS public.ace_apply_closed_report(uuid, date, numeric, numeric, numeric, numeric);

CREATE OR REPLACE FUNCTION public.ace_apply_closed_report(
  _casino_id uuid,
  _business_date date,
  _drop_slots numeric,
  _net_win numeric,
  _cashdesk_win numeric,
  _client_balance numeric,
  _jp_in numeric DEFAULT NULL
)
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
    tables_result, slots_result, players_card_balance
  ) VALUES (
    _casino_id, _business_date, _drop_slots, _net_win, _cashdesk_win,
    v_tables_result, _cashdesk_win, _client_balance
  )
  ON CONFLICT (casino_id, business_date) DO UPDATE SET
    drop_slots = EXCLUDED.drop_slots,
    net_win = EXCLUDED.net_win,
    cashdesk_win = EXCLUDED.cashdesk_win,
    tables_result = CASE WHEN v_tables_result <> 0 THEN v_tables_result
                         ELSE COALESCE(NULLIF(d.tables_result, 0), v_tables_result) END,
    slots_result = COALESCE(NULLIF(EXCLUDED.slots_result, 0), d.slots_result),
    players_card_balance = EXCLUDED.players_card_balance,
    updated_at = now();

  -- JP IN: ACE jackpot_slip_out becomes the day's JP figure, stored the same
  -- way the manual Close Day does (fin_other_incomes, source = 'jp').
  IF _jp_in IS NOT NULL AND _jp_in <> 0 THEN
    SELECT COALESCE(SUM(oi.amount),0) INTO v_jp_posted
      FROM public.fin_other_incomes oi
     WHERE oi.casino_id = _casino_id
       AND oi.business_date = _business_date
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
        (casino_id, business_date, wallet_id, source, currency, amount, fx_rate, note)
      VALUES
        (_casino_id, _business_date, v_jp_wallet, 'jp', 'TZS', v_jp_delta, 1, 'JP · ACE');
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'business_date', _business_date,
                            'tables_result', v_tables_result, 'jp_delta', v_jp_delta);
END;
$function$;