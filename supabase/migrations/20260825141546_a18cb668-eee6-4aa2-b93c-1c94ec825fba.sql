-- ============================================================
-- Bank Statement Import & Review
-- ============================================================

CREATE TABLE public.fin_bank_statement_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  casino_id uuid NOT NULL REFERENCES public.casinos(id) ON DELETE CASCADE,
  wallet_id uuid NOT NULL REFERENCES public.fin_wallets(id) ON DELETE RESTRICT,
  filename text NOT NULL DEFAULT '',
  file_hash text,
  currency text NOT NULL DEFAULT 'TZS',
  status text NOT NULL DEFAULT 'in_review'
    CHECK (status IN ('in_review','partially_confirmed','confirmed','abandoned')),
  opening_balance numeric,
  closing_balance numeric,
  period_from date,
  period_to date,
  row_count integer NOT NULL DEFAULT 0,
  total_debit numeric NOT NULL DEFAULT 0,
  total_credit numeric NOT NULL DEFAULT 0,
  uploaded_by uuid,
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.fin_bank_statement_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.fin_bank_statement_batches(id) ON DELETE CASCADE,
  casino_id uuid NOT NULL REFERENCES public.casinos(id) ON DELETE CASCADE,
  wallet_id uuid NOT NULL REFERENCES public.fin_wallets(id) ON DELETE RESTRICT,
  row_index integer NOT NULL,
  tx_date date NOT NULL,
  description text NOT NULL DEFAULT '',
  reference text,
  debit numeric NOT NULL DEFAULT 0,
  credit numeric NOT NULL DEFAULT 0,
  signed_amount numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'TZS',
  fingerprint text NOT NULL,
  proposed_kind text NOT NULL DEFAULT 'unclassified'
    CHECK (proposed_kind IN ('expense','income','unclassified')),
  proposed_category_code text,
  fin_category_id uuid REFERENCES public.fin_categories(id) ON DELETE SET NULL,
  matched_expense_id uuid REFERENCES public.expenses(id) ON DELETE SET NULL,
  matched_wallet_tx_id uuid REFERENCES public.fin_wallet_tx(id) ON DELETE SET NULL,
  is_duplicate boolean NOT NULL DEFAULT false,
  duplicate_of uuid REFERENCES public.fin_bank_statement_rows(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','matched','duplicate','ignored','confirmed','error')),
  expense_id uuid REFERENCES public.expenses(id) ON DELETE SET NULL,
  wallet_tx_id uuid REFERENCES public.fin_wallet_tx(id) ON DELETE SET NULL,
  note text,
  error_text text,
  confirmed_by uuid,
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (batch_id, row_index)
);

CREATE INDEX idx_bank_rows_batch ON public.fin_bank_statement_rows(batch_id);
CREATE INDEX idx_bank_rows_wallet_date ON public.fin_bank_statement_rows(wallet_id, tx_date);
CREATE INDEX idx_bank_rows_fp ON public.fin_bank_statement_rows(wallet_id, fingerprint);
-- idempotency: one confirmed row per wallet+fingerprint
CREATE UNIQUE INDEX uq_bank_rows_confirmed_fp
  ON public.fin_bank_statement_rows(wallet_id, fingerprint)
  WHERE status = 'confirmed';
