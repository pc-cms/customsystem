-- ============================================================
-- 0. Schema additions
-- ============================================================
ALTER TABLE public.fin_liability_payments
  ADD COLUMN IF NOT EXISTS wallet_tx_id uuid REFERENCES public.fin_wallet_tx(id);

-- One cash posting per (register row, direction) — makes posting idempotent.
CREATE UNIQUE INDEX IF NOT EXISTS fin_wallet_tx_fin_ref_uniq
  ON public.fin_wallet_tx (ref_table, ref_id, kind)
  WHERE ref_table IN ('boss_report_extras', 'fin_liability_payments');

-- ============================================================
-- 1. Close guards
-- ============================================================
CREATE OR REPLACE FUNCTION public.fin_month_report_is_closed(p_casino_id uuid, p_year int, p_month int)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM public.fin_month_report_snapshots
                  WHERE casino_id = p_casino_id AND year = p_year AND month = p_month
                    AND reopened_at IS NULL);
$$;

CREATE OR REPLACE FUNCTION public.fin_assert_month_open(p_casino_id uuid, p_year int, p_month int)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF public.fin_month_report_is_closed(p_casino_id, p_year, p_month) THEN
    RAISE EXCEPTION 'Month %-% is closed: only Collections are allowed (super_admin may reopen)', p_year, p_month;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.fin_assert_date_open(p_casino_id uuid, p_date date)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM public.fin_assert_month_open(p_casino_id,
    EXTRACT(YEAR FROM COALESCE(p_date, CURRENT_DATE))::int,
    EXTRACT(MONTH FROM COALESCE(p_date, CURRENT_DATE))::int);
END $$;

