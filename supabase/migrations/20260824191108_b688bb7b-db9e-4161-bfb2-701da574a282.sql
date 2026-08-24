CREATE OR REPLACE FUNCTION public.fin_other_income_replace(
  p_id uuid,
  p_business_date date,
  p_wallet_id uuid,
  p_source text,
  p_amount numeric,
  p_fin_category_id uuid DEFAULT NULL,
  p_note text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  o public.fin_other_incomes%ROWTYPE;
  w public.fin_wallets%ROWTYPE;
  v_uid uuid := auth.uid();
  v_rate numeric;
  v_new uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO o FROM public.fin_other_incomes WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transaction not found'; END IF;
  IF NOT public.has_casino_scope(v_uid, o.casino_id) THEN RAISE EXCEPTION 'No access to this casino'; END IF;
  IF o.reversed_by_id IS NOT NULL THEN RAISE EXCEPTION 'Already corrected'; END IF;
  IF o.reverses_id IS NOT NULL THEN RAISE EXCEPTION 'A reversal cannot be corrected'; END IF;
  IF p_source = 'refund' THEN RAISE EXCEPTION 'Refund is retired and cannot be used'; END IF;

  SELECT * INTO w FROM public.fin_wallets WHERE id = p_wallet_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Wallet not found'; END IF;
  IF w.casino_id <> o.casino_id THEN RAISE EXCEPTION 'Wallet belongs to another casino'; END IF;

  -- 1. storno of the original (mirrored wallet tx is negated by trg_foi_mirror)
  INSERT INTO public.fin_other_incomes (
    casino_id, business_date, wallet_id, fin_category_id, source,
    currency, amount, fx_rate, note, created_by, reverses_id
  ) VALUES (
    o.casino_id, o.business_date, o.wallet_id, o.fin_category_id, o.source,
    o.currency, o.amount, o.fx_rate,
    concat('Correction storno of ', o.id::text), v_uid, o.id
  );

  -- amount 0 == pure cancellation: storno only, no replacement row
  IF COALESCE(p_amount,0) = 0 THEN
    RETURN NULL;
  END IF;

  -- 2. replacement row with the corrected values
  v_rate := public.fin_rate_for(o.casino_id, w.currency, p_business_date);
  INSERT INTO public.fin_other_incomes (
    casino_id, business_date, wallet_id, fin_category_id, source,
    currency, amount, fx_rate, note, created_by
  ) VALUES (
    o.casino_id, p_business_date, w.id, p_fin_category_id, p_source,
    w.currency, p_amount, COALESCE(NULLIF(v_rate,0), o.fx_rate, 1),
    NULLIF(btrim(coalesce(p_note,'')),''), v_uid
  ) RETURNING id INTO v_new;

  RETURN v_new;
END;
$fn$;