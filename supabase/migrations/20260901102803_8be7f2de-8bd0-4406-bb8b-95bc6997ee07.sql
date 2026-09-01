CREATE OR REPLACE FUNCTION public.fin_open_month(p_casino_id uuid, p_year integer, p_month integer, p_float_details jsonb DEFAULT '[]'::jsonb, p_wallet_balances jsonb DEFAULT '[]'::jsonb, p_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_first date := make_date(p_year, p_month, 1);
  v_id uuid;
  r jsonb;
  v_wallet public.fin_wallets%ROWTYPE;
  v_fx numeric;
  v_counted numeric;
  v_previous numeric;
  v_float_tzs numeric := 0;
  v_wallet_type wallet_type;
  v_status text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT (
    has_role(v_uid,'super_admin'::app_role)
    OR can_finance(v_uid)
    OR (can_manage(v_uid) AND public.has_casino_scope(v_uid, p_casino_id))
  ) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  -- Opening a month never requires the previous month to be closed.
  v_status := public.fin_month_opening_status(p_casino_id, p_year, p_month);
  IF v_status = 'closed' THEN
    RAISE EXCEPTION 'Month %-% is already closed for this casino', p_month, p_year;
  ELSIF v_status = 'open' THEN
    RAISE EXCEPTION 'Month %-% is already opened for this casino', p_month, p_year;
  END IF;

  INSERT INTO public.fin_month_opening (
    casino_id, year, month, opening_float_tzs, wallet_balances, opened_by, note
  ) VALUES (
    p_casino_id, p_year, p_month, 0, COALESCE(p_wallet_balances,'[]'::jsonb), v_uid, p_note
  ) RETURNING id INTO v_id;

  FOR r IN SELECT * FROM jsonb_array_elements(COALESCE(p_float_details,'[]'::jsonb)) LOOP
    UPDATE public.fin_wallets SET
      starting_float_amount = COALESCE((r->>'amount')::numeric, 0),
      starting_float_date = v_first,
      starting_float_note = format('Open Month %s-%s', p_year, lpad(p_month::text, 2, '0'))
    WHERE id = (r->>'wallet_id')::uuid AND casino_id = p_casino_id;
  END LOOP;

  FOR r IN SELECT * FROM jsonb_array_elements(COALESCE(p_wallet_balances,'[]'::jsonb)) LOOP
    SELECT * INTO v_wallet FROM public.fin_wallets
     WHERE id = (r->>'wallet_id')::uuid AND casino_id = p_casino_id AND is_active = true;
    IF NOT FOUND THEN CONTINUE; END IF;

    v_counted := COALESCE((r->>'amount')::numeric, 0);
    v_fx := CASE WHEN COALESCE(v_wallet.currency,'TZS') = 'TZS' THEN 1
                 ELSE COALESCE(NULLIF(public.fin_rate_for(p_casino_id, v_wallet.currency, v_first), 0), 1) END;

    SELECT physical_total INTO v_previous
      FROM public.cash_count_snapshots
     WHERE wallet_id = v_wallet.id
     ORDER BY business_date DESC NULLS LAST, created_at DESC
     LIMIT 1;
    v_previous := COALESCE(v_previous, v_counted);

    IF COALESCE(v_wallet.currency,'TZS') = 'TZS' THEN
      v_float_tzs := v_float_tzs + COALESCE(v_wallet.starting_float_amount, 0);
    ELSE
      v_float_tzs := v_float_tzs + COALESCE(v_wallet.starting_float_amount, 0) * v_fx;
    END IF;

    v_wallet_type := CASE v_wallet.kind
      WHEN 'cash' THEN 'main_cash'
      WHEN 'safe' THEN 'office_safe'
      WHEN 'bank' THEN 'bank_account'
      WHEN 'mobile_money' THEN 'mobile_money'
      WHEN 'cage' THEN 'cage_table'
      ELSE 'other_reserve' END::wallet_type;

    INSERT INTO public.cash_count_snapshots (
      casino_id, wallet_id, wallet_type, currency, denominations,
      physical_total, expected_balance, discrepancy, exchange_rate,
      physical_total_tzs, counted_by, note, source, business_date
    ) VALUES (
      p_casino_id, v_wallet.id, v_wallet_type, v_wallet.currency, '{}'::jsonb,
      v_counted, v_previous, v_counted - v_previous, v_fx,
      v_counted * v_fx, v_uid, COALESCE(p_note, ''), 'month_open', v_first
    );
  END LOOP;

  UPDATE public.fin_month_opening SET opening_float_tzs = v_float_tzs WHERE id = v_id;

  RETURN v_id;
END $function$;