-- ============================================================
-- 2. Canonical wallet cash posting for finance registers
-- ============================================================
CREATE OR REPLACE FUNCTION public.fin_post_wallet_cash(
  p_casino_id uuid, p_wallet_id uuid, p_amount numeric, p_currency text, p_fx numeric,
  p_business_date date, p_out boolean, p_ref_table text, p_ref_id uuid,
  p_note text DEFAULT NULL, p_reversal_of uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE w public.fin_wallets%ROWTYPE; v_cur text; v_fx numeric; v_id uuid;
        v_date date := COALESCE(p_business_date, CURRENT_DATE);
BEGIN
  IF p_wallet_id IS NULL THEN RAISE EXCEPTION 'Wallet is required to post cash'; END IF;
  SELECT * INTO w FROM public.fin_wallets WHERE id = p_wallet_id;
  IF NOT FOUND OR w.casino_id <> p_casino_id THEN RAISE EXCEPTION 'Wallet not found for this casino'; END IF;
  IF COALESCE(p_amount,0) = 0 THEN RAISE EXCEPTION 'Amount must not be 0'; END IF;

  v_cur := COALESCE(NULLIF(p_currency,''), COALESCE(w.currency,'TZS'));
  v_fx := CASE WHEN v_cur = 'TZS' THEN 1
               ELSE COALESCE(NULLIF(p_fx,0),
                             NULLIF(public.fin_rate_for(p_casino_id, v_cur, v_date),0), 1) END;

  INSERT INTO public.fin_wallet_tx (casino_id, wallet_id, kind, amount, currency, fx_rate, amount_tzs,
                                    ref_table, ref_id, reversal_of, business_date, note, created_by, posted_at)
  VALUES (p_casino_id, p_wallet_id,
          CASE WHEN p_out THEN 'manual_expense' ELSE 'income' END,
          abs(p_amount), v_cur, v_fx, abs(p_amount) * v_fx,
          p_ref_table, p_ref_id, p_reversal_of, v_date,
          NULLIF(btrim(COALESCE(p_note,'')),''), COALESCE(auth.uid(), w.created_by), now())
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- ============================================================
-- 3. Unplanned Expenses — add / mark paid (posts cash) / reverse
-- ============================================================
CREATE OR REPLACE FUNCTION public.fin_unplanned_add(
  p_casino_id uuid, p_business_date date, p_description text, p_amount numeric,
  p_currency text DEFAULT 'TZS', p_note text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_uid uuid := auth.uid(); v_id uuid; v_date date := COALESCE(p_business_date, CURRENT_DATE);
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.has_casino_scope(v_uid, p_casino_id) THEN RAISE EXCEPTION 'No access to this casino'; END IF;
  IF NOT (public.has_role(v_uid,'super_admin') OR public.can_finance(v_uid)
          OR public.has_role(v_uid,'manager') OR public.has_role(v_uid,'shift_manager')
          OR public.has_role(v_uid,'general_manager') OR public.has_role(v_uid,'boss')) THEN
    RAISE EXCEPTION 'Only floor / shift / general managers and finance may record unplanned expenses';
  END IF;
  IF COALESCE(p_amount,0) = 0 THEN RAISE EXCEPTION 'Amount must not be 0'; END IF;
  IF COALESCE(btrim(p_description),'') = '' THEN RAISE EXCEPTION 'Description is required'; END IF;
  PERFORM public.fin_assert_date_open(p_casino_id, v_date);

  PERFORM set_config('cms.fin_rpc','1',true);
  INSERT INTO public.boss_report_extras (
    casino_id, year, month, business_date, label, description, amount, currency, sort_order, created_by, note
  ) VALUES (
    p_casino_id,
    EXTRACT(YEAR FROM v_date)::int, EXTRACT(MONTH FROM v_date)::int, v_date,
    btrim(p_description), btrim(p_description), p_amount, COALESCE(p_currency,'TZS'),
    100, v_uid, NULLIF(btrim(COALESCE(p_note,'')),'')
  ) RETURNING id INTO v_id;
  RETURN v_id;
END $$;

DROP FUNCTION IF EXISTS public.fin_unplanned_mark_paid(uuid,uuid,date);
CREATE OR REPLACE FUNCTION public.fin_unplanned_mark_paid(
  p_id uuid, p_wallet_id uuid DEFAULT NULL, p_paid_date date DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_uid uuid := auth.uid(); r public.boss_report_extras%ROWTYPE;
        v_wallet uuid; v_tx uuid; v_date date;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT (public.has_role(v_uid,'super_admin') OR public.can_finance(v_uid)) THEN
    RAISE EXCEPTION 'Only finance may mark an unplanned expense as paid';
  END IF;
  SELECT * INTO r FROM public.boss_report_extras WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Record not found'; END IF;
  IF r.voided_at IS NOT NULL THEN RAISE EXCEPTION 'Record is reversed'; END IF;
  PERFORM public.fin_assert_month_open(r.casino_id, r.year, r.month);

  -- Idempotent: already paid AND already posted → nothing to do.
  IF r.paid AND (r.wallet_tx_id IS NOT NULL OR r.expense_id IS NOT NULL) THEN
    RETURN r.wallet_tx_id;
  END IF;

  v_wallet := COALESCE(p_wallet_id, r.wallet_id);
  IF v_wallet IS NULL THEN RAISE EXCEPTION 'Select the wallet the cash was paid from'; END IF;
  v_date := COALESCE(p_paid_date, r.paid_business_date, CURRENT_DATE);

  -- Cash leaves the wallet exactly once (unique index on ref_table/ref_id/kind).
  IF r.expense_id IS NULL THEN
    v_tx := public.fin_post_wallet_cash(
      r.casino_id, v_wallet, r.amount, r.currency, r.fx_rate, v_date, true,
      'boss_report_extras', r.id, concat('Unplanned: ', COALESCE(r.description, r.label)));
  END IF;

  PERFORM set_config('cms.fin_rpc','1',true);
  UPDATE public.boss_report_extras
     SET paid = true, paid_at = now(), paid_by = v_uid,
         paid_business_date = v_date, wallet_id = v_wallet,
         wallet_tx_id = COALESCE(v_tx, wallet_tx_id)
   WHERE id = r.id;
  RETURN v_tx;
END $$;

CREATE OR REPLACE FUNCTION public.fin_unplanned_reverse(p_id uuid, p_reason text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_uid uuid := auth.uid(); r public.boss_report_extras%ROWTYPE; v_new uuid; v_tx uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT (public.has_role(v_uid,'super_admin') OR public.can_finance(v_uid)) THEN
    RAISE EXCEPTION 'Only finance may reverse an unplanned expense';
  END IF;
  SELECT * INTO r FROM public.boss_report_extras WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Record not found'; END IF;
  IF r.reversed_by IS NOT NULL THEN RAISE EXCEPTION 'Already reversed'; END IF;
  IF r.reversal_of IS NOT NULL THEN RAISE EXCEPTION 'A reversal cannot be reversed'; END IF;
  PERFORM public.fin_assert_month_open(r.casino_id, r.year, r.month);

  -- Give the cash back if the payment had a wallet effect.
  IF r.wallet_tx_id IS NOT NULL THEN
    v_tx := public.fin_post_wallet_cash(
      r.casino_id, r.wallet_id, r.amount, r.currency, r.fx_rate,
      COALESCE(r.paid_business_date, r.business_date, CURRENT_DATE), false,
      'boss_report_extras', r.id, concat('Storno: ', COALESCE(r.description, r.label)), r.wallet_tx_id);
  END IF;

  PERFORM set_config('cms.fin_rpc','1',true);
  INSERT INTO public.boss_report_extras (
    casino_id, year, month, business_date, label, description, amount, currency, fx_rate,
    sort_order, created_by, paid, paid_at, paid_by, paid_business_date, wallet_id,
    wallet_tx_id, reversal_of, note
  ) VALUES (
    r.casino_id, r.year, r.month, r.business_date, r.label,
    concat('Storno: ', COALESCE(r.description, r.label)), -r.amount, r.currency, r.fx_rate,
    r.sort_order, v_uid, r.paid, r.paid_at, r.paid_by, r.paid_business_date, r.wallet_id,
    v_tx, r.id, NULLIF(btrim(COALESCE(p_reason,'')),'')
  ) RETURNING id INTO v_new;

  UPDATE public.boss_report_extras
     SET reversed_by = v_new, voided_at = now(), voided_by = v_uid
   WHERE id = r.id;
  RETURN v_new;
END $$;

-- ============================================================
-- 4. Liabilities — add / pay (posts cash unless intercompany)
-- ============================================================
CREATE OR REPLACE FUNCTION public.fin_liability_add(
  p_casino_id uuid, p_creditor text, p_amount numeric, p_business_date date,
  p_description text DEFAULT NULL, p_currency text DEFAULT 'TZS', p_due_date date DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_uid uuid := auth.uid(); v_id uuid; v_date date := COALESCE(p_business_date, CURRENT_DATE);
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT (public.has_role(v_uid,'super_admin') OR public.can_finance(v_uid)) THEN
    RAISE EXCEPTION 'Only finance may create liabilities';
  END IF;
  IF COALESCE(p_amount,0) <= 0 THEN RAISE EXCEPTION 'Amount must be positive'; END IF;
  IF COALESCE(btrim(p_creditor),'') = '' THEN RAISE EXCEPTION 'Creditor is required'; END IF;
  PERFORM public.fin_assert_date_open(p_casino_id, v_date);

  PERFORM set_config('cms.fin_rpc','1',true);
  INSERT INTO public.fin_liabilities (casino_id, creditor, description, amount, currency,
                                      business_date, due_date, source, created_by)
  VALUES (p_casino_id, btrim(p_creditor), NULLIF(btrim(COALESCE(p_description,'')),''), p_amount,
          COALESCE(p_currency,'TZS'), v_date, p_due_date, 'manual', v_uid)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.fin_liability_pay(
  p_liability_id uuid, p_amount numeric, p_business_date date,
  p_wallet_id uuid DEFAULT NULL, p_note text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_uid uuid := auth.uid(); l public.fin_liabilities%ROWTYPE;
        v_paid numeric; v_outstanding numeric; v_amt_tzs numeric; v_rate numeric; v_id uuid;
        v_currency text := 'TZS'; v_intercompany boolean; v_tx uuid;
        v_date date := COALESCE(p_business_date, CURRENT_DATE);
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT (public.has_role(v_uid,'super_admin') OR public.can_finance(v_uid)) THEN
    RAISE EXCEPTION 'Only finance may register liability payments';
  END IF;
  SELECT * INTO l FROM public.fin_liabilities WHERE id = p_liability_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Liability not found'; END IF;
  IF l.voided_at IS NOT NULL THEN RAISE EXCEPTION 'Liability is reversed'; END IF;
  IF COALESCE(p_amount,0) <= 0 THEN RAISE EXCEPTION 'Amount must be positive'; END IF;
  PERFORM public.fin_assert_date_open(l.casino_id, v_date);

  -- Intercompany repayments are already represented by the accepted transfer registry.
  v_intercompany := l.transfer_id IS NOT NULL OR COALESCE(l.source,'manual') = 'intercompany';

  SELECT COALESCE(SUM(amount_tzs),0) INTO v_paid FROM public.fin_liability_payments
   WHERE liability_id = l.id AND voided_at IS NULL;
  v_outstanding := l.amount_tzs - v_paid;

  IF NOT v_intercompany AND p_wallet_id IS NULL THEN
    RAISE EXCEPTION 'Select the wallet the repayment is paid from';
  END IF;

  IF p_wallet_id IS NOT NULL THEN
    SELECT COALESCE(currency,'TZS') INTO v_currency FROM public.fin_wallets WHERE id = p_wallet_id;
    v_currency := COALESCE(v_currency, 'TZS');
  END IF;
  v_rate := CASE WHEN v_currency = 'TZS' THEN 1
                 ELSE COALESCE(NULLIF(public.fin_rate_for(l.casino_id, v_currency, v_date),0), 1) END;
  v_amt_tzs := p_amount * v_rate;
  IF v_amt_tzs > v_outstanding + 0.5 THEN
    RAISE EXCEPTION 'Payment exceeds outstanding liability (% TZS left)', round(v_outstanding);
  END IF;

  PERFORM set_config('cms.fin_rpc','1',true);
  INSERT INTO public.fin_liability_payments (liability_id, casino_id, amount, currency, fx_rate,
                                             business_date, wallet_id, note, created_by)
  VALUES (l.id, l.casino_id, p_amount, v_currency, v_rate, v_date, p_wallet_id,
          NULLIF(btrim(COALESCE(p_note,'')),''), v_uid)
  RETURNING id INTO v_id;

  IF NOT v_intercompany THEN
    v_tx := public.fin_post_wallet_cash(
      l.casino_id, p_wallet_id, p_amount, v_currency, v_rate, v_date, true,
      'fin_liability_payments', v_id, concat('Liability repayment: ', l.creditor));
    PERFORM set_config('cms.fin_rpc','1',true);
    UPDATE public.fin_liability_payments SET wallet_tx_id = v_tx WHERE id = v_id;
  END IF;
  RETURN v_id;
END $$;

-- ============================================================
-- 5. Signed float adjustment — closed months are locked
-- ============================================================
CREATE OR REPLACE FUNCTION public.fin_adjust_float(
  p_casino_id uuid, p_wallet_id uuid, p_amount numeric,
  p_business_date date DEFAULT NULL, p_note text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
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
  PERFORM public.fin_assert_date_open(p_casino_id, v_date);

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

  PERFORM set_config('cms.fin_rpc','1',true);
  INSERT INTO public.fin_other_incomes (casino_id, business_date, wallet_id, source, currency,
                                        amount, fx_rate, note, created_by)
  VALUES (p_casino_id, v_date, w.id, 'add_float', COALESCE(w.currency,'TZS'),
          p_amount, v_rate, NULLIF(btrim(COALESCE(p_note,'')),''), v_uid)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- ============================================================
-- 6. Month finance — Unplanned stays a separate permanent register
-- ============================================================
CREATE OR REPLACE FUNCTION public.fin_month_finance(p_casino_id uuid, p_year integer, p_month integer)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_start date := make_date(p_year, p_month, 1);
  v_end date := (make_date(p_year, p_month, 1) + interval '1 month - 1 day')::date;
  snap jsonb; liab jsonb; snapshot public.fin_month_report_snapshots%ROWTYPE;
  v_usd numeric; v_budget numeric; v_income numeric; v_expenses numeric; v_collections numeric;
  v_unpl_total numeric; v_unpl_paid numeric; v_unpl_unpaid numeric; v_unpl_paid_cash numeric;
  v_unpl_not_actual numeric;
  v_liab_pay numeric; v_liab_pay_cash numeric; v_cash numeric; v_profit numeric; v_bonus numeric;
  v_float_cur numeric; v_closed boolean; v_items jsonb; v_liab_closing numeric;
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
  v_liab_closing := COALESCE((liab->>'closing_tzs')::numeric,0);

  SELECT COALESCE(SUM(amount_tzs),0),
         COALESCE(SUM(amount_tzs) FILTER (WHERE paid),0),
         COALESCE(SUM(amount_tzs) FILTER (WHERE NOT paid),0),
         COALESCE(SUM(amount_tzs) FILTER (WHERE paid AND expense_id IS NULL),0),
         COALESCE(SUM(amount_tzs) FILTER (WHERE expense_id IS NULL),0)
    INTO v_unpl_total, v_unpl_paid, v_unpl_unpaid, v_unpl_paid_cash, v_unpl_not_actual
  FROM public.boss_report_extras
  WHERE casino_id=p_casino_id AND year=p_year AND month=p_month
    AND reversal_of IS NULL AND voided_at IS NULL;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', id, 'business_date', business_date, 'description', COALESCE(description,label),
      'label', label, 'amount', amount, 'currency', currency, 'amount_tzs', amount_tzs,
      'paid', paid, 'paid_at', paid_at, 'paid_business_date', paid_business_date,
      'wallet_id', wallet_id, 'expense_id', expense_id, 'wallet_tx_id', wallet_tx_id,
      'voided_at', voided_at, 'reversal_of', reversal_of, 'note', note
    ) ORDER BY business_date, created_at), '[]'::jsonb)
    INTO v_items FROM public.boss_report_extras
   WHERE casino_id=p_casino_id AND year=p_year AND month=p_month;

  -- All repayments (register view) vs. repayments that actually moved cash here.
  -- Intercompany repayments are already inside `transfers_total` → never twice.
  SELECT COALESCE(SUM(p.amount_tzs),0),
         COALESCE(SUM(p.amount_tzs) FILTER (
            WHERE l.transfer_id IS NULL AND COALESCE(l.source,'manual') <> 'intercompany'),0)
    INTO v_liab_pay, v_liab_pay_cash
    FROM public.fin_liability_payments p JOIN public.fin_liabilities l ON l.id=p.liability_id
   WHERE p.casino_id=p_casino_id AND p.voided_at IS NULL AND l.voided_at IS NULL
     AND p.business_date BETWEEN v_start AND v_end;

  -- CASH POSITION: cash on hand. Unpaid unplanned and outstanding liabilities are NOT subtracted.
  v_cash := v_float_cur + v_income
          + COALESCE((snap->'incomes'->>'tips_bonus')::numeric,0)
          + COALESCE((snap->'incomes'->>'jp')::numeric,0)
          + COALESCE((snap->'incomes'->>'movements')::numeric,0)
          - COALESCE((snap->>'transfers_total')::numeric,0)
          + COALESCE((snap->'incomes'->>'card_balance')::numeric,0)
          + COALESCE((snap->'incomes'->>'missed_chips')::numeric,0)
          + COALESCE((snap->'incomes'->>'missed_cards')::numeric,0)
          - v_expenses
          - v_unpl_paid_cash
          - v_liab_pay_cash
          - v_collections;

  IF v_closed THEN
    v_income   := COALESCE((snapshot.payload->>'total_income')::numeric, v_income);
    v_expenses := COALESCE((snapshot.payload->>'expenses_actual')::numeric, v_expenses);
    v_profit   := COALESCE((snapshot.payload->>'final_profit')::numeric,
                           v_income - v_expenses - v_unpl_not_actual - v_liab_closing);
    v_bonus    := COALESCE((snapshot.payload->>'manager_bonus')::numeric,
                           GREATEST(0, 0.05*(v_income - v_expenses - v_unpl_not_actual)));
  ELSE
    v_profit := v_income - (v_budget + v_unpl_total + v_liab_closing);
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
                                    'not_in_actual', v_unpl_not_actual,
                                    'items', v_items),
    'liabilities', liab,
    'liability_payments_cash', v_liab_pay_cash,
    'liability_payments_total', v_liab_pay,
    'float', snap->'basic_float',
    'profit', v_profit,
    'manager_bonus', v_bonus,
    'cash_position', v_cash,
    'available_for_collection', GREATEST(0, v_profit - v_collections),
    'snapshot', CASE WHEN v_closed THEN snapshot.payload ELSE NULL END
  );
END $$;

-- ============================================================
-- 7. Month close — frozen payload keeps Unplanned separate
-- ============================================================
CREATE OR REPLACE FUNCTION public.fin_close_month_report(
  p_casino_id uuid, p_year integer, p_month integer, p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_uid uuid := auth.uid(); f jsonb; v_payload jsonb;
        v_liab numeric; v_income numeric; v_exp numeric; v_unpl numeric;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT (public.has_role(v_uid,'super_admin') OR public.can_finance(v_uid)) THEN
    RAISE EXCEPTION 'Only finance may close a month';
  END IF;
  IF public.fin_month_report_is_closed(p_casino_id, p_year, p_month) THEN
    RAISE EXCEPTION 'Month already closed';
  END IF;

  f := public.fin_month_finance(p_casino_id, p_year, p_month);
  v_income := COALESCE((f->>'total_income')::numeric,0);
  v_exp := COALESCE((f->>'expenses_actual')::numeric,0);
  v_liab := COALESCE((f->'liabilities'->>'closing_tzs')::numeric,0);
  v_unpl := COALESCE((f->'unplanned'->>'not_in_actual')::numeric,0);

  v_payload := jsonb_build_object(
    'total_income', v_income,
    'budget', COALESCE((f->>'budget')::numeric,0),
    'expenses_actual', v_exp,
    'unplanned', f->'unplanned',
    'unplanned_not_in_actual', v_unpl,
    'liabilities', f->'liabilities',
    'float', f->'float',
    'closing_liabilities', v_liab,
    'final_profit', v_income - v_exp - v_unpl - v_liab,
    'manager_bonus', GREATEST(0, 0.05 * (v_income - v_exp - v_unpl)),
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
END $$;

-- ============================================================
-- 8. Collections — only for a CLOSED month, never over-collect
-- ============================================================
CREATE OR REPLACE FUNCTION public.fin_record_collection(
  p_casino_id uuid, p_year integer, p_month integer, p_amount numeric,
  p_wallet_id uuid DEFAULT NULL, p_business_date date DEFAULT NULL, p_note text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_uid uuid := auth.uid(); f jsonb; v_avail numeric; v_cat uuid; v_id uuid;
        v_currency text := 'TZS'; v_rate numeric := 1; v_date date;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT (public.has_role(v_uid,'super_admin') OR public.can_finance(v_uid)) THEN
    RAISE EXCEPTION 'Only finance may record collections';
  END IF;
  IF COALESCE(p_amount,0) <= 0 THEN RAISE EXCEPTION 'Amount must be positive'; END IF;
  IF NOT public.fin_month_report_is_closed(p_casino_id, p_year, p_month) THEN
    RAISE EXCEPTION 'Collections are allowed only after the month is closed';
  END IF;
  IF p_wallet_id IS NULL THEN RAISE EXCEPTION 'Select the wallet the collection is taken from'; END IF;
  v_date := COALESCE(p_business_date, LEAST(CURRENT_DATE, (make_date(p_year,p_month,1) + interval '1 month - 1 day')::date));

  f := public.fin_month_finance(p_casino_id, p_year, p_month);
  v_avail := COALESCE((f->>'available_for_collection')::numeric,0);

  SELECT COALESCE(currency,'TZS') INTO v_currency FROM public.fin_wallets WHERE id=p_wallet_id;
  v_currency := COALESCE(v_currency,'TZS');
  v_rate := CASE WHEN v_currency='TZS' THEN 1
                 ELSE COALESCE(NULLIF(public.fin_rate_for(p_casino_id, v_currency, v_date),0),1) END;

  IF p_amount * v_rate > v_avail + 0.5 THEN
    RAISE EXCEPTION 'Collection exceeds available profit (% TZS available)', round(v_avail);
  END IF;

  SELECT id INTO v_cat FROM public.fin_categories
   WHERE group_code='collections' AND name ILIKE 'collection%' ORDER BY sort_order LIMIT 1;
  IF v_cat IS NULL THEN RAISE EXCEPTION 'Collection category is not configured'; END IF;

  PERFORM set_config('cms.fin_rpc','1',true);
  INSERT INTO public.expenses (casino_id, category, amount, description, approved, approved_by, approved_at,
                               created_by, business_date, cage_type, source, fin_category_id, wallet_id,
                               currency, exchange_rate, amount_tzs, player_name)
  VALUES (p_casino_id, 'other', p_amount, COALESCE(NULLIF(btrim(COALESCE(p_note,'')),''), 'Collection'),
          true, v_uid, now(), v_uid, v_date, 'office', 'office', v_cat, p_wallet_id,
          v_currency, v_rate, p_amount * v_rate, '')
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- ============================================================
-- 9. DB-level lock of a closed month + audit-field protection
-- ============================================================
CREATE OR REPLACE FUNCTION public.tg_fin_closed_month_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r record; v_casino uuid; v_date date; v_year int; v_month int; v_collection boolean := false;
BEGIN
  r := COALESCE(NEW, OLD);

  IF TG_TABLE_NAME = 'fin_budget' THEN
    EXECUTE format('SELECT ($1).casino_id, ($1).year, ($1).month') INTO v_casino, v_year, v_month USING r;
  ELSIF TG_TABLE_NAME = 'boss_report_extras' THEN
    EXECUTE format('SELECT ($1).casino_id, ($1).year, ($1).month') INTO v_casino, v_year, v_month USING r;
  ELSE
    EXECUTE format('SELECT ($1).casino_id, ($1).business_date') INTO v_casino, v_date USING r;
    v_year := EXTRACT(YEAR FROM v_date)::int;
    v_month := EXTRACT(MONTH FROM v_date)::int;
  END IF;

  IF TG_TABLE_NAME = 'expenses' THEN
    -- Collections stay allowed after close (that is the whole point of closing).
    SELECT EXISTS (SELECT 1 FROM public.fin_categories c
                    WHERE c.id = (SELECT fin_category_id FROM public.expenses WHERE id = r.id)
                      AND (COALESCE(c.group_code,'') ILIKE '%collection%'
                           OR COALESCE(c.name,'') ILIKE '%collection%'))
      INTO v_collection;
    IF NOT v_collection THEN
      SELECT EXISTS (SELECT 1 FROM public.fin_categories c
                      WHERE c.id = (CASE WHEN NEW IS NULL THEN NULL ELSE NEW.fin_category_id END)
                        AND (COALESCE(c.group_code,'') ILIKE '%collection%'
                             OR COALESCE(c.name,'') ILIKE '%collection%'))
        INTO v_collection;
    END IF;
    IF v_collection THEN RETURN COALESCE(NEW, OLD); END IF;
  END IF;

  IF v_casino IS NOT NULL AND v_year IS NOT NULL
     AND public.fin_month_report_is_closed(v_casino, v_year, v_month) THEN
    RAISE EXCEPTION '% is locked: month %-% is closed (only Collections are allowed)',
      TG_TABLE_NAME, v_year, v_month;
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS tg_closed_month_guard ON public.boss_report_extras;
CREATE TRIGGER tg_closed_month_guard BEFORE INSERT OR UPDATE OR DELETE ON public.boss_report_extras
  FOR EACH ROW EXECUTE FUNCTION public.tg_fin_closed_month_guard();

DROP TRIGGER IF EXISTS tg_closed_month_guard ON public.fin_liabilities;
CREATE TRIGGER tg_closed_month_guard BEFORE INSERT OR UPDATE OR DELETE ON public.fin_liabilities
  FOR EACH ROW EXECUTE FUNCTION public.tg_fin_closed_month_guard();

DROP TRIGGER IF EXISTS tg_closed_month_guard ON public.fin_liability_payments;
CREATE TRIGGER tg_closed_month_guard BEFORE INSERT OR UPDATE OR DELETE ON public.fin_liability_payments
  FOR EACH ROW EXECUTE FUNCTION public.tg_fin_closed_month_guard();

DROP TRIGGER IF EXISTS tg_closed_month_guard ON public.fin_budget;
CREATE TRIGGER tg_closed_month_guard BEFORE INSERT OR UPDATE OR DELETE ON public.fin_budget
  FOR EACH ROW EXECUTE FUNCTION public.tg_fin_closed_month_guard();

DROP TRIGGER IF EXISTS tg_closed_month_guard ON public.expenses;
CREATE TRIGGER tg_closed_month_guard BEFORE INSERT OR UPDATE OR DELETE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.tg_fin_closed_month_guard();

-- Float adjustments (`add_float` rows) dated inside a closed month are blocked too.
CREATE OR REPLACE FUNCTION public.tg_fin_float_closed_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r record;
BEGIN
  r := COALESCE(NEW, OLD);
  IF COALESCE(r.source,'') = 'add_float'
     AND public.fin_month_report_is_closed(r.casino_id,
           EXTRACT(YEAR FROM r.business_date)::int, EXTRACT(MONTH FROM r.business_date)::int) THEN
    RAISE EXCEPTION 'Basic Float cannot be adjusted in a closed month';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS tg_float_closed_guard ON public.fin_other_incomes;
CREATE TRIGGER tg_float_closed_guard BEFORE INSERT OR UPDATE OR DELETE ON public.fin_other_incomes
  FOR EACH ROW EXECUTE FUNCTION public.tg_fin_float_closed_guard();

-- Audit / cash fields may only change through the finance RPCs.
CREATE OR REPLACE FUNCTION public.tg_boss_extras_protect()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_rpc boolean := COALESCE(current_setting('cms.fin_rpc', true), '') = '1';
BEGIN
  IF v_rpc THEN RETURN COALESCE(NEW, OLD); END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.paid OR OLD.wallet_tx_id IS NOT NULL OR OLD.expense_id IS NOT NULL
       OR OLD.reversal_of IS NOT NULL OR OLD.reversed_by IS NOT NULL THEN
      RAISE EXCEPTION 'Paid / reversed unplanned expenses are immutable — use the finance functions';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.paid IS DISTINCT FROM OLD.paid
       OR NEW.paid_at IS DISTINCT FROM OLD.paid_at
       OR NEW.paid_by IS DISTINCT FROM OLD.paid_by
       OR NEW.paid_business_date IS DISTINCT FROM OLD.paid_business_date
       OR NEW.wallet_tx_id IS DISTINCT FROM OLD.wallet_tx_id
       OR NEW.expense_id IS DISTINCT FROM OLD.expense_id
       OR NEW.reversal_of IS DISTINCT FROM OLD.reversal_of
       OR NEW.reversed_by IS DISTINCT FROM OLD.reversed_by
       OR NEW.voided_at IS DISTINCT FROM OLD.voided_at
       OR NEW.voided_by IS DISTINCT FROM OLD.voided_by THEN
      RAISE EXCEPTION 'Paid / audit fields may only change through the finance functions';
    END IF;
    IF (OLD.paid OR OLD.wallet_tx_id IS NOT NULL)
       AND (NEW.amount IS DISTINCT FROM OLD.amount
            OR NEW.currency IS DISTINCT FROM OLD.currency
            OR NEW.fx_rate IS DISTINCT FROM OLD.fx_rate) THEN
      RAISE EXCEPTION 'A paid unplanned expense is immutable — reverse it instead';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tg_boss_extras_protect ON public.boss_report_extras;
CREATE TRIGGER tg_boss_extras_protect BEFORE UPDATE OR DELETE ON public.boss_report_extras
  FOR EACH ROW EXECUTE FUNCTION public.tg_boss_extras_protect();

-- Liabilities & payments: registry rows are RPC-only (no broad direct UPDATE path).
DROP POLICY IF EXISTS fin_liabilities_update ON public.fin_liabilities;

GRANT EXECUTE ON FUNCTION public.fin_month_report_is_closed(uuid,int,int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fin_post_wallet_cash(uuid,uuid,numeric,text,numeric,date,boolean,text,uuid,text,uuid) TO service_role;