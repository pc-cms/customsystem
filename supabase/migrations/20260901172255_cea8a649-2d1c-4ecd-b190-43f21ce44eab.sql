CREATE OR REPLACE FUNCTION public.ace_backfill_history_day(
  _casino_id uuid,
  _business_date date,
  _drop_slots numeric,
  _net_win numeric,
  _cashdesk_win numeric,
  _client_balance numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r public.fin_day_closing%ROWTYPE;
  filled text[] := '{}';
  has_shift boolean := false;
  has_closing boolean := false;
  status text;
  cname text;
  v_drop numeric; v_net numeric; v_cash numeric; v_card numeric; v_slots numeric;
  net_filled boolean := false;
BEGIN
  IF _casino_id IS NULL OR _business_date IS NULL THEN
    RAISE EXCEPTION 'casino_id and business_date are required';
  END IF;

  IF _business_date < DATE '2026-01-01' OR _business_date > DATE '2026-07-31' THEN
    RAISE EXCEPTION 'business_date % is outside the allowed historical window 2026-01-01..2026-07-31', _business_date;
  END IF;

  SELECT name INTO cname FROM public.casinos WHERE id = _casino_id;
  IF lower(COALESCE(cname, '')) = 'mbeya' THEN
    RAISE EXCEPTION 'historical backfill is not allowed for Mbeya (opened in August 2026)';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.cage_slots_shifts s
     WHERE s.casino_id = _casino_id
       AND s.business_date = _business_date
       AND s.status IN ('closed','approved')
  ) INTO has_shift;

  SELECT * INTO r FROM public.fin_day_closing
   WHERE casino_id = _casino_id AND business_date = _business_date
   FOR UPDATE;
  has_closing := FOUND;

  IF has_closing THEN
    v_drop  := r.drop_slots;
    v_net   := r.net_win;
    v_cash  := r.cashdesk_win;
    v_card  := r.players_card_balance;
    v_slots := r.slots_result;

    -- Drop / Net Win / CashDesk Win: zero is NOT a valid historical value.
    IF COALESCE(r.drop_slots, 0) = 0 AND COALESCE(_drop_slots, 0) <> 0 THEN
      v_drop := _drop_slots; filled := filled || 'drop_slots';
    END IF;
    IF COALESCE(r.net_win, 0) = 0 AND COALESCE(_net_win, 0) <> 0 THEN
      v_net := _net_win; net_filled := true; filled := filled || 'net_win';
    END IF;
    IF COALESCE(r.cashdesk_win, 0) = 0 AND COALESCE(_cashdesk_win, 0) <> 0 THEN
      v_cash := _cashdesk_win; filled := filled || 'cashdesk_win';
    END IF;

    -- Slots Result mirrors ACE net win only when net win itself was filled.
    IF net_filled THEN
      v_slots := _net_win; filled := filled || 'slots_result';
    END IF;

    -- Players Card Balance: a true 0 is possible, so only a NULL is "missing".
    IF r.players_card_balance IS NULL AND _client_balance IS NOT NULL THEN
      v_card := _client_balance; filled := filled || 'players_card_balance';
    END IF;

    IF array_length(filled, 1) > 0 THEN
      UPDATE public.fin_day_closing
         SET drop_slots = v_drop,
             net_win = v_net,
             cashdesk_win = v_cash,
             players_card_balance = v_card,
             slots_result = v_slots
       WHERE id = r.id;
      status := 'existing_day_fields_filled';
    ELSE
      status := 'existing_day_unchanged';
    END IF;

    RETURN jsonb_build_object(
      'status', status, 'created', false,
      'existing_shift', has_shift, 'existing_closing', true,
      'fields_filled', to_jsonb(filled)
    );
  END IF;

  INSERT INTO public.fin_day_closing (
    casino_id, business_date, drop_slots, net_win, cashdesk_win,
    players_card_balance, slots_result
  ) VALUES (
    _casino_id, _business_date,
    COALESCE(_drop_slots, 0), COALESCE(_net_win, 0), COALESCE(_cashdesk_win, 0),
    COALESCE(_client_balance, 0), COALESCE(_net_win, 0)
  );
  filled := ARRAY['drop_slots','net_win','slots_result','cashdesk_win','players_card_balance'];

  RETURN jsonb_build_object(
    'status', CASE WHEN has_shift THEN 'shift_day_statistics_created'
                   ELSE 'new_statistics_day_created' END,
    'created', true,
    'existing_shift', has_shift, 'existing_closing', false,
    'fields_filled', to_jsonb(filled)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.ace_history_probe_day(
  _casino_id uuid,
  _business_date date,
  _drop_slots numeric,
  _net_win numeric,
  _cashdesk_win numeric,
  _client_balance numeric
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  has_shift boolean := false;
  has_closing boolean := false;
  r public.fin_day_closing%ROWTYPE;
  missing text[] := '{}';
  cname text;
  net_missing boolean := false;
BEGIN
  SELECT name INTO cname FROM public.casinos WHERE id = _casino_id;
  IF lower(COALESCE(cname, '')) = 'mbeya' THEN
    RETURN jsonb_build_object('status', 'excluded_casino');
  END IF;
  IF _business_date < DATE '2026-01-01' OR _business_date > DATE '2026-07-31' THEN
    RETURN jsonb_build_object('status', 'history_out_of_window');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.cage_slots_shifts s
     WHERE s.casino_id = _casino_id AND s.business_date = _business_date
       AND s.status IN ('closed','approved')
  ) INTO has_shift;

  SELECT * INTO r FROM public.fin_day_closing
   WHERE casino_id = _casino_id AND business_date = _business_date;
  has_closing := FOUND;

  IF has_closing THEN
    IF COALESCE(r.drop_slots, 0) = 0 AND COALESCE(_drop_slots, 0) <> 0 THEN
      missing := missing || 'drop_slots';
    END IF;
    IF COALESCE(r.net_win, 0) = 0 AND COALESCE(_net_win, 0) <> 0 THEN
      missing := missing || 'net_win'; net_missing := true;
    END IF;
    IF COALESCE(r.cashdesk_win, 0) = 0 AND COALESCE(_cashdesk_win, 0) <> 0 THEN
      missing := missing || 'cashdesk_win';
    END IF;
    IF net_missing THEN
      missing := missing || 'slots_result';
    END IF;
    IF r.players_card_balance IS NULL AND _client_balance IS NOT NULL THEN
      missing := missing || 'players_card_balance';
    END IF;

    RETURN jsonb_build_object(
      'status', CASE WHEN array_length(missing, 1) > 0
                     THEN 'existing_day_fields_filled'
                     ELSE 'existing_day_unchanged' END,
      'existing_shift', has_shift, 'existing_closing', true,
      'missing_fields', to_jsonb(missing), 'preview', true
    );
  END IF;

  RETURN jsonb_build_object(
    'status', CASE WHEN has_shift THEN 'shift_day_statistics_created'
                   ELSE 'new_statistics_day_created' END,
    'existing_shift', has_shift, 'existing_closing', false,
    'missing_fields', to_jsonb(ARRAY['drop_slots','net_win','slots_result','cashdesk_win','players_card_balance']),
    'preview', true
  );
END;
$function$;