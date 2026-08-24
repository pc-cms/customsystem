-- ============================================================
-- 1) UNPLANNED EXPENSES — extend boss_report_extras
-- ============================================================
ALTER TABLE public.boss_report_extras
  ADD COLUMN IF NOT EXISTS business_date date,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'TZS',
  ADD COLUMN IF NOT EXISTS fx_rate numeric NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS amount_tzs numeric,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS paid boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS paid_by uuid,
  ADD COLUMN IF NOT EXISTS paid_business_date date,
  ADD COLUMN IF NOT EXISTS wallet_id uuid REFERENCES public.fin_wallets(id),
  ADD COLUMN IF NOT EXISTS expense_id uuid REFERENCES public.expenses(id),
  ADD COLUMN IF NOT EXISTS wallet_tx_id uuid REFERENCES public.fin_wallet_tx(id),
  ADD COLUMN IF NOT EXISTS reversal_of uuid REFERENCES public.boss_report_extras(id),
  ADD COLUMN IF NOT EXISTS reversed_by uuid REFERENCES public.boss_report_extras(id),
  ADD COLUMN IF NOT EXISTS voided_at timestamptz,
  ADD COLUMN IF NOT EXISTS voided_by uuid,
  ADD COLUMN IF NOT EXISTS note text;

-- legacy rows: business date = 1st of their month, amount_tzs = amount
UPDATE public.boss_report_extras
   SET business_date = COALESCE(business_date, make_date(year, month, 1)),
       amount_tzs    = COALESCE(amount_tzs, amount),
       description   = COALESCE(description, label)
 WHERE business_date IS NULL OR amount_tzs IS NULL OR description IS NULL;

CREATE OR REPLACE FUNCTION public.tg_unplanned_normalize()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $fn$
BEGIN
  NEW.business_date := COALESCE(NEW.business_date, make_date(NEW.year, NEW.month, 1));
  NEW.year  := EXTRACT(YEAR  FROM NEW.business_date)::int;
  NEW.month := EXTRACT(MONTH FROM NEW.business_date)::int;
  NEW.currency := COALESCE(NULLIF(NEW.currency,''), 'TZS');
  IF NEW.currency = 'TZS' THEN
    NEW.fx_rate := 1;
  ELSE
    NEW.fx_rate := COALESCE(NULLIF(NEW.fx_rate,0), NULLIF(public.fin_rate_for(NEW.casino_id, NEW.currency, NEW.business_date),0), 1);
  END IF;
  NEW.amount_tzs := COALESCE(NEW.amount,0) * COALESCE(NULLIF(NEW.fx_rate,0),1);
  NEW.description := COALESCE(NULLIF(btrim(COALESCE(NEW.description,'')),''), NEW.label);
  NEW.label := COALESCE(NULLIF(btrim(COALESCE(NEW.label,'')),''), NEW.description, 'Unplanned');
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS trg_unplanned_normalize ON public.boss_report_extras;
CREATE TRIGGER trg_unplanned_normalize
BEFORE INSERT OR UPDATE ON public.boss_report_extras
FOR EACH ROW EXECUTE FUNCTION public.tg_unplanned_normalize();

-- Never delete an unplanned expense: corrections go through storno.
CREATE OR REPLACE FUNCTION public.tg_unplanned_no_delete()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $fn$
BEGIN
  IF public.has_role(auth.uid(), 'super_admin') THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'Unplanned expenses are permanent — use a reversal instead of delete';
END $fn$;

DROP TRIGGER IF EXISTS trg_unplanned_no_delete ON public.boss_report_extras;
CREATE TRIGGER trg_unplanned_no_delete
BEFORE DELETE ON public.boss_report_extras
FOR EACH ROW EXECUTE FUNCTION public.tg_unplanned_no_delete();

-- Floor / shift / general managers may ENTER unplanned expenses for their casino.
DROP POLICY IF EXISTS boss_extras_insert_scope ON public.boss_report_extras;
CREATE POLICY boss_extras_insert_scope ON public.boss_report_extras
FOR INSERT TO authenticated
WITH CHECK (
  public.has_casino_scope(auth.uid(), casino_id)
  AND (
    public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'finance_manager')
    OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'shift_manager')
    OR public.has_role(auth.uid(),'general_manager') OR public.has_role(auth.uid(),'boss')
  )
);

GRANT SELECT, INSERT, UPDATE ON public.boss_report_extras TO authenticated;
GRANT ALL ON public.boss_report_extras TO service_role;