CREATE INDEX idx_bank_batches_casino ON public.fin_bank_statement_batches(casino_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fin_bank_statement_batches TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fin_bank_statement_rows TO authenticated;
GRANT ALL ON public.fin_bank_statement_batches TO service_role;
GRANT ALL ON public.fin_bank_statement_rows TO service_role;

ALTER TABLE public.fin_bank_statement_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_bank_statement_rows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Finance can read bank batches" ON public.fin_bank_statement_batches
  FOR SELECT TO authenticated
  USING ((public.can_finance(auth.uid()) OR public.can_manage(auth.uid()))
         AND public.has_casino_scope(auth.uid(), casino_id));

CREATE POLICY "Finance can write bank batches" ON public.fin_bank_statement_batches
  FOR ALL TO authenticated
  USING (public.can_finance(auth.uid()) AND public.has_casino_scope(auth.uid(), casino_id))
  WITH CHECK (public.can_finance(auth.uid()) AND public.has_casino_scope(auth.uid(), casino_id));

CREATE POLICY "Finance can read bank rows" ON public.fin_bank_statement_rows
  FOR SELECT TO authenticated
  USING ((public.can_finance(auth.uid()) OR public.can_manage(auth.uid()))
         AND public.has_casino_scope(auth.uid(), casino_id));

CREATE POLICY "Finance can write bank rows" ON public.fin_bank_statement_rows
  FOR ALL TO authenticated
  USING (public.can_finance(auth.uid()) AND public.has_casino_scope(auth.uid(), casino_id))
  WITH CHECK (public.can_finance(auth.uid()) AND public.has_casino_scope(auth.uid(), casino_id));

CREATE TRIGGER trg_bank_batches_touch BEFORE UPDATE ON public.fin_bank_statement_batches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_bank_rows_touch BEFORE UPDATE ON public.fin_bank_statement_rows
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- audit link on expenses
ALTER TABLE public.expenses
  ADD COLUMN bank_statement_row_id uuid
    REFERENCES public.fin_bank_statement_rows(id) ON DELETE SET NULL;
CREATE INDEX idx_expenses_bank_row ON public.expenses(bank_statement_row_id)
  WHERE bank_statement_row_id IS NOT NULL;

-- ============================================================
-- Office expense triggers: imported expenses stay UNAPPROVED
-- and post to the wallet only on approval.
-- ============================================================
CREATE OR REPLACE FUNCTION public.expenses_office_before_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.source = 'office' THEN
    IF NEW.wallet_id IS NULL THEN
      RAISE EXCEPTION 'Office expense requires a wallet';
    END IF;
    -- Bank-statement imports are DRAFTS: they must go through the normal
    -- approval queue. Every other office expense keeps its legacy
    -- auto-approve behaviour.
    IF NEW.bank_statement_row_id IS NULL THEN
      NEW.approved    := true;
      NEW.approved_by := COALESCE(NEW.approved_by, NEW.created_by);
      NEW.approved_at := COALESCE(NEW.approved_at, now());
    ELSE
      NEW.approved    := false;
      NEW.approved_by := NULL;
      NEW.approved_at := NULL;
    END IF;
    NEW.shift_id            := NULL;
    NEW.cage_slots_shift_id := NULL;
    NEW.cage_type           := 'live_game'; -- legacy NOT NULL column
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.expenses_office_after_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_rate numeric := COALESCE(NULLIF(NEW.exchange_rate, 0), 1);
  v_tzs  numeric := COALESCE(NEW.amount_tzs, NEW.amount * COALESCE(NULLIF(NEW.exchange_rate, 0), 1));
  v_bd   date := COALESCE(NEW.business_date, business_date_of(now()));
BEGIN
  IF NEW.source = 'office' AND NEW.amount > 0 AND NEW.wallet_id IS NOT NULL
     AND NEW.approved IS TRUE AND NEW.voided_at IS NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.fin_wallet_tx
       WHERE ref_table = 'expenses' AND ref_id = NEW.id
    ) THEN
      RETURN NEW;
    END IF;

    INSERT INTO public.fin_wallet_tx (
      casino_id, wallet_id, kind, category_id,
      amount, currency, fx_rate, amount_tzs,
      ref_table, ref_id, business_date, note, created_by, denominations, posted_at
    ) VALUES (
      NEW.casino_id, NEW.wallet_id, 'expense', NEW.fin_category_id,
      NEW.amount, COALESCE(NEW.currency, 'TZS'), v_rate, v_tzs,
      'expenses', NEW.id, v_bd,
      'Office expense: ' || COALESCE(NULLIF(NEW.description, ''), '(no description)'),
      NEW.created_by, NEW.denominations, now()
    );
  END IF;
  RETURN NEW;
