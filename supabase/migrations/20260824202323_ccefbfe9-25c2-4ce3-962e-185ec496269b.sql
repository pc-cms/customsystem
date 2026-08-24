CREATE OR REPLACE FUNCTION public.fin_month_finance(p_casino_id uuid, p_year integer, p_month integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_start date := make_date(p_year, p_month, 1);
  v_end date := (make_date(p_year, p_month, 1) + interval '1 month - 1 day')::date;
  snap jsonb; liab jsonb; snapshot public.fin_month_report_snapshots%ROWTYPE;
  v_usd numeric; v_budget numeric; v_income numeric; v_expenses numeric; v_collections numeric;
  v_unpl_total numeric; v_unpl_paid numeric; v_unpl_unpaid numeric; v_unpl_paid_cash numeric;
  v_unpl_not_actual numeric;
  v_liab_pay numeric; v_liab_pay_cash numeric; v_cash numeric; v_profit numeric; v_bonus numeric;
  v_float_cur numeric; v_closed boolean; v_items jsonb; v_liab_closing numeric;
  v_deposits numeric;
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

  -- Unplanned: only ACTIVE rows with a positive net amount. Zero rows mean
  -- "not applicable to this casino" and never enter totals or lists.
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

  -- All repayments (register view) vs. repayments that actually moved cash here.
  -- Intercompany repayments are already inside `transfers_total` → never twice.
  SELECT COALESCE(SUM(p.amount_tzs),0),
         COALESCE(SUM(p.amount_tzs) FILTER (
            WHERE l.transfer_id IS NULL AND COALESCE(l.source,'manual') <> 'intercompany'),0)
    INTO v_liab_pay, v_liab_pay_cash
    FROM public.fin_liability_payments p JOIN public.fin_liabilities l ON l.id=p.liability_id
   WHERE p.casino_id=p_casino_id AND p.voided_at IS NULL AND l.voided_at IS NULL
     AND p.business_date BETWEEN v_start AND v_end;

  -- DEPOSITS: money held/owed to third parties, netted out of cash on hand.
  v_deposits := COALESCE((snap->'incomes'->>'tips_bonus')::numeric,0)
              + COALESCE((snap->'incomes'->>'jp')::numeric,0)
              + COALESCE((snap->'incomes'->>'card_balance')::numeric,0)
              + COALESCE((snap->'incomes'->>'missed_chips')::numeric,0)
              + COALESCE((snap->'incomes'->>'missed_cards')::numeric,0);

  -- CASH POSITION: Float + Income − Deposits + Office/Investment + Intercompany
  --                − Actual Expenses − Collections − Actual Liability Payments.
  v_cash := v_float_cur + v_income
          - v_deposits
          + COALESCE((snap->'incomes'->>'movements')::numeric,0)
          - COALESCE((snap->>'transfers_total')::numeric,0)
          - v_expenses
          - v_collections
          - v_liab_pay_cash;

  IF v_closed THEN
    v_income   := COALESCE((snapshot.payload->>'total_income')::numeric, v_income);
    v_expenses := COALESCE((snapshot.payload->>'expenses_actual')::numeric, v_expenses);
    v_profit   := COALESCE((snapshot.payload->>'final_profit')::numeric,
                           v_income - v_expenses - v_unpl_not_actual - v_liab_closing);
    v_bonus    := COALESCE((snapshot.payload->>'manager_bonus')::numeric,
                           GREATEST(0, 0.05*(v_income - v_expenses)));
  ELSE
    -- OPEN: Collections reduce the remaining expected profit.
    v_profit := v_income - v_budget - v_unpl_total - v_liab_closing - v_collections;
    -- Manager bonus never nets Unplanned or Liabilities.
    v_bonus  := GREATEST(0, 0.05 * (v_income - v_budget));
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
    'cash_position', v_cash,
    'available_for_collection', GREATEST(0, v_profit),
    'snapshot', CASE WHEN v_closed THEN snapshot.payload ELSE NULL END
  );
END $function$;