-- Add an unplanned expense (Dashboard TV, per casino)
CREATE OR REPLACE FUNCTION public.fin_unplanned_add(
  p_casino_id uuid, p_business_date date, p_description text,
  p_amount numeric, p_currency text DEFAULT 'TZS', p_note text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_uid uuid := auth.uid(); v_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.has_casino_scope(v_uid, p_casino_id) THEN RAISE EXCEPTION 'No access to this casino'; END IF;
  IF COALESCE(p_amount,0) = 0 THEN RAISE EXCEPTION 'Amount must not be 0'; END IF;
  IF COALESCE(btrim(p_description),'') = '' THEN RAISE EXCEPTION 'Description is required'; END IF;
  INSERT INTO public.boss_report_extras (
    casino_id, year, month, business_date, label, description, amount, currency,
    sort_order, created_by, note
  ) VALUES (
    p_casino_id,
    EXTRACT(YEAR FROM COALESCE(p_business_date, CURRENT_DATE))::int,
    EXTRACT(MONTH FROM COALESCE(p_business_date, CURRENT_DATE))::int,
    COALESCE(p_business_date, CURRENT_DATE),
    btrim(p_description), btrim(p_description), p_amount, COALESCE(p_currency,'TZS'),
    100, v_uid, NULLIF(btrim(COALESCE(p_note,'')),'')
  ) RETURNING id INTO v_id;
  RETURN v_id;
END $fn$;

-- Mark an unplanned expense PAID — finance roles only, auditable, once.
CREATE OR REPLACE FUNCTION public.fin_unplanned_mark_paid(
  p_id uuid, p_wallet_id uuid DEFAULT NULL, p_paid_date date DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_uid uuid := auth.uid(); r public.boss_report_extras%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO r FROM public.boss_report_extras WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Record not found'; END IF;
  IF NOT (public.has_role(v_uid,'super_admin') OR public.can_finance(v_uid)) THEN
    RAISE EXCEPTION 'Only finance may mark an unplanned expense as paid';
  END IF;
  IF r.voided_at IS NOT NULL THEN RAISE EXCEPTION 'Record is reversed'; END IF;
  IF r.paid THEN RAISE EXCEPTION 'Already paid'; END IF;
  UPDATE public.boss_report_extras
     SET paid = true, paid_at = now(), paid_by = v_uid,
         paid_business_date = COALESCE(p_paid_date, CURRENT_DATE),
         wallet_id = COALESCE(p_wallet_id, wallet_id)
   WHERE id = p_id;
END $fn$;

-- Immutable correction: storno row (negative), original stays visible forever.
CREATE OR REPLACE FUNCTION public.fin_unplanned_reverse(p_id uuid, p_reason text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_uid uuid := auth.uid(); r public.boss_report_extras%ROWTYPE; v_new uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO r FROM public.boss_report_extras WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Record not found'; END IF;
  IF NOT (public.has_role(v_uid,'super_admin') OR public.can_finance(v_uid)) THEN
    RAISE EXCEPTION 'Only finance may reverse an unplanned expense';
  END IF;
  IF r.reversed_by IS NOT NULL THEN RAISE EXCEPTION 'Already reversed'; END IF;
  IF r.reversal_of IS NOT NULL THEN RAISE EXCEPTION 'A reversal cannot be reversed'; END IF;
  INSERT INTO public.boss_report_extras (
    casino_id, year, month, business_date, label, description, amount, currency, fx_rate,
    sort_order, created_by, paid, paid_at, paid_by, paid_business_date, wallet_id,
    reversal_of, note
  ) VALUES (
    r.casino_id, r.year, r.month, r.business_date, r.label,
    concat('Storno: ', COALESCE(r.description, r.label)), -r.amount, r.currency, r.fx_rate,
    r.sort_order, v_uid, r.paid, r.paid_at, r.paid_by, r.paid_business_date, r.wallet_id,
    r.id, NULLIF(btrim(COALESCE(p_reason,'')),'')
  ) RETURNING id INTO v_new;
  UPDATE public.boss_report_extras
     SET reversed_by = v_new, voided_at = now(), voided_by = v_uid
   WHERE id = r.id;
  RETURN v_new;
END $fn$;

-- ============================================================
-- 2) LIABILITIES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.fin_liabilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  casino_id uuid NOT NULL REFERENCES public.casinos(id) ON DELETE CASCADE,
  creditor text NOT NULL,
  description text,
  amount numeric NOT NULL,
  currency text NOT NULL DEFAULT 'TZS',
  fx_rate numeric NOT NULL DEFAULT 1,
  amount_tzs numeric NOT NULL DEFAULT 0,
  business_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date,
  source text NOT NULL DEFAULT 'manual',            -- manual | intercompany
  transfer_id uuid REFERENCES public.fin_inter_casino_transfers(id),
  created_by uuid,
  reversal_of uuid REFERENCES public.fin_liabilities(id),
  reversed_by uuid REFERENCES public.fin_liabilities(id),
  voided_at timestamptz,
  voided_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS fin_liabilities_transfer_uniq
  ON public.fin_liabilities(transfer_id) WHERE transfer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS fin_liabilities_casino_date ON public.fin_liabilities(casino_id, business_date);

GRANT SELECT, INSERT, UPDATE ON public.fin_liabilities TO authenticated;
GRANT ALL ON public.fin_liabilities TO service_role;
ALTER TABLE public.fin_liabilities ENABLE ROW LEVEL SECURITY;

CREATE POLICY fin_liabilities_read ON public.fin_liabilities
FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'super_admin') OR public.can_finance(auth.uid())
       OR public.has_role(auth.uid(),'boss') OR public.has_role(auth.uid(),'general_manager')
       OR public.has_casino_scope(auth.uid(), casino_id));
