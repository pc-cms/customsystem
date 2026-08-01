-- 1) Fix RPC: drop the broken cash_count_snapshots block (wallet kind is not wallet_type)
DROP FUNCTION IF EXISTS public.fin_close_month(uuid,integer,integer,jsonb,jsonb,text);
CREATE FUNCTION public.fin_close_month(
  p_casino_id uuid, p_year int, p_month int,
  p_collection jsonb DEFAULT '[]'::jsonb, p_new_float jsonb DEFAULT '[]'::jsonb, p_note text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
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
    v_fx := CASE WHEN v_wallet.currency = 'USD' THEN v_usd ELSE 1 END;
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
END
$fn$;

-- 2) Backfill: replay existing August 2026 closures so wallets reflect the collection
DO $$
DECLARE
  c RECORD; r jsonb; w fin_wallets%ROWTYPE; v_fx numeric; v_usd numeric := 2600;
  v_last_day date; v_next_first date;
BEGIN
  FOR c IN SELECT * FROM public.fin_month_closures WHERE year=2026 AND month=8 LOOP
    v_last_day := (make_date(c.year,c.month,1) + INTERVAL '1 month - 1 day')::date;
    v_next_first := (make_date(c.year,c.month,1) + INTERVAL '1 month')::date;
    DELETE FROM fin_wallet_tx WHERE ref_table='fin_month_closures' AND ref_id=c.id;

    FOR r IN SELECT * FROM jsonb_array_elements(COALESCE(c.collection_details,'[]'::jsonb)) LOOP
      IF COALESCE((r->>'amount')::numeric,0) = 0 THEN CONTINUE; END IF;
      SELECT * INTO w FROM fin_wallets WHERE id=(r->>'wallet_id')::uuid AND casino_id=c.casino_id;
      IF NOT FOUND THEN CONTINUE; END IF;
      v_fx := CASE WHEN w.currency='USD' THEN v_usd ELSE 1 END;
      INSERT INTO fin_wallet_tx (casino_id, wallet_id, kind, amount, currency, fx_rate, amount_tzs,
        ref_table, ref_id, business_date, note, created_by)
      VALUES (c.casino_id, w.id, 'expense', (r->>'amount')::numeric, w.currency, v_fx,
        (r->>'amount')::numeric * v_fx, 'fin_month_closures', c.id, v_last_day,
        format('Collection %s-%s', c.year, lpad(c.month::text,2,'0')), c.closed_by);
    END LOOP;

    FOR r IN SELECT * FROM jsonb_array_elements(COALESCE(c.new_float_details,'[]'::jsonb)) LOOP
      UPDATE fin_wallets SET starting_float_amount = COALESCE((r->>'amount')::numeric,0),
        starting_float_date = v_next_first,
        starting_float_note = format('Close Month %s-%s', c.year, lpad(c.month::text,2,'0'))
      WHERE id=(r->>'wallet_id')::uuid AND casino_id=c.casino_id;
    END LOOP;
  END LOOP;
END $$;