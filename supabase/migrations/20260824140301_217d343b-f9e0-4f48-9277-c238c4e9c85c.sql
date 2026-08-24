-- 1. FX rate helper: rate for a casino/currency/business date, fallback 1 for TZS
CREATE OR REPLACE FUNCTION public.fin_rate_for(_casino_id uuid, _currency text, _business_date date)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE WHEN coalesce(_currency,'TZS') = 'TZS' THEN 1
    ELSE coalesce((
      SELECT r.rate_to_tzs FROM public.fin_daily_rates r
      WHERE r.casino_id = _casino_id AND r.currency = _currency
        AND r.business_date <= _business_date
      ORDER BY r.business_date DESC LIMIT 1
    ), 1) END;
$$;

REVOKE ALL ON FUNCTION public.fin_rate_for(uuid, text, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.fin_rate_for(uuid, text, date) TO authenticated, service_role;

-- 2. Inter-casino RPCs: use fin_rate_for instead of the non-existent fin_wallets.fx_rate
CREATE OR REPLACE FUNCTION public.fin_inter_casino_send(_from_wallet_id uuid, _to_casino_id uuid, _amount numeric, _business_date date, _note text DEFAULT NULL::text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  w public.fin_wallets%ROWTYPE;
  v_tx uuid;
  v_id uuid;
  v_rate numeric;
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'Amount must be positive'; END IF;

  SELECT * INTO w FROM public.fin_wallets WHERE id = _from_wallet_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Wallet not found'; END IF;
  IF NOT public.has_casino_scope(v_uid, w.casino_id) THEN RAISE EXCEPTION 'No access to source casino'; END IF;
  IF w.casino_id = _to_casino_id THEN RAISE EXCEPTION 'Source and destination casino must differ'; END IF;

  v_rate := public.fin_rate_for(w.casino_id, w.currency, _business_date);

  INSERT INTO public.fin_inter_casino_transfers (
    from_casino_id, from_wallet_id, to_casino_id, amount, currency, business_date, note, created_by
  ) VALUES (
    w.casino_id, w.id, _to_casino_id, _amount, w.currency, _business_date, NULLIF(btrim(coalesce(_note,'')),''), v_uid
  ) RETURNING id INTO v_id;

  INSERT INTO public.fin_wallet_tx (
    casino_id, wallet_id, kind, amount, currency, fx_rate, amount_tzs,
    business_date, note, created_by, ref_table, ref_id
  ) VALUES (
    w.casino_id, w.id, 'transfer_out', -_amount, w.currency, v_rate, -_amount * v_rate,
    _business_date, concat('Inter-casino OUT', CASE WHEN coalesce(_note,'') <> '' THEN ' · ' || _note ELSE '' END),
    v_uid, 'fin_inter_casino_transfers', v_id
  ) RETURNING id INTO v_tx;

  UPDATE public.fin_inter_casino_transfers SET out_tx_id = v_tx WHERE id = v_id;
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fin_inter_casino_accept(_transfer_id uuid, _to_wallet_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  t public.fin_inter_casino_transfers%ROWTYPE;
  w public.fin_wallets%ROWTYPE;
  v_tx uuid;
  v_rate numeric;
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO t FROM public.fin_inter_casino_transfers WHERE id = _transfer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transfer not found'; END IF;
  IF t.status <> 'pending' THEN RAISE EXCEPTION 'Transfer is already %', t.status; END IF;
  IF NOT public.has_casino_scope(v_uid, t.to_casino_id) THEN RAISE EXCEPTION 'No access to destination casino'; END IF;

  SELECT * INTO w FROM public.fin_wallets WHERE id = _to_wallet_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Wallet not found'; END IF;
  IF w.casino_id <> t.to_casino_id THEN RAISE EXCEPTION 'Wallet belongs to another casino'; END IF;
  IF w.currency <> t.currency THEN RAISE EXCEPTION 'Currency mismatch: transfer is %, wallet is %', t.currency, w.currency; END IF;

  v_rate := public.fin_rate_for(w.casino_id, w.currency, t.business_date);

  INSERT INTO public.fin_wallet_tx (
    casino_id, wallet_id, kind, amount, currency, fx_rate, amount_tzs,
    business_date, note, created_by, ref_table, ref_id
  ) VALUES (
    w.casino_id, w.id, 'transfer_in', t.amount, t.currency, v_rate, t.amount * v_rate,
    t.business_date, concat('Inter-casino IN', CASE WHEN coalesce(t.note,'') <> '' THEN ' · ' || t.note ELSE '' END),
    v_uid, 'fin_inter_casino_transfers', t.id
  ) RETURNING id INTO v_tx;

  UPDATE public.fin_inter_casino_transfers
  SET status = 'accepted', to_wallet_id = w.id, in_tx_id = v_tx, accepted_by = v_uid, accepted_at = now()
  WHERE id = t.id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fin_inter_casino_resolve(_transfer_id uuid, _action text, _reason text DEFAULT NULL::text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  t public.fin_inter_casino_transfers%ROWTYPE;
  v_tx uuid;
  v_rate numeric;
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _action NOT IN ('rejected','cancelled') THEN RAISE EXCEPTION 'Invalid action'; END IF;

  SELECT * INTO t FROM public.fin_inter_casino_transfers WHERE id = _transfer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transfer not found'; END IF;
  IF t.status <> 'pending' THEN RAISE EXCEPTION 'Transfer is already %', t.status; END IF;

  IF _action = 'rejected' AND NOT public.has_casino_scope(v_uid, t.to_casino_id) THEN
    RAISE EXCEPTION 'No access to destination casino';
  END IF;
  IF _action = 'cancelled' AND NOT public.has_casino_scope(v_uid, t.from_casino_id) THEN
    RAISE EXCEPTION 'No access to source casino';
  END IF;

  v_rate := public.fin_rate_for(t.from_casino_id, t.currency, t.business_date);

  INSERT INTO public.fin_wallet_tx (
    casino_id, wallet_id, kind, amount, currency, fx_rate, amount_tzs,
    business_date, note, created_by, ref_table, ref_id, reversal_of
  ) VALUES (
    t.from_casino_id, t.from_wallet_id, 'reversal', t.amount, t.currency, v_rate, t.amount * v_rate,
    t.business_date,
    concat('Inter-casino ', _action, CASE WHEN coalesce(_reason,'') <> '' THEN ' · ' || _reason ELSE '' END),
    v_uid, 'fin_inter_casino_transfers', t.id, t.out_tx_id
  ) RETURNING id INTO v_tx;

  UPDATE public.fin_inter_casino_transfers
  SET status = _action, reversal_tx_id = v_tx, resolution_note = NULLIF(btrim(coalesce(_reason,'')),''),
      accepted_by = v_uid, accepted_at = now()
  WHERE id = t.id;
END;
$function$;

-- 3. New 'tips' source for fin_other_incomes
ALTER TABLE public.fin_other_incomes DROP CONSTRAINT IF EXISTS fin_other_incomes_source_check;
ALTER TABLE public.fin_other_incomes ADD CONSTRAINT fin_other_incomes_source_check
  CHECK (source = ANY (ARRAY['investment','inter_casino_transfer','owner_topup','refund','bonus','tips','tips_bonus','jp','fee','other']));

-- 4. Re-tag existing rows (labels only; amounts/dates/wallets untouched)
UPDATE public.fin_other_incomes SET source = 'bonus'
 WHERE source = 'tips_bonus' AND note ILIKE '%bonus%';

UPDATE public.fin_other_incomes SET source = 'tips'
 WHERE source = 'tips_bonus';

UPDATE public.fin_other_incomes SET source = 'tips'
 WHERE source = 'investment' AND note ILIKE '%tips%';