END
$function$;

-- Post / unpost office expenses when approval or void state changes.
CREATE OR REPLACE FUNCTION public.expenses_office_after_approve()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_rate numeric := COALESCE(NULLIF(NEW.exchange_rate, 0), 1);
  v_tzs  numeric := COALESCE(NEW.amount_tzs, NEW.amount * COALESCE(NULLIF(NEW.exchange_rate, 0), 1));
  v_bd   date := COALESCE(NEW.business_date, business_date_of(now()));
BEGIN
  IF COALESCE(NEW.source,'') <> 'office' OR NEW.wallet_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.approved IS NOT TRUE OR NEW.voided_at IS NOT NULL THEN
    DELETE FROM public.fin_wallet_tx WHERE ref_table = 'expenses' AND ref_id = NEW.id;
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.fin_wallet_tx WHERE ref_table = 'expenses' AND ref_id = NEW.id
  ) AND NEW.amount > 0 THEN
    INSERT INTO public.fin_wallet_tx (
      casino_id, wallet_id, kind, category_id,
      amount, currency, fx_rate, amount_tzs,
      ref_table, ref_id, business_date, note, created_by, denominations, posted_at
    ) VALUES (
      NEW.casino_id, NEW.wallet_id, 'expense', NEW.fin_category_id,
      NEW.amount, COALESCE(NEW.currency, 'TZS'), v_rate, v_tzs,
      'expenses', NEW.id, v_bd,
      'Office expense: ' || COALESCE(NULLIF(NEW.description, ''), '(no description)'),
      COALESCE(NEW.approved_by, NEW.created_by), NEW.denominations, now()
    );
  END IF;
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS trg_expenses_office_after_approve ON public.expenses;
CREATE TRIGGER trg_expenses_office_after_approve
  AFTER UPDATE OF approved, voided_at, amount, amount_tzs, business_date
  ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.expenses_office_after_approve();

-- ============================================================
-- Helpers
-- ============================================================
CREATE OR REPLACE FUNCTION public.fin_bank_row_fingerprint(
  _wallet_id uuid, _tx_date date, _reference text, _description text,
  _signed numeric, _currency text, _occurrence integer
) RETURNS text
LANGUAGE sql IMMUTABLE
AS $function$
  SELECT md5(
    _wallet_id::text || '|' || _tx_date::text || '|' ||
    lower(btrim(COALESCE(_reference,''))) || '|' ||
    lower(btrim(COALESCE(_description,''))) || '|' ||
    to_char(COALESCE(_signed,0), 'FM999999999999990.00') || '|' ||
    upper(COALESCE(_currency,'TZS')) || '|' || COALESCE(_occurrence,1)::text
  );
$function$;