CREATE POLICY fin_liabilities_write ON public.fin_liabilities
FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(),'super_admin') OR public.can_finance(auth.uid()));
CREATE POLICY fin_liabilities_update ON public.fin_liabilities
FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(),'super_admin') OR public.can_finance(auth.uid()))
WITH CHECK (public.has_role(auth.uid(),'super_admin') OR public.can_finance(auth.uid()));

CREATE TABLE IF NOT EXISTS public.fin_liability_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  liability_id uuid NOT NULL REFERENCES public.fin_liabilities(id) ON DELETE CASCADE,
  casino_id uuid NOT NULL REFERENCES public.casinos(id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  currency text NOT NULL DEFAULT 'TZS',
  fx_rate numeric NOT NULL DEFAULT 1,
  amount_tzs numeric NOT NULL DEFAULT 0,
  business_date date NOT NULL DEFAULT CURRENT_DATE,
  wallet_id uuid REFERENCES public.fin_wallets(id),
  wallet_tx_id uuid REFERENCES public.fin_wallet_tx(id),
  transfer_id uuid REFERENCES public.fin_inter_casino_transfers(id),
  note text,
  created_by uuid,
  reversal_of uuid REFERENCES public.fin_liability_payments(id),
  voided_at timestamptz,
  voided_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fin_liability_payments_liab ON public.fin_liability_payments(liability_id);
CREATE INDEX IF NOT EXISTS fin_liability_payments_casino_date ON public.fin_liability_payments(casino_id, business_date);

GRANT SELECT, INSERT ON public.fin_liability_payments TO authenticated;
GRANT ALL ON public.fin_liability_payments TO service_role;
ALTER TABLE public.fin_liability_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY fin_liab_pay_read ON public.fin_liability_payments
FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'super_admin') OR public.can_finance(auth.uid())
       OR public.has_role(auth.uid(),'boss') OR public.has_role(auth.uid(),'general_manager')
       OR public.has_casino_scope(auth.uid(), casino_id));
CREATE POLICY fin_liab_pay_write ON public.fin_liability_payments
FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(),'super_admin') OR public.can_finance(auth.uid()));

-- payments and liabilities are immutable history
CREATE OR REPLACE FUNCTION public.tg_liab_normalize()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $fn$
BEGIN
  NEW.currency := COALESCE(NULLIF(NEW.currency,''),'TZS');
  IF NEW.currency = 'TZS' THEN NEW.fx_rate := 1;
  ELSE NEW.fx_rate := COALESCE(NULLIF(NEW.fx_rate,0), NULLIF(public.fin_rate_for(NEW.casino_id, NEW.currency, NEW.business_date),0), 1);
  END IF;
  NEW.amount_tzs := COALESCE(NEW.amount,0) * COALESCE(NULLIF(NEW.fx_rate,0),1);
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS trg_liab_normalize ON public.fin_liabilities;
CREATE TRIGGER trg_liab_normalize BEFORE INSERT OR UPDATE ON public.fin_liabilities
FOR EACH ROW EXECUTE FUNCTION public.tg_liab_normalize();
DROP TRIGGER IF EXISTS trg_liab_pay_normalize ON public.fin_liability_payments;
CREATE TRIGGER trg_liab_pay_normalize BEFORE INSERT OR UPDATE ON public.fin_liability_payments
FOR EACH ROW EXECUTE FUNCTION public.tg_liab_normalize();

-- Outstanding liability (TZS) as of a date
CREATE OR REPLACE FUNCTION public.fin_liability_outstanding(p_casino_id uuid, p_asof date)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $fn$
  SELECT COALESCE((SELECT SUM(amount_tzs) FROM public.fin_liabilities
                    WHERE casino_id=p_casino_id AND voided_at IS NULL AND business_date <= p_asof),0)
       - COALESCE((SELECT SUM(p.amount_tzs) FROM public.fin_liability_payments p
                    JOIN public.fin_liabilities l ON l.id = p.liability_id
                    WHERE p.casino_id=p_casino_id AND p.voided_at IS NULL AND l.voided_at IS NULL
                      AND p.business_date <= p_asof),0);
$fn$;

