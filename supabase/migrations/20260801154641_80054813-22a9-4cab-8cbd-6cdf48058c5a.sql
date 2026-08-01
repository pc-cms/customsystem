CREATE OR REPLACE FUNCTION public.fin_close_month(
  p_casino_id uuid, p_year int, p_month int,
  p_collection jsonb DEFAULT NULL, p_new_float jsonb DEFAULT NULL, p_note text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_usd numeric;
  v_last_day date := (make_date(p_year, p_month, 1) + INTERVAL '1 month - 1 day')::date;
  v_next_first date := (make_date(p_year, p_month, 1) + INTERVAL '1 month')::date;
  v_tot_tzs numeric := 0;
  v_tot_usd numeric := 0;
  v_id uuid;
  r jsonb;
  v_wallet fin_wallets%ROWTYPE;
  v_fx numeric;
  v_nat numeric;
  v_tzs numeric;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT (has_role(v_uid,'super_admin'::app_role) OR can_finance(v_uid)) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  SELECT NULLIF((exchange_rates->>'USD'),'')::numeric INTO v_usd
  FROM shifts WHERE casino_id=p_casino_id AND exchange_rates ? 'USD'
    AND COALESCE(closed_at, opened_at)::date <= v_last_day
  ORDER BY COALESCE(closed_at, opened_at) DESC LIMIT 1;
  v_usd := COALESCE(v_usd, 2600);

  FOR r IN SELECT * FROM jsonb_array_elements(COALESCE(p_collection,'[]'::jsonb)) LOOP
    IF (r->>'currency') = 'TZS' THEN v_tot_tzs := v_tot_tzs + COALESCE((r->>'amount')::numeric,0);
    ELSIF (r->>'currency') = 'USD' THEN v_tot_usd := v_tot_usd + COALESCE((r->>'amount')::numeric,0);
    END IF;
  END LOOP;

  INSERT INTO public.fin_month_closures (
    casino_id, year, month, closed_by, closed_at,
    collection_total_tzs, collection_total_usd,
    collection_details, new_float_details, note
  ) VALUES (
    p_casino_id, p_year, p_month, v_uid, now(),
    v_tot_tzs, v_tot_usd,
    COALESCE(p_collection,'[]'::jsonb), COALESCE(p_new_float,'[]'::jsonb), p_note
  )
  ON CONFLICT (casino_id, year, month) DO UPDATE SET
    closed_by = EXCLUDED.closed_by,
    closed_at = EXCLUDED.closed_at,
    collection_total_tzs = EXCLUDED.collection_total_tzs,
    collection_total_usd = EXCLUDED.collection_total_usd,
    collection_details = EXCLUDED.collection_details,
    new_float_details = EXCLUDED.new_float_details,
    note = EXCLUDED.note
  RETURNING id INTO v_id;

  DELETE FROM fin_wallet_tx WHERE ref_table='fin_month_closures' AND ref_id=v_id;

  FOR r IN SELECT * FROM jsonb_array_elements(COALESCE(p_collection,'[]'::jsonb)) LOOP
    IF COALESCE((r->>'amount')::numeric,0) = 0 THEN CONTINUE; END IF;
    SELECT * INTO v_wallet FROM fin_wallets WHERE id = (r->>'wallet_id')::uuid AND casino_id = p_casino_id;
    IF NOT FOUND THEN CONTINUE; END IF;

    IF v_wallet.currency = 'TZS' THEN
      v_fx := 1;
    ELSIF v_wallet.currency = 'USD' THEN
      v_fx := v_usd;
    ELSE
      -- derive rate from the wallet's own ledger history (native -> TZS)
      SELECT COALESCE(SUM(amount),0), COALESCE(SUM(amount_tzs),0)
        INTO v_nat, v_tzs
      FROM fin_wallet_tx
      WHERE wallet_id = v_wallet.id AND ref_id IS DISTINCT FROM v_id;
      v_fx := CASE WHEN v_nat <> 0 AND v_tzs <> 0 THEN v_tzs / v_nat ELSE 1 END;
    END IF;

    INSERT INTO fin_wallet_tx (
      casino_id, wallet_id, kind, amount, currency, fx_rate, amount_tzs,
      ref_table, ref_id, business_date, note, created_by
    ) VALUES (
      p_casino_id, v_wallet.id, 'expense',
      (r->>'amount')::numeric, v_wallet.currency, v_fx,
      (r->>'amount')::numeric * v_fx,
      'fin_month_closures', v_id, v_last_day,
      format('Collection %s-%s', p_year, lpad(p_month::text,2,'0')), v_uid
    );
  END LOOP;

  FOR r IN SELECT * FROM jsonb_array_elements(COALESCE(p_new_float,'[]'::jsonb)) LOOP
    UPDATE fin_wallets SET
      starting_float_amount = COALESCE((r->>'amount')::numeric,0),
      starting_float_date = v_next_first,
      starting_float_note = format('Close Month %s-%s', p_year, lpad(p_month::text,2,'0'))
    WHERE id = (r->>'wallet_id')::uuid AND casino_id = p_casino_id;
  END LOOP;

  RETURN v_id;
END $$;

-- Backfill: fix already-written August collection rows for FX wallets
UPDATE fin_wallet_tx t
SET amount_tzs = t.amount * sub.rate,
    fx_rate = sub.rate
FROM (
  SELECT x.wallet_id,
         CASE WHEN SUM(x.amount) <> 0 THEN SUM(x.amount_tzs)/SUM(x.amount) ELSE 1 END AS rate
  FROM fin_wallet_tx x
  WHERE x.ref_table IS DISTINCT FROM 'fin_month_closures'
  GROUP BY x.wallet_id
) sub
WHERE t.wallet_id = sub.wallet_id
  AND t.ref_table = 'fin_month_closures'
  AND t.currency NOT IN ('TZS','USD');