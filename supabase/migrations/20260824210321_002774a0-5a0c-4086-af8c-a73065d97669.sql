CREATE TABLE IF NOT EXISTS public.fin_manager_bonus_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  casino_id uuid NOT NULL REFERENCES public.casinos(id) ON DELETE CASCADE,
  year integer NOT NULL,
  month integer NOT NULL,
  old_amount numeric NOT NULL DEFAULT 0,
  new_amount numeric NOT NULL,
  reason text NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fin_mbo_scope ON public.fin_manager_bonus_overrides (casino_id, year, month, created_at DESC);

GRANT SELECT ON public.fin_manager_bonus_overrides TO authenticated;
GRANT ALL ON public.fin_manager_bonus_overrides TO service_role;

ALTER TABLE public.fin_manager_bonus_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Finance can view manager bonus overrides" ON public.fin_manager_bonus_overrides;
CREATE POLICY "Finance can view manager bonus overrides"
  ON public.fin_manager_bonus_overrides FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'super_admin') OR public.can_finance(auth.uid()));

-- Immutable audit: no UPDATE / DELETE policy at all, plus a hard guard.
CREATE OR REPLACE FUNCTION public.tg_fin_bonus_override_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'Manager bonus override rows are immutable';
END $$;

DROP TRIGGER IF EXISTS trg_fin_bonus_override_immutable ON public.fin_manager_bonus_overrides;
CREATE TRIGGER trg_fin_bonus_override_immutable
  BEFORE UPDATE OR DELETE ON public.fin_manager_bonus_overrides
  FOR EACH ROW EXECUTE FUNCTION public.tg_fin_bonus_override_immutable();