CREATE OR REPLACE FUNCTION public.fin_liability_add(
  p_casino_id uuid, p_creditor text, p_amount numeric, p_business_date date,
  p_description text DEFAULT NULL, p_currency text DEFAULT 'TZS', p_due_date date DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_uid uuid := auth.uid(); v_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT (public.has_role(v_uid,'super_admin') OR public.can_finance(v_uid)) THEN
    RAISE EXCEPTION 'Only finance may create liabilities';
  END IF;
  IF COALESCE(p_amount,0) <= 0 THEN RAISE EXCEPTION 'Amount must be positive'; END IF;
  IF COALESCE(btrim(p_creditor),'') = '' THEN RAISE EXCEPTION 'Creditor is required'; END IF;
  INSERT INTO public.fin_liabilities (casino_id, creditor, description, amount, currency,
                                      business_date, due_date, source, created_by)
  VALUES (p_casino_id, btrim(p_creditor), NULLIF(btrim(COALESCE(p_description,'')),''), p_amount,
          COALESCE(p_currency,'TZS'), COALESCE(p_business_date, CURRENT_DATE), p_due_date, 'manual', v_uid)
  RETURNING id INTO v_id;
  RETURN v_id;
END $fn$;

CREATE OR REPLACE FUNCTION public.fin_liability_pay(
  p_liability_id uuid, p_amount numeric, p_business_date date,
  p_wallet_id uuid DEFAULT NULL, p_note text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_uid uuid := auth.uid(); l public.fin_liabilities%ROWTYPE;
        v_paid numeric; v_outstanding numeric; v_amt_tzs numeric; v_rate numeric; v_id uuid;
        v_currency text := 'TZS';
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT (public.has_role(v_uid,'super_admin') OR public.can_finance(v_uid)) THEN
    RAISE EXCEPTION 'Only finance may register liability payments';
  END IF;
  SELECT * INTO l FROM public.fin_liabilities WHERE id = p_liability_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Liability not found'; END IF;
  IF l.voided_at IS NOT NULL THEN RAISE EXCEPTION 'Liability is reversed'; END IF;
  IF COALESCE(p_amount,0) <= 0 THEN RAISE EXCEPTION 'Amount must be positive'; END IF;

  SELECT COALESCE(SUM(amount_tzs),0) INTO v_paid FROM public.fin_liability_payments
   WHERE liability_id = l.id AND voided_at IS NULL;
  v_outstanding := l.amount_tzs - v_paid;

  IF p_wallet_id IS NOT NULL THEN
    SELECT currency INTO v_currency FROM public.fin_wallets WHERE id = p_wallet_id;
    v_currency := COALESCE(v_currency, 'TZS');
  END IF;
  v_rate := CASE WHEN v_currency = 'TZS' THEN 1
                 ELSE COALESCE(NULLIF(public.fin_rate_for(l.casino_id, v_currency, COALESCE(p_business_date, CURRENT_DATE)),0), 1) END;
  v_amt_tzs := p_amount * v_rate;
  IF v_amt_tzs > v_outstanding + 0.5 THEN
    RAISE EXCEPTION 'Payment exceeds outstanding liability (% TZS left)', round(v_outstanding);
  END IF;

  INSERT INTO public.fin_liability_payments (liability_id, casino_id, amount, currency, fx_rate,
                                             business_date, wallet_id, note, created_by)
  VALUES (l.id, l.casino_id, p_amount, v_currency, v_rate,
          COALESCE(p_business_date, CURRENT_DATE), p_wallet_id,
          NULLIF(btrim(COALESCE(p_note,'')),''), v_uid)
  RETURNING id INTO v_id;
  RETURN v_id;
END $fn$;

-- Monthly movement block: opening + new − repaid = closing (+ lists)
CREATE OR REPLACE FUNCTION public.fin_liability_movement(p_casino_id uuid, p_from date, p_to date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_open numeric; v_new numeric; v_repaid numeric; v_items jsonb; v_pays jsonb;
BEGIN
  v_open := public.fin_liability_outstanding(p_casino_id, p_from - 1);
  SELECT COALESCE(SUM(amount_tzs),0) INTO v_new FROM public.fin_liabilities
   WHERE casino_id=p_casino_id AND voided_at IS NULL AND business_date BETWEEN p_from AND p_to;
  SELECT COALESCE(SUM(p.amount_tzs),0) INTO v_repaid FROM public.fin_liability_payments p
   JOIN public.fin_liabilities l ON l.id=p.liability_id
   WHERE p.casino_id=p_casino_id AND p.voided_at IS NULL AND l.voided_at IS NULL
     AND p.business_date BETWEEN p_from AND p_to;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
     'id', l.id, 'creditor', l.creditor, 'description', l.description,
     'amount_tzs', l.amount_tzs, 'currency', l.currency, 'amount', l.amount,
     'business_date', l.business_date, 'due_date', l.due_date, 'source', l.source,
     'transfer_id', l.transfer_id, 'voided_at', l.voided_at,
     'paid_tzs', COALESCE(pp.paid,0),
     'outstanding_tzs', l.amount_tzs - COALESCE(pp.paid,0),
     'status', CASE WHEN l.amount_tzs - COALESCE(pp.paid,0) <= 0.5 THEN 'paid'
                    WHEN COALESCE(pp.paid,0) > 0 THEN 'partial' ELSE 'outstanding' END
   ) ORDER BY l.business_date, l.created_at), '[]'::jsonb)
  INTO v_items
  FROM public.fin_liabilities l
  LEFT JOIN (SELECT liability_id, SUM(amount_tzs) paid FROM public.fin_liability_payments
              WHERE voided_at IS NULL GROUP BY liability_id) pp ON pp.liability_id = l.id
  WHERE l.casino_id = p_casino_id AND l.business_date <= p_to
    AND (l.business_date >= p_from OR l.amount_tzs - COALESCE(pp.paid,0) > 0.5);

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
     'id', p.id, 'liability_id', p.liability_id, 'amount_tzs', p.amount_tzs,
     'business_date', p.business_date, 'wallet_id', p.wallet_id, 'note', p.note
   ) ORDER BY p.business_date, p.created_at), '[]'::jsonb)
  INTO v_pays
  FROM public.fin_liability_payments p
  WHERE p.casino_id=p_casino_id AND p.voided_at IS NULL AND p.business_date BETWEEN p_from AND p_to;

  RETURN jsonb_build_object(
    'opening_tzs', v_open, 'new_tzs', v_new, 'repaid_tzs', v_repaid,
    'closing_tzs', v_open + v_new - v_repaid,
    'items', v_items, 'payments', v_pays
  );
