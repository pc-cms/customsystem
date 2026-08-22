CREATE TABLE public.fin_inter_casino_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_casino_id uuid NOT NULL REFERENCES public.casinos(id) ON DELETE CASCADE,
  from_wallet_id uuid NOT NULL REFERENCES public.fin_wallets(id) ON DELETE RESTRICT,
  to_casino_id uuid NOT NULL REFERENCES public.casinos(id) ON DELETE CASCADE,
  to_wallet_id uuid REFERENCES public.fin_wallets(id) ON DELETE RESTRICT,
  amount numeric NOT NULL CHECK (amount > 0),
  currency text NOT NULL,
  business_date date NOT NULL,
  note text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected','cancelled')),
  out_tx_id uuid REFERENCES public.fin_wallet_tx(id),
  in_tx_id uuid REFERENCES public.fin_wallet_tx(id),
  reversal_tx_id uuid REFERENCES public.fin_wallet_tx(id),
  created_by uuid NOT NULL,
  accepted_by uuid,
  accepted_at timestamptz,
  resolution_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_fict_from ON public.fin_inter_casino_transfers(from_casino_id, business_date DESC);
CREATE INDEX idx_fict_to ON public.fin_inter_casino_transfers(to_casino_id, status);

GRANT SELECT ON public.fin_inter_casino_transfers TO authenticated;
GRANT ALL ON public.fin_inter_casino_transfers TO service_role;

ALTER TABLE public.fin_inter_casino_transfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fict_select_scoped" ON public.fin_inter_casino_transfers
FOR SELECT TO authenticated
USING (
  public.has_casino_scope(auth.uid(), from_casino_id)
  OR public.has_casino_scope(auth.uid(), to_casino_id)
);

CREATE TRIGGER fict_touch_updated_at
BEFORE UPDATE ON public.fin_inter_casino_transfers
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ SEND ============
CREATE OR REPLACE FUNCTION public.fin_inter_casino_send(
  _from_wallet_id uuid,
  _to_casino_id uuid,
  _amount numeric,
  _business_date date,
  _note text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  w public.fin_wallets%ROWTYPE;
  v_tx uuid;
  v_id uuid;
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'Amount must be positive'; END IF;

  SELECT * INTO w FROM public.fin_wallets WHERE id = _from_wallet_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Wallet not found'; END IF;
  IF NOT public.has_casino_scope(v_uid, w.casino_id) THEN RAISE EXCEPTION 'No access to source casino'; END IF;
  IF w.casino_id = _to_casino_id THEN RAISE EXCEPTION 'Source and destination casino must differ'; END IF;

  INSERT INTO public.fin_inter_casino_transfers (
    from_casino_id, from_wallet_id, to_casino_id, amount, currency, business_date, note, created_by
  ) VALUES (
    w.casino_id, w.id, _to_casino_id, _amount, w.currency, _business_date, NULLIF(btrim(coalesce(_note,'')),''), v_uid
  ) RETURNING id INTO v_id;

  INSERT INTO public.fin_wallet_tx (
    casino_id, wallet_id, kind, amount, currency, fx_rate, amount_tzs,
    business_date, note, created_by, ref_table, ref_id
  ) VALUES (
    w.casino_id, w.id, 'transfer_out', -_amount, w.currency, coalesce(w.fx_rate,1), -_amount * coalesce(w.fx_rate,1),
    _business_date, concat('Inter-casino OUT', CASE WHEN coalesce(_note,'') <> '' THEN ' · ' || _note ELSE '' END),
    v_uid, 'fin_inter_casino_transfers', v_id
  ) RETURNING id INTO v_tx;

  UPDATE public.fin_inter_casino_transfers SET out_tx_id = v_tx WHERE id = v_id;
  RETURN v_id;
END;
$$;

-- ============ ACCEPT ============
CREATE OR REPLACE FUNCTION public.fin_inter_casino_accept(
  _transfer_id uuid,
  _to_wallet_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t public.fin_inter_casino_transfers%ROWTYPE;
  w public.fin_wallets%ROWTYPE;
  v_tx uuid;
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

  INSERT INTO public.fin_wallet_tx (
    casino_id, wallet_id, kind, amount, currency, fx_rate, amount_tzs,
    business_date, note, created_by, ref_table, ref_id
  ) VALUES (
    w.casino_id, w.id, 'transfer_in', t.amount, t.currency, coalesce(w.fx_rate,1), t.amount * coalesce(w.fx_rate,1),
    t.business_date, concat('Inter-casino IN', CASE WHEN coalesce(t.note,'') <> '' THEN ' · ' || t.note ELSE '' END),
    v_uid, 'fin_inter_casino_transfers', t.id
  ) RETURNING id INTO v_tx;

  UPDATE public.fin_inter_casino_transfers
  SET status = 'accepted', to_wallet_id = w.id, in_tx_id = v_tx, accepted_by = v_uid, accepted_at = now()
  WHERE id = t.id;
END;
$$;

-- ============ REJECT / CANCEL ============
CREATE OR REPLACE FUNCTION public.fin_inter_casino_resolve(
  _transfer_id uuid,
  _action text,
  _reason text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t public.fin_inter_casino_transfers%ROWTYPE;
  w public.fin_wallets%ROWTYPE;
  v_tx uuid;
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

  SELECT * INTO w FROM public.fin_wallets WHERE id = t.from_wallet_id;

  INSERT INTO public.fin_wallet_tx (
    casino_id, wallet_id, kind, amount, currency, fx_rate, amount_tzs,
    business_date, note, created_by, ref_table, ref_id, reversal_of
  ) VALUES (
    t.from_casino_id, t.from_wallet_id, 'reversal', t.amount, t.currency, coalesce(w.fx_rate,1), t.amount * coalesce(w.fx_rate,1),
    t.business_date,
    concat('Inter-casino ', _action, CASE WHEN coalesce(_reason,'') <> '' THEN ' · ' || _reason ELSE '' END),
    v_uid, 'fin_inter_casino_transfers', t.id, t.out_tx_id
  ) RETURNING id INTO v_tx;

  UPDATE public.fin_inter_casino_transfers
  SET status = _action, reversal_tx_id = v_tx, resolution_note = NULLIF(btrim(coalesce(_reason,'')),''),
      accepted_by = v_uid, accepted_at = now()
  WHERE id = t.id;
END;
$$;

REVOKE ALL ON FUNCTION public.fin_inter_casino_send(uuid, uuid, numeric, date, text) FROM public;
REVOKE ALL ON FUNCTION public.fin_inter_casino_accept(uuid, uuid) FROM public;
REVOKE ALL ON FUNCTION public.fin_inter_casino_resolve(uuid, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.fin_inter_casino_send(uuid, uuid, numeric, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fin_inter_casino_accept(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fin_inter_casino_resolve(uuid, text, text) TO authenticated;