CREATE OR REPLACE FUNCTION public.fin_bank_recompute_batch_status(_batch_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_total int; v_confirmed int; v_open int;
BEGIN
  SELECT count(*),
         count(*) FILTER (WHERE status = 'confirmed'),
         count(*) FILTER (WHERE status IN ('pending','matched','error'))
    INTO v_total, v_confirmed, v_open
    FROM public.fin_bank_statement_rows WHERE batch_id = _batch_id;

  UPDATE public.fin_bank_statement_batches SET
    status = CASE
      WHEN status = 'abandoned' THEN 'abandoned'
      WHEN v_confirmed = 0 THEN 'in_review'
      WHEN v_open > 0 THEN 'partially_confirmed'
      ELSE 'confirmed' END,
    confirmed_at = CASE WHEN v_confirmed > 0 AND v_open = 0 THEN COALESCE(confirmed_at, now()) ELSE confirmed_at END,
    updated_at = now()
  WHERE id = _batch_id;
END $function$;

CREATE OR REPLACE FUNCTION public.fin_bank_import_guard(_casino_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF NOT public.can_finance(auth.uid()) THEN
    RAISE EXCEPTION 'finance role required';
  END IF;
  IF NOT public.has_casino_scope(auth.uid(), _casino_id) THEN
    RAISE EXCEPTION 'casino access denied';
  END IF;
END $function$;

-- ============================================================
-- Create batch + rows (parse result), auto-match + duplicate flags
-- p_rows: [{tx_date, description, reference, debit, credit, currency}]
-- ============================================================
CREATE OR REPLACE FUNCTION public.fin_bank_import_create_batch(
  p_casino_id uuid,
  p_wallet_id uuid,
  p_filename text,
  p_file_hash text,
  p_rows jsonb,
  p_opening numeric DEFAULT NULL,
  p_closing numeric DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_wallet public.fin_wallets%ROWTYPE;
  v_batch_id uuid;
  v_row jsonb;
  v_idx int := 0;
  v_debit numeric; v_credit numeric; v_signed numeric;
  v_date date; v_desc text; v_ref text; v_ccy text;
  v_occ int; v_fp text;
  v_match_expense uuid; v_match_tx uuid; v_dup uuid;
  v_status text; v_kind text; v_cat uuid;
BEGIN
  PERFORM public.fin_bank_import_guard(p_casino_id);

  SELECT * INTO v_wallet FROM public.fin_wallets
   WHERE id = p_wallet_id AND casino_id = p_casino_id AND is_active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'bank wallet not found for this casino'; END IF;
  IF v_wallet.kind NOT IN ('bank','selcom','mobile_money','digital') THEN
    RAISE EXCEPTION 'statement import is only allowed for bank-like wallets (got %)', v_wallet.kind;
  END IF;
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) = 0 THEN
    RAISE EXCEPTION 'no rows to import';
  END IF;

  INSERT INTO public.fin_bank_statement_batches (
    casino_id, wallet_id, filename, file_hash, currency,
    opening_balance, closing_balance, uploaded_by
  ) VALUES (
    p_casino_id, p_wallet_id, COALESCE(p_filename,''), p_file_hash,
    COALESCE(v_wallet.currency,'TZS'), p_opening, p_closing, auth.uid()
  ) RETURNING id INTO v_batch_id;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    v_idx := v_idx + 1;
    v_date := (v_row->>'tx_date')::date;
    v_desc := COALESCE(v_row->>'description','');
    v_ref  := NULLIF(btrim(COALESCE(v_row->>'reference','')), '');
    v_debit  := ABS(COALESCE((v_row->>'debit')::numeric, 0));
    v_credit := ABS(COALESCE((v_row->>'credit')::numeric, 0));
    v_signed := v_credit - v_debit;
    v_ccy := upper(COALESCE(NULLIF(v_row->>'currency',''), v_wallet.currency, 'TZS'));

    -- occurrence index for identical rows inside the same statement
    SELECT count(*) + 1 INTO v_occ FROM public.fin_bank_statement_rows r
      WHERE r.batch_id = v_batch_id AND r.tx_date = v_date
        AND COALESCE(r.reference,'') = COALESCE(v_ref,'')
        AND lower(btrim(r.description)) = lower(btrim(v_desc))
        AND r.signed_amount = v_signed;

    v_fp := public.fin_bank_row_fingerprint(p_wallet_id, v_date, v_ref, v_desc, v_signed, v_ccy, v_occ);

    -- duplicate: same fingerprint already exists for this wallet (any earlier batch)
    SELECT r.id INTO v_dup FROM public.fin_bank_statement_rows r
      WHERE r.wallet_id = p_wallet_id AND r.fingerprint = v_fp
        AND r.batch_id <> v_batch_id AND r.status <> 'ignored'
      ORDER BY r.created_at LIMIT 1;

    v_match_expense := NULL; v_match_tx := NULL; v_cat := NULL;

    IF v_signed < 0 THEN
      v_kind := 'expense';
      -- match an already-posted office expense on this wallet
      SELECT e.id INTO v_match_expense FROM public.expenses e
       WHERE e.wallet_id = p_wallet_id
         AND e.casino_id = p_casino_id
         AND e.voided_at IS NULL
         AND e.approved = true
         AND e.amount = ABS(v_signed)
         AND COALESCE(e.currency,'TZS') = v_ccy
         AND e.business_date BETWEEN v_date - 3 AND v_date + 3
         AND NOT EXISTS (SELECT 1 FROM public.fin_bank_statement_rows x
                          WHERE x.matched_expense_id = e.id OR x.expense_id = e.id)
       ORDER BY abs(e.business_date - v_date), e.created_at
       LIMIT 1;
      IF v_match_expense IS NOT NULL THEN
        SELECT fin_category_id INTO v_cat FROM public.expenses WHERE id = v_match_expense;
      END IF;
    ELSIF v_signed > 0 THEN
      v_kind := 'income';
      SELECT t.id INTO v_match_tx FROM public.fin_wallet_tx t
       WHERE t.wallet_id = p_wallet_id
         AND t.casino_id = p_casino_id
         AND t.amount = v_signed
         AND COALESCE(t.currency,'TZS') = v_ccy
         AND t.kind <> 'expense'
         AND t.business_date BETWEEN v_date - 3 AND v_date + 3
         AND NOT EXISTS (SELECT 1 FROM public.fin_bank_statement_rows x
                          WHERE x.matched_wallet_tx_id = t.id OR x.wallet_tx_id = t.id)
       ORDER BY abs(t.business_date - v_date), t.created_at
       LIMIT 1;
    ELSE
      v_kind := 'unclassified';
    END IF;

    v_status := CASE
      WHEN v_dup IS NOT NULL THEN 'duplicate'
      WHEN v_match_expense IS NOT NULL OR v_match_tx IS NOT NULL THEN 'matched'
      ELSE 'pending' END;

    INSERT INTO public.fin_bank_statement_rows (
      batch_id, casino_id, wallet_id, row_index, tx_date, description, reference,
      debit, credit, signed_amount, currency, fingerprint, proposed_kind,
      fin_category_id, matched_expense_id, matched_wallet_tx_id,
      is_duplicate, duplicate_of, status
    ) VALUES (
      v_batch_id, p_casino_id, p_wallet_id, v_idx, v_date, v_desc, v_ref,
      v_debit, v_credit, v_signed, v_ccy, v_fp, v_kind,
      v_cat, v_match_expense, v_match_tx,
      v_dup IS NOT NULL, v_dup, v_status
    );
  END LOOP;

  UPDATE public.fin_bank_statement_batches b SET
    row_count = s.cnt, total_debit = s.d, total_credit = s.c,
    period_from = s.dmin, period_to = s.dmax
  FROM (SELECT count(*) cnt, COALESCE(sum(debit),0) d, COALESCE(sum(credit),0) c,
               min(tx_date) dmin, max(tx_date) dmax
          FROM public.fin_bank_statement_rows WHERE batch_id = v_batch_id) s
  WHERE b.id = v_batch_id;

  RETURN v_batch_id;
END $function$;

-- ============================================================
-- Row edits
-- ============================================================
CREATE OR REPLACE FUNCTION public.fin_bank_import_update_row(
  p_row_id uuid,
  p_fin_category_id uuid DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_proposed_kind text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE r public.fin_bank_statement_rows%ROWTYPE;
BEGIN
  SELECT * INTO r FROM public.fin_bank_statement_rows WHERE id = p_row_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'row not found'; END IF;
  PERFORM public.fin_bank_import_guard(r.casino_id);
  IF r.status = 'confirmed' THEN RAISE EXCEPTION 'row already confirmed'; END IF;

  UPDATE public.fin_bank_statement_rows SET
    fin_category_id = COALESCE(p_fin_category_id, fin_category_id),
    description = COALESCE(NULLIF(btrim(COALESCE(p_description,'')), ''), description),
    proposed_kind = COALESCE(NULLIF(p_proposed_kind,''), proposed_kind),
    error_text = NULL
  WHERE id = p_row_id;
END $function$;

CREATE OR REPLACE FUNCTION public.fin_bank_import_ignore_row(
  p_row_id uuid, p_note text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE r public.fin_bank_statement_rows%ROWTYPE;
BEGIN
  SELECT * INTO r FROM public.fin_bank_statement_rows WHERE id = p_row_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'row not found'; END IF;
  PERFORM public.fin_bank_import_guard(r.casino_id);
  IF r.status = 'confirmed' THEN RAISE EXCEPTION 'cannot ignore a confirmed row'; END IF;

  UPDATE public.fin_bank_statement_rows
     SET status = 'ignored', note = COALESCE(p_note, note), error_text = NULL
   WHERE id = p_row_id;
  PERFORM public.fin_bank_recompute_batch_status(r.batch_id);
END $function$;

-- ============================================================
-- Confirm a single row (idempotent, DB authoritative)
-- ============================================================
CREATE OR REPLACE FUNCTION public.fin_bank_import_confirm_row(p_row_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r public.fin_bank_statement_rows%ROWTYPE;
  v_wallet public.fin_wallets%ROWTYPE;
  v_rate numeric := 1;
  v_exp uuid;
BEGIN
  SELECT * INTO r FROM public.fin_bank_statement_rows WHERE id = p_row_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'row not found'; END IF;
  PERFORM public.fin_bank_import_guard(r.casino_id);

  IF r.status = 'confirmed' THEN
    RETURN jsonb_build_object('row_id', r.id, 'result', 'already_confirmed', 'expense_id', r.expense_id);
  END IF;
  IF r.status = 'ignored' THEN RAISE EXCEPTION 'row is ignored'; END IF;
  IF r.is_duplicate THEN RAISE EXCEPTION 'duplicate row — ignore it or delete the batch'; END IF;

  -- MATCHED: reconcile only, never create a second accounting record
  IF r.matched_expense_id IS NOT NULL OR r.matched_wallet_tx_id IS NOT NULL THEN
    UPDATE public.fin_bank_statement_rows SET
      status = 'confirmed', confirmed_by = auth.uid(), confirmed_at = now(),
      expense_id = COALESCE(expense_id, matched_expense_id),
      wallet_tx_id = COALESCE(wallet_tx_id, matched_wallet_tx_id),
      error_text = NULL
    WHERE id = r.id;
    PERFORM public.fin_bank_recompute_batch_status(r.batch_id);
    RETURN jsonb_build_object('row_id', r.id, 'result', 'reconciled');
  END IF;

  -- CREDIT with no match: never auto-convert to an expense
  IF r.signed_amount >= 0 THEN
    RAISE EXCEPTION 'incoming credit must be matched to an existing movement or ignored';
  END IF;

  SELECT * INTO v_wallet FROM public.fin_wallets WHERE id = r.wallet_id;
  IF COALESCE(r.currency,'TZS') <> 'TZS' THEN
    SELECT rate_to_tzs INTO v_rate FROM public.fin_daily_rates
     WHERE casino_id = r.casino_id AND currency = r.currency AND business_date <= r.tx_date
     ORDER BY business_date DESC LIMIT 1;
    v_rate := COALESCE(NULLIF(v_rate,0), 1);
  END IF;

  -- NEW office expense DRAFT: not approved, no wallet posting yet
  INSERT INTO public.expenses (
    casino_id, category, category_code, fin_category_id, amount, description,
    player_name, created_by, cage_type, source, wallet_id, currency,
    exchange_rate, amount_tzs, business_date, bank_statement_row_id, approved
  ) VALUES (
    r.casino_id, 'other'::expense_category, 'other', r.fin_category_id,
    ABS(r.signed_amount),
    COALESCE(NULLIF(btrim(r.description), ''), 'Bank statement ' || r.tx_date::text),
    '', auth.uid(), 'live_game', 'office', r.wallet_id, r.currency,
    v_rate, ABS(r.signed_amount) * v_rate, r.tx_date, r.id, false
  ) RETURNING id INTO v_exp;

  UPDATE public.fin_bank_statement_rows SET
    status = 'confirmed', expense_id = v_exp, proposed_kind = 'expense',
    confirmed_by = auth.uid(), confirmed_at = now(), error_text = NULL
  WHERE id = r.id;

  PERFORM public.fin_bank_recompute_batch_status(r.batch_id);
  RETURN jsonb_build_object('row_id', r.id, 'result', 'expense_created', 'expense_id', v_exp);
END $function$;

-- ============================================================
-- Confirm all eligible rows in a batch
-- ============================================================
CREATE OR REPLACE FUNCTION public.fin_bank_import_confirm_batch(p_batch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  b public.fin_bank_statement_batches%ROWTYPE;
  r record;
  v_created int := 0; v_reconciled int := 0; v_skipped int := 0; v_errors int := 0;
  v_res jsonb;
BEGIN
  SELECT * INTO b FROM public.fin_bank_statement_batches WHERE id = p_batch_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'batch not found'; END IF;
  PERFORM public.fin_bank_import_guard(b.casino_id);

  FOR r IN SELECT * FROM public.fin_bank_statement_rows
            WHERE batch_id = p_batch_id
              AND status IN ('pending','matched','error')
              AND is_duplicate = false
            ORDER BY row_index LOOP
    -- unmatched credits are left for manual classification
    IF r.signed_amount >= 0 AND r.matched_wallet_tx_id IS NULL AND r.matched_expense_id IS NULL THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;
    BEGIN
      v_res := public.fin_bank_import_confirm_row(r.id);
      IF v_res->>'result' = 'expense_created' THEN v_created := v_created + 1;
      ELSE v_reconciled := v_reconciled + 1; END IF;
    EXCEPTION WHEN others THEN
      v_errors := v_errors + 1;
      UPDATE public.fin_bank_statement_rows
         SET status = 'error', error_text = SQLERRM WHERE id = r.id;
    END;
  END LOOP;

  PERFORM public.fin_bank_recompute_batch_status(p_batch_id);
  RETURN jsonb_build_object('created', v_created, 'reconciled', v_reconciled,
                            'skipped', v_skipped, 'errors', v_errors);
END $function$;

-- ============================================================
-- Delete / abandon an unconfirmed batch
-- ============================================================
CREATE OR REPLACE FUNCTION public.fin_bank_import_delete_batch(p_batch_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE b public.fin_bank_statement_batches%ROWTYPE; v_confirmed int;
BEGIN
  SELECT * INTO b FROM public.fin_bank_statement_batches WHERE id = p_batch_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'batch not found'; END IF;
  PERFORM public.fin_bank_import_guard(b.casino_id);

  SELECT count(*) INTO v_confirmed FROM public.fin_bank_statement_rows
   WHERE batch_id = p_batch_id AND status = 'confirmed';
  IF v_confirmed > 0 THEN
    RAISE EXCEPTION 'batch has % confirmed row(s) — accounting records cannot be deleted', v_confirmed;
  END IF;

  DELETE FROM public.fin_bank_statement_batches WHERE id = p_batch_id;
END $function$;

REVOKE ALL ON FUNCTION public.fin_bank_import_create_batch(uuid,uuid,text,text,jsonb,numeric,numeric) FROM public;
GRANT EXECUTE ON FUNCTION public.fin_bank_import_create_batch(uuid,uuid,text,text,jsonb,numeric,numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fin_bank_import_update_row(uuid,uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fin_bank_import_ignore_row(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fin_bank_import_confirm_row(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fin_bank_import_confirm_batch(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fin_bank_import_delete_batch(uuid) TO authenticated;