END $fn$;

-- Repayable intercompany funding creates a liability at the receiver on acceptance
ALTER TABLE public.fin_inter_casino_transfers
  ADD COLUMN IF NOT EXISTS repayable boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.tg_ic_transfer_liability()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
BEGIN
  IF COALESCE(NEW.status,'') <> 'accepted' THEN RETURN NEW; END IF;
  -- Float transfers / adjustments never create a liability.
  IF COALESCE(NEW.kind,'funding') = 'funding' AND NEW.repayable THEN
    INSERT INTO public.fin_liabilities (casino_id, creditor, description, amount, currency,
                                        business_date, source, transfer_id, created_by)
    SELECT NEW.to_casino_id,
           COALESCE((SELECT name FROM public.casinos WHERE id = NEW.from_casino_id), 'Intercompany'),
           concat('Repayable intercompany funding ', NEW.id::text),
           NEW.amount, COALESCE(NEW.currency,'TZS'), NEW.business_date, 'intercompany',
           NEW.id, COALESCE(NEW.accepted_by, NEW.created_by)
    ON CONFLICT (transfer_id) WHERE transfer_id IS NOT NULL DO NOTHING;
  END IF;
  -- A repayment transfer settles the matching liability at the sender.
  IF COALESCE(NEW.kind,'') = 'repayment' AND NEW.repays_id IS NOT NULL THEN
    INSERT INTO public.fin_liability_payments (liability_id, casino_id, amount, currency,
                                               business_date, transfer_id, note, created_by)
    SELECT l.id, l.casino_id, NEW.amount, COALESCE(NEW.currency,'TZS'), NEW.business_date,
           NEW.id, concat('Intercompany repayment ', NEW.id::text), COALESCE(NEW.accepted_by, NEW.created_by)
    FROM public.fin_liabilities l
    WHERE l.transfer_id = NEW.repays_id AND l.voided_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM public.fin_liability_payments p WHERE p.transfer_id = NEW.id);
  END IF;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS trg_ic_transfer_liability ON public.fin_inter_casino_transfers;
CREATE TRIGGER trg_ic_transfer_liability
AFTER INSERT OR UPDATE OF status ON public.fin_inter_casino_transfers
FOR EACH ROW EXECUTE FUNCTION public.tg_ic_transfer_liability();

