
CREATE OR REPLACE FUNCTION public.fin_balance_snapshot(
  p_casino_id UUID,
  p_period_start DATE,
  p_period_end DATE
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
  v_usd_tzs NUMERIC;
  v_starting JSONB;
  v_incomes JSONB;
  v_expenses JSONB;
  v_collections JSONB;
  v_wallets JSONB;
  v_missed NUMERIC;
BEGIN
  -- USD→TZS rate: latest entry in fin_daily_rates for USD, up to period end.
  SELECT rate_to_tzs INTO v_usd_tzs
  FROM fin_daily_rates
  WHERE casino_id = p_casino_id
    AND currency = 'USD'
    AND business_date <= p_period_end
  ORDER BY business_date DESC
  LIMIT 1;
  v_usd_tzs := COALESCE(v_usd_tzs, 2500);

  -- Starting Float: sum across ALL active wallets. The per-wallet ledger
  -- unconditionally adds starting_float_amount, so Expected must match.
  -- (Previously filtered by starting_float_date, which produced a permanent
  -- false Variance whenever CloseMonth set a future starting_float_date.)
  SELECT jsonb_build_object(
    'tzs', COALESCE(SUM(CASE WHEN currency='TZS' THEN starting_float_amount ELSE 0 END),0),
    'usd', COALESCE(SUM(CASE WHEN currency='USD' THEN starting_float_amount ELSE 0 END),0),
    'grand_tzs', COALESCE(SUM(
      CASE
        WHEN currency='TZS' THEN starting_float_amount
        WHEN currency='USD' THEN starting_float_amount * v_usd_tzs
        ELSE starting_float_amount
      END
    ),0),
    'per_wallet', COALESCE(jsonb_agg(jsonb_build_object(
      'wallet_id', id, 'name', name, 'currency', currency, 'amount', starting_float_amount
    )) FILTER (WHERE starting_float_amount > 0), '[]'::jsonb)
  ) INTO v_starting
  FROM fin_wallets
  WHERE casino_id = p_casino_id
    AND is_active = TRUE;

  SELECT COALESCE(SUM( COALESCE((closing_count->>'chip_miss_total')::numeric, 0) ), 0)
    INTO v_missed
  FROM shifts
  WHERE casino_id = p_casino_id
    AND business_date BETWEEN p_period_start AND p_period_end
    AND closing_count IS NOT NULL;

  v_incomes := jsonb_build_object(
    'live_game', COALESCE((
      SELECT SUM(result_tzs) FROM table_daily_results
      WHERE casino_id = p_casino_id AND business_date BETWEEN p_period_start AND p_period_end
    ),0),
    'slots', COALESCE((
      SELECT SUM(amount) FROM fin_incomes
      WHERE casino_id = p_casino_id
        AND make_date(year,month,1) BETWEEN date_trunc('month',p_period_start)::date AND p_period_end
    ),0),
    'other', COALESCE((
      SELECT SUM(amount * fx_rate) FROM fin_other_incomes
      WHERE casino_id = p_casino_id AND business_date BETWEEN p_period_start AND p_period_end
        AND reverses_id IS NULL AND reversed_by_id IS NULL
    ),0),
    'missed_chips', v_missed
  );

  SELECT COALESCE(SUM(amount_tzs),0) INTO v_expenses FROM (
    SELECT amount_tzs FROM fin_wallet_tx
    WHERE casino_id = p_casino_id
      AND business_date BETWEEN p_period_start AND p_period_end
      AND kind = 'expense'
  ) x;

  SELECT COALESCE(SUM(fwt.amount_tzs),0) INTO v_collections FROM fin_wallet_tx fwt
  LEFT JOIN fin_categories fc ON fc.id = fwt.category_id
  WHERE fwt.casino_id = p_casino_id
    AND fwt.business_date BETWEEN p_period_start AND p_period_end
    AND fwt.kind = 'expense'
    AND (fc.name ILIKE '%collection%' OR fc.group_code ILIKE '%collection%');

  SELECT jsonb_agg(jsonb_build_object(
    'wallet_id', w.id, 'name', w.name, 'kind', w.kind, 'currency', w.currency,
    'ledger', COALESCE((
      SELECT SUM(amount) FROM fin_wallet_tx
      WHERE wallet_id = w.id AND business_date <= p_period_end
    ), 0) + COALESCE(w.starting_float_amount, 0),
    'physical', COALESCE((
      SELECT total_amount FROM cash_counts
      WHERE wallet_id = w.id ORDER BY created_at DESC LIMIT 1
    ), NULL)
  ) ORDER BY w.sort_order, w.name) INTO v_wallets
  FROM fin_wallets w
  WHERE w.casino_id = p_casino_id AND w.is_active = TRUE;

  v_result := jsonb_build_object(
    'period', jsonb_build_object('start', p_period_start, 'end', p_period_end),
    'rates', jsonb_build_object('usd_tzs', v_usd_tzs),
    'starting_float', v_starting,
    'incomes', v_incomes,
    'expenses_total', v_expenses,
    'collections_total', v_collections,
    'wallets', COALESCE(v_wallets, '[]'::jsonb)
  );

  RETURN v_result;
END $$;

GRANT EXECUTE ON FUNCTION public.fin_balance_snapshot(UUID, DATE, DATE) TO authenticated;