CREATE OR REPLACE FUNCTION public.fin_override_manager_bonus(
  p_casino_id uuid, p_year integer, p_month integer, p_amount numeric, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_old numeric; f jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT (public.has_role(v_uid,'super_admin') OR public.can_finance(v_uid)) THEN
    RAISE EXCEPTION 'Only finance may override the manager bonus';
  END IF;
  IF NOT public.fin_month_report_is_closed(p_casino_id, p_year, p_month) THEN
    RAISE EXCEPTION 'Manager bonus can only be overridden after the month is closed';
  END IF;
  IF COALESCE(p_amount,-1) < 0 THEN RAISE EXCEPTION 'Bonus must be zero or positive'; END IF;
  IF btrim(COALESCE(p_reason,'')) = '' THEN RAISE EXCEPTION 'A reason is required'; END IF;

  f := public.fin_month_finance(p_casino_id, p_year, p_month);
  v_old := COALESCE((f->>'manager_bonus')::numeric, 0);

  INSERT INTO public.fin_manager_bonus_overrides (casino_id, year, month, old_amount, new_amount, reason, created_by)
  VALUES (p_casino_id, p_year, p_month, v_old, p_amount, btrim(p_reason), v_uid);

  RETURN jsonb_build_object('old_amount', v_old, 'new_amount', p_amount);
END $$;

GRANT EXECUTE ON FUNCTION public.fin_override_manager_bonus(uuid,integer,integer,numeric,text) TO authenticated;

-- ── Close: freeze the bonus on ACTUAL EXPENSES, keep the budget figure for reference ──
CREATE OR REPLACE FUNCTION public.fin_close_month_report(p_casino_id uuid, p_year integer, p_month integer, p_note text DEFAULT NULL::text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid(); f jsonb; v_payload jsonb;
        v_liab numeric; v_income numeric; v_exp numeric; v_unpl numeric; v_budget numeric;
        v_bonus numeric;
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
  v_budget := COALESCE((f->>'budget')::numeric,0);
  v_liab := COALESCE((f->'liabilities'->>'closing_tzs')::numeric,0);
  v_unpl := COALESCE((f->'unplanned'->>'not_in_actual')::numeric,0);
  -- CLOSED default: bonus is paid on the real cost base, not on the plan.
  v_bonus := GREATEST(0, 0.05 * (v_income - v_exp));

  v_payload := jsonb_build_object(
    'total_income', v_income,
    'budget', v_budget,
    'expenses_actual', v_exp,
    'unplanned', f->'unplanned',
    'unplanned_not_in_actual', v_unpl,
    'liabilities', f->'liabilities',
    'float', f->'float',
    'closing_liabilities', v_liab,
    'final_profit', v_income - v_exp - v_unpl - v_liab,
    'manager_bonus', v_bonus,
    'manager_bonus_default', v_bonus,
    'manager_bonus_budget_base', GREATEST(0, 0.05 * (v_income - v_budget)),
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
END $function$;

-- ── Month finance: bonus lifecycle + available for collection ──
CREATE OR REPLACE FUNCTION public.fin_month_finance(p_casino_id uuid, p_year integer, p_month integer)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_start date := make_date(p_year, p_month, 1);
  v_end date := (make_date(p_year, p_month, 1) + interval '1 month - 1 day')::date;
  snap jsonb; liab jsonb; snapshot public.fin_month_report_snapshots%ROWTYPE;
  v_usd numeric; v_budget numeric; v_income numeric; v_expenses numeric; v_collections numeric;
  v_unpl_total numeric; v_unpl_paid numeric; v_unpl_unpaid numeric; v_unpl_paid_cash numeric;
  v_unpl_not_actual numeric;
  v_liab_pay numeric; v_liab_pay_cash numeric; v_cash numeric; v_profit numeric; v_bonus numeric;
  v_bonus_default numeric; v_override public.fin_manager_bonus_overrides%ROWTYPE;
  v_float_cur numeric; v_closed boolean; v_items jsonb; v_liab_closing numeric;
  v_deposits numeric; v_available numeric;
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
    AND reversal_of IS NULL AND voided_at IS NULL
    AND COALESCE(amount_tzs,0) > 0;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', id, 'business_date', business_date, 'description', COALESCE(description,label),
      'label', label, 'amount', amount, 'currency', currency, 'amount_tzs', amount_tzs,
      'paid', paid, 'paid_at', paid_at, 'paid_business_date', paid_business_date,
      'wallet_id', wallet_id, 'expense_id', expense_id, 'wallet_tx_id', wallet_tx_id,
      'voided_at', voided_at, 'reversal_of', reversal_of, 'note', note
    ) ORDER BY business_date, created_at), '[]'::jsonb)
    INTO v_items FROM public.boss_report_extras
   WHERE casino_id=p_casino_id AND year=p_year AND month=p_month
     AND reversal_of IS NULL AND voided_at IS NULL
     AND COALESCE(amount_tzs,0) > 0;

  SELECT COALESCE(SUM(p.amount_tzs),0),
         COALESCE(SUM(p.amount_tzs) FILTER (
            WHERE l.transfer_id IS NULL AND COALESCE(l.source,'manual') <> 'intercompany'),0)
    INTO v_liab_pay, v_liab_pay_cash
    FROM public.fin_liability_payments p JOIN public.fin_liabilities l ON l.id=p.liability_id
   WHERE p.casino_id=p_casino_id AND p.voided_at IS NULL AND l.voided_at IS NULL
     AND p.business_date BETWEEN v_start AND v_end;

  v_deposits := COALESCE((snap->'incomes'->>'tips_bonus')::numeric,0)
              + COALESCE((snap->'incomes'->>'jp')::numeric,0)
              + COALESCE((snap->'incomes'->>'card_balance')::numeric,0)
              + COALESCE((snap->'incomes'->>'missed_chips')::numeric,0)
              + COALESCE((snap->'incomes'->>'missed_cards')::numeric,0);

  v_cash := v_float_cur + v_income
          - v_deposits
          + COALESCE((snap->'incomes'->>'movements')::numeric,0)
          - COALESCE((snap->>'transfers_total')::numeric,0)
          - v_expenses
          - v_unpl_paid_cash
          - v_collections
          - v_liab_pay_cash;

  IF v_closed THEN
    v_income   := COALESCE((snapshot.payload->>'total_income')::numeric, v_income);
    v_expenses := COALESCE((snapshot.payload->>'expenses_actual')::numeric, v_expenses);
    v_budget   := COALESCE((snapshot.payload->>'budget')::numeric, v_budget);
    v_profit   := COALESCE((snapshot.payload->>'final_profit')::numeric,
                           v_income - v_expenses - v_unpl_not_actual - v_liab_closing);
    -- CLOSED default: 5% of (Income − Actual Expenses), frozen at close.
    v_bonus_default := COALESCE((snapshot.payload->>'manager_bonus')::numeric,
                                GREATEST(0, 0.05*(v_income - v_expenses)));
  ELSE
    v_profit := v_income - v_budget - v_unpl_total - v_liab_closing - v_collections;
    -- OPEN default: 5% of (Income − Budget). No override is possible before close.
    v_bonus_default := GREATEST(0, 0.05 * (v_income - v_budget));
  END IF;

  v_bonus := v_bonus_default;
  IF v_closed THEN
    SELECT * INTO v_override FROM public.fin_manager_bonus_overrides
     WHERE casino_id=p_casino_id AND year=p_year AND month=p_month
     ORDER BY created_at DESC LIMIT 1;
    IF v_override.id IS NOT NULL THEN v_bonus := v_override.new_amount; END IF;
  END IF;

  -- Available for Collection = Profit − cumulative Collections − approved Manager Bonus.
  -- (An open month already nets Collections inside v_profit.)
  v_available := GREATEST(0, v_profit - CASE WHEN v_closed THEN v_collections ELSE 0 END - v_bonus);

  RETURN jsonb_build_object(
    'period', jsonb_build_object('start', v_start, 'end', v_end, 'year', p_year, 'month', p_month),
    'status', CASE WHEN v_closed THEN 'closed' ELSE 'open' END,
    'closed_at', snapshot.closed_at, 'closed_by', snapshot.closed_by,
    'usd_rate', v_usd,
    'total_income', v_income,
    'budget', v_budget,
    'expenses_actual', v_expenses,
    'collections', v_collections,
    'deposits', v_deposits,
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
    'manager_bonus_default', v_bonus_default,
    'manager_bonus_override', CASE WHEN v_override.id IS NULL THEN NULL ELSE jsonb_build_object(
        'id', v_override.id, 'old_amount', v_override.old_amount, 'new_amount', v_override.new_amount,
        'reason', v_override.reason, 'created_by', v_override.created_by, 'created_at', v_override.created_at
      ) END,
    'cash_position', v_cash,
    'available_for_collection', v_available,
    'snapshot', CASE WHEN v_closed THEN snapshot.payload ELSE NULL END
  );
END $function$;