-- ============================================================
-- 3) SIGNED FLOAT ADJUSTMENT
-- ============================================================
CREATE OR REPLACE FUNCTION public.fin_adjust_float(
  p_casino_id uuid, p_wallet_id uuid, p_amount numeric,
  p_business_date date DEFAULT NULL, p_note text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_uid uuid := auth.uid(); w public.fin_wallets%ROWTYPE;
        v_date date := COALESCE(p_business_date, CURRENT_DATE);
        v_rate numeric; v_current numeric; v_delta numeric; v_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT (public.has_role(v_uid,'super_admin') OR public.can_finance(v_uid)) THEN
    RAISE EXCEPTION 'Only finance may adjust the Basic Float';
  END IF;
  IF COALESCE(p_amount,0) = 0 THEN RAISE EXCEPTION 'Amount must not be 0'; END IF;
  SELECT * INTO w FROM public.fin_wallets WHERE id = p_wallet_id;
  IF NOT FOUND OR w.casino_id <> p_casino_id THEN RAISE EXCEPTION 'Wallet not found for this casino'; END IF;

  v_rate := CASE WHEN COALESCE(w.currency,'TZS')='TZS' THEN 1
                 ELSE COALESCE(NULLIF(public.fin_rate_for(p_casino_id, w.currency, v_date),0), 1) END;
  v_delta := p_amount * v_rate;

  SELECT COALESCE(SUM(starting_float_amount * CASE WHEN COALESCE(currency,'TZS')='TZS' THEN 1
        ELSE COALESCE(NULLIF(public.fin_rate_for(p_casino_id, currency, v_date),0),1) END),0)
    INTO v_current FROM public.fin_wallets WHERE casino_id=p_casino_id AND is_active;
  v_current := v_current + COALESCE((
    SELECT SUM(COALESCE(amount,0) * COALESCE(NULLIF(fx_rate,0),1)) FROM public.fin_other_incomes
     WHERE casino_id=p_casino_id AND business_date <= v_date
       AND reverses_id IS NULL AND reversed_by_id IS NULL AND COALESCE(source,'')='add_float'),0);

  IF v_current + v_delta < -0.5 THEN
    RAISE EXCEPTION 'Basic Float cannot become negative (current % TZS)', round(v_current);
  END IF;

  INSERT INTO public.fin_other_incomes (casino_id, business_date, wallet_id, source, currency,
                                        amount, fx_rate, note, created_by)
  VALUES (p_casino_id, v_date, w.id, 'add_float', COALESCE(w.currency,'TZS'),
          p_amount, v_rate, NULLIF(btrim(COALESCE(p_note,'')),''), v_uid)
  RETURNING id INTO v_id;
  RETURN v_id;
END $fn$;

-- ============================================================
-- 4) MONTH FINANCE + IMMUTABLE CLOSING SNAPSHOT + COLLECTIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.fin_month_report_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  casino_id uuid NOT NULL REFERENCES public.casinos(id) ON DELETE CASCADE,
  year int NOT NULL,
  month int NOT NULL,
  payload jsonb NOT NULL,
  closed_at timestamptz NOT NULL DEFAULT now(),
  closed_by uuid,
  reopened_at timestamptz,
  reopened_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (casino_id, year, month)
);
GRANT SELECT ON public.fin_month_report_snapshots TO authenticated;
GRANT ALL ON public.fin_month_report_snapshots TO service_role;
ALTER TABLE public.fin_month_report_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY fmrs_read ON public.fin_month_report_snapshots
FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'super_admin') OR public.can_finance(auth.uid())
       OR public.has_role(auth.uid(),'boss') OR public.has_role(auth.uid(),'general_manager')
       OR public.has_casino_scope(auth.uid(), casino_id));

CREATE OR REPLACE FUNCTION public.fin_month_finance(p_casino_id uuid, p_year int, p_month int)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  v_start date := make_date(p_year, p_month, 1);
  v_end date := (make_date(p_year, p_month, 1) + interval '1 month - 1 day')::date;
  snap jsonb; liab jsonb; snapshot public.fin_month_report_snapshots%ROWTYPE;
  v_usd numeric; v_budget numeric; v_income numeric; v_expenses numeric; v_collections numeric;
  v_unpl_total numeric; v_unpl_paid numeric; v_unpl_unpaid numeric; v_unpl_paid_cash numeric;
  v_liab_pay numeric; v_cash numeric; v_profit numeric; v_bonus numeric;
  v_float_cur numeric; v_closed boolean; v_items jsonb;
