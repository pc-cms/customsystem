CREATE OR REPLACE FUNCTION public.fin_inter_casino_send(_from_wallet_id uuid, _to_casino_id uuid, _amount numeric, _business_date date, _note text DEFAULT NULL::text, _kind text DEFAULT 'funding', _repays_id uuid DEFAULT NULL, _repayable boolean DEFAULT true)
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
  v_repayable boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'Amount must be positive'; END IF;
  IF COALESCE(_kind,'funding') NOT IN ('funding','repayment') THEN RAISE EXCEPTION 'Invalid transfer kind %', _kind; END IF;

  -- Only plain funding can create a debt at the receiver.
  v_repayable := (COALESCE(_kind,'funding') = 'funding') AND COALESCE(_repayable, true);

  SELECT * INTO w FROM public.fin_wallets WHERE id = _from_wallet_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Wallet not found'; END IF;
  IF NOT public.has_casino_scope(v_uid, w.casino_id) THEN RAISE EXCEPTION 'No access to source casino'; END IF;
  IF w.casino_id = _to_casino_id THEN RAISE EXCEPTION 'Source and destination casino must differ'; END IF;

  v_rate := public.fin_rate_for(w.casino_id, w.currency, _business_date);

  INSERT INTO public.fin_inter_casino_transfers (
    from_casino_id, from_wallet_id, to_casino_id, amount, currency, business_date, note, created_by, kind, repays_id, repayable
  ) VALUES (
    w.casino_id, w.id, _to_casino_id, _amount, w.currency, _business_date, NULLIF(btrim(coalesce(_note,'')),''), v_uid,
    COALESCE(_kind,'funding'), _repays_id, v_repayable
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

GRANT EXECUTE ON FUNCTION public.fin_inter_casino_send(uuid, uuid, numeric, date, text, text, uuid, boolean) TO authenticated;

-- Historical fix: Mwanza → Arusha 10 000 000 TZS (06/08/2026) is a debt, not a gift.
UPDATE public.fin_inter_casino_transfers
   SET repayable = true
 WHERE id = '87b2a33f-83af-4aed-b5fa-e596fba82b9e';

INSERT INTO public.fin_liabilities (casino_id, creditor, description, amount, currency, fx_rate, amount_tzs,
                                    business_date, source, transfer_id, created_by)
SELECT t.to_casino_id,
       COALESCE((SELECT name FROM public.casinos WHERE id = t.from_casino_id), 'Intercompany'),
       concat('Repayable intercompany funding ', t.id::text),
       t.amount, COALESCE(t.currency,'TZS'), 1, t.amount,
       t.business_date, 'intercompany', t.id, t.created_by
FROM public.fin_inter_casino_transfers t
WHERE t.id = '87b2a33f-83af-4aed-b5fa-e596fba82b9e'
  AND NOT EXISTS (SELECT 1 FROM public.fin_liabilities l WHERE l.transfer_id = t.id);