BEGIN
  snap := public.fin_balance_snapshot(p_casino_id, v_start, v_end);
  liab := public.fin_liability_movement(p_casino_id, v_start, v_end);
  SELECT * INTO snapshot FROM public.fin_month_report_snapshots
   WHERE casino_id=p_casino_id AND year=p_year AND month=p_month AND reopened_at IS NULL;
  v_closed := snapshot.id IS NOT NULL;

  v_usd := COALESCE(NULLIF((snap->'rates'->>'usd_tzs'),'')::numeric, 2600);
  SELECT COALESCE(SUM(planned_amount * CASE WHEN currency='USD' THEN v_usd ELSE 1 END),0)
    INTO v_budget FROM public.fin_budget
   WHERE casino_id=p_casino_id AND year=p_year AND month=p_month;

  v_income := COALESCE((snap->'incomes'->>'live_game')::numeric,0)
            + COALESCE((snap->'incomes'->>'slots')::numeric,0)
            + COALESCE((snap->'incomes'->>'bar_income')::numeric,0)
            + COALESCE((snap->'incomes'->>'other')::numeric,0);
  v_expenses := COALESCE((snap->>'expenses_total')::numeric,0);
  v_collections := COALESCE((snap->>'collections_total')::numeric,0);
  v_float_cur := COALESCE((snap->'basic_float'->>'current_tzs')::numeric,0);

  SELECT COALESCE(SUM(amount_tzs),0),
         COALESCE(SUM(amount_tzs) FILTER (WHERE paid),0),
         COALESCE(SUM(amount_tzs) FILTER (WHERE NOT paid),0),
         COALESCE(SUM(amount_tzs) FILTER (WHERE paid AND expense_id IS NULL),0)
    INTO v_unpl_total, v_unpl_paid, v_unpl_unpaid, v_unpl_paid_cash
  FROM public.boss_report_extras
  WHERE casino_id=p_casino_id AND year=p_year AND month=p_month
    AND reversal_of IS NULL AND voided_at IS NULL;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', id, 'business_date', business_date, 'description', COALESCE(description,label),
      'label', label, 'amount', amount, 'currency', currency, 'amount_tzs', amount_tzs,
      'paid', paid, 'paid_at', paid_at, 'paid_business_date', paid_business_date,
      'wallet_id', wallet_id, 'expense_id', expense_id,
      'voided_at', voided_at, 'reversal_of', reversal_of, 'note', note
    ) ORDER BY business_date, created_at), '[]'::jsonb)
    INTO v_items FROM public.boss_report_extras
   WHERE casino_id=p_casino_id AND year=p_year AND month=p_month;

  SELECT COALESCE(SUM(p.amount_tzs),0) INTO v_liab_pay
    FROM public.fin_liability_payments p JOIN public.fin_liabilities l ON l.id=p.liability_id
   WHERE p.casino_id=p_casino_id AND p.voided_at IS NULL AND l.voided_at IS NULL
     AND p.business_date BETWEEN v_start AND v_end;

  -- CASH POSITION: cash on hand. Unpaid unplanned and outstanding liabilities are NOT subtracted.
  v_cash := v_float_cur + v_income
          + COALESCE((snap->'incomes'->>'tips_bonus')::numeric,0)
          + COALESCE((snap->'incomes'->>'jp')::numeric,0)
          + COALESCE((snap->'incomes'->>'movements')::numeric,0)
          - COALESCE((snap->>'transfers_total')::numeric,0)          -- accepted intercompany cash effect
          + COALESCE((snap->'incomes'->>'card_balance')::numeric,0)
          + COALESCE((snap->'incomes'->>'missed_chips')::numeric,0)
          + COALESCE((snap->'incomes'->>'missed_cards')::numeric,0)
          - v_expenses
          - v_unpl_paid_cash                                        -- paid unplanned not already an expense row
          - v_liab_pay
          - v_collections;

  IF v_closed THEN
    v_income   := COALESCE((snapshot.payload->>'total_income')::numeric, v_income);
    v_expenses := COALESCE((snapshot.payload->>'expenses_actual')::numeric, v_expenses);
    v_profit   := COALESCE((snapshot.payload->>'final_profit')::numeric,
                           v_income - v_expenses - COALESCE((liab->>'closing_tzs')::numeric,0));
    v_bonus    := COALESCE((snapshot.payload->>'manager_bonus')::numeric, GREATEST(0, 0.05*(v_income - v_expenses)));
  ELSE
    v_profit := v_income - (v_budget + v_unpl_total + COALESCE((liab->>'closing_tzs')::numeric,0));
    v_bonus  := GREATEST(0, 0.05 * (v_income - v_budget - v_unpl_total));
  END IF;

  RETURN jsonb_build_object(
    'period', jsonb_build_object('start', v_start, 'end', v_end, 'year', p_year, 'month', p_month),
    'status', CASE WHEN v_closed THEN 'closed' ELSE 'open' END,
    'closed_at', snapshot.closed_at, 'closed_by', snapshot.closed_by,
    'usd_rate', v_usd,
    'total_income', v_income,
    'budget', v_budget,
    'expenses_actual', v_expenses,
    'collections', v_collections,
    'unplanned', jsonb_build_object('total', v_unpl_total, 'paid', v_unpl_paid,
                                    'unpaid', v_unpl_unpaid, 'paid_cash_effect', v_unpl_paid_cash,
                                    'items', v_items),
    'liabilities', liab,
    'float', snap->'basic_float',
    'profit', v_profit,
    'manager_bonus', v_bonus,
    'cash_position', v_cash,
    'available_for_collection', GREATEST(0, v_profit - v_collections),
    'snapshot', CASE WHEN v_closed THEN snapshot.payload ELSE NULL END
  );
END $fn$;

CREATE OR REPLACE FUNCTION public.fin_close_month_report(p_casino_id uuid, p_year int, p_month int, p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_uid uuid := auth.uid(); f jsonb; v_payload jsonb; v_liab numeric; v_income numeric; v_exp numeric;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT (public.has_role(v_uid,'super_admin') OR public.can_finance(v_uid)) THEN
    RAISE EXCEPTION 'Only finance may close a month';
  END IF;
  IF EXISTS (SELECT 1 FROM public.fin_month_report_snapshots
              WHERE casino_id=p_casino_id AND year=p_year AND month=p_month AND reopened_at IS NULL) THEN
    RAISE EXCEPTION 'Month already closed';
  END IF;

  f := public.fin_month_finance(p_casino_id, p_year, p_month);
  v_income := COALESCE((f->>'total_income')::numeric,0);
  v_exp := COALESCE((f->>'expenses_actual')::numeric,0);
  v_liab := COALESCE((f->'liabilities'->>'closing_tzs')::numeric,0);

  v_payload := jsonb_build_object(
    'total_income', v_income,
    'budget', COALESCE((f->>'budget')::numeric,0),
    'expenses_actual', v_exp,
    'unplanned', f->'unplanned',
    'liabilities', f->'liabilities',
    'float', f->'float',
    'closing_liabilities', v_liab,
    'final_profit', v_income - v_exp - v_liab,
    'manager_bonus', GREATEST(0, 0.05 * (v_income - v_exp)),
    'cash_position_at_close', COALESCE((f->>'cash_position')::numeric,0),
    'collections_at_close', COALESCE((f->>'collections')::numeric,0),
    'note', NULLIF(btrim(COALESCE(p_note,'')),'')
  );

  INSERT INTO public.fin_month_report_snapshots (casino_id, year, month, payload, closed_by)
  VALUES (p_casino_id, p_year, p_month, v_payload, v_uid)
  ON CONFLICT (casino_id, year, month) DO UPDATE
    SET payload = EXCLUDED.payload, closed_at = now(), closed_by = EXCLUDED.closed_by,
        reopened_at = NULL, reopened_by = NULL;
  RETURN v_payload;
END $fn$;

CREATE OR REPLACE FUNCTION public.fin_reopen_month_report(p_casino_id uuid, p_year int, p_month int, p_reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF NOT public.has_role(v_uid,'super_admin') THEN RAISE EXCEPTION 'Only super_admin may reopen a closed month'; END IF;
  UPDATE public.fin_month_report_snapshots
     SET reopened_at = now(), reopened_by = v_uid,
         payload = payload || jsonb_build_object('reopen_reason', p_reason)
   WHERE casino_id=p_casino_id AND year=p_year AND month=p_month AND reopened_at IS NULL;
END $fn$;

-- Collection with over-collection guard
CREATE OR REPLACE FUNCTION public.fin_record_collection(
  p_casino_id uuid, p_year int, p_month int, p_amount numeric,
  p_wallet_id uuid DEFAULT NULL, p_business_date date DEFAULT NULL, p_note text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_uid uuid := auth.uid(); f jsonb; v_avail numeric; v_cat uuid; v_id uuid;
        v_currency text := 'TZS'; v_rate numeric := 1; v_date date;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT (public.has_role(v_uid,'super_admin') OR public.can_finance(v_uid)) THEN
    RAISE EXCEPTION 'Only finance may record collections';
  END IF;
  IF COALESCE(p_amount,0) <= 0 THEN RAISE EXCEPTION 'Amount must be positive'; END IF;
  v_date := COALESCE(p_business_date, LEAST(CURRENT_DATE, (make_date(p_year,p_month,1) + interval '1 month - 1 day')::date));

  f := public.fin_month_finance(p_casino_id, p_year, p_month);
  v_avail := COALESCE((f->>'available_for_collection')::numeric,0);

  IF p_wallet_id IS NOT NULL THEN
    SELECT COALESCE(currency,'TZS') INTO v_currency FROM public.fin_wallets WHERE id=p_wallet_id;
    v_rate := CASE WHEN v_currency='TZS' THEN 1
                   ELSE COALESCE(NULLIF(public.fin_rate_for(p_casino_id, v_currency, v_date),0),1) END;
  END IF;

  IF p_amount * v_rate > v_avail + 0.5 THEN
    RAISE EXCEPTION 'Collection exceeds available profit (% TZS available)', round(v_avail);
  END IF;

  SELECT id INTO v_cat FROM public.fin_categories
   WHERE group_code='collections' AND name ILIKE 'collection%' ORDER BY sort_order LIMIT 1;
  IF v_cat IS NULL THEN RAISE EXCEPTION 'Collection category is not configured'; END IF;

  INSERT INTO public.expenses (casino_id, category, amount, description, approved, approved_by, approved_at,
                               created_by, business_date, cage_type, source, fin_category_id, wallet_id,
                               currency, exchange_rate, amount_tzs, player_name)
  VALUES (p_casino_id, 'other', p_amount, COALESCE(NULLIF(btrim(COALESCE(p_note,'')),''), 'Collection'),
          true, v_uid, now(), v_uid, v_date, 'office', 'office', v_cat, p_wallet_id,
          v_currency, v_rate, p_amount * v_rate, '')
  RETURNING id INTO v_id;
  RETURN v_id;
END $fn$;

REVOKE ALL ON FUNCTION public.fin_unplanned_add(uuid, date, text, numeric, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fin_unplanned_add(uuid, date, text, numeric, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fin_unplanned_mark_paid(uuid, uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fin_unplanned_reverse(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fin_liability_add(uuid, text, numeric, date, text, text, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fin_liability_pay(uuid, numeric, date, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fin_liability_movement(uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fin_liability_outstanding(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fin_adjust_float(uuid, uuid, numeric, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fin_month_finance(uuid, int, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fin_close_month_report(uuid, int, int, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fin_reopen_month_report(uuid, int, int, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fin_record_collection(uuid, int, int, numeric, uuid, date, text) TO authenticated;