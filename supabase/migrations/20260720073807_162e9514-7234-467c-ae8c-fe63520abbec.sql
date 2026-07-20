CREATE OR REPLACE FUNCTION public.fin_balance_snapshot(p_casino_id uuid, p_period_start date, p_period_end date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result JSONB;
  v_usd_tzs NUMERIC;
  v_starting JSONB;
  v_incomes JSONB;
  v_expenses NUMERIC;
  v_collections NUMERIC;
  v_wallets JSONB;
  v_missed_chips NUMERIC;
  v_missed_cards NUMERIC;
BEGIN
  SELECT NULLIF((exchange_rates->>'USD'),'')::numeric INTO v_usd_tzs
  FROM shifts
  WHERE casino_id = p_casino_id
    AND exchange_rates ? 'USD'
    AND COALESCE(closed_at, opened_at)::date <= p_period_end
  ORDER BY COALESCE(closed_at, opened_at) DESC
  LIMIT 1;

  IF v_usd_tzs IS NULL THEN
    SELECT rate_to_tzs INTO v_usd_tzs
    FROM fin_daily_rates
    WHERE casino_id = p_casino_id AND currency = 'USD' AND business_date <= p_period_end
    ORDER BY business_date DESC LIMIT 1;
  END IF;
  v_usd_tzs := COALESCE(v_usd_tzs, 2600);

  SELECT jsonb_build_object(
    'tzs', COALESCE(SUM(CASE WHEN currency='TZS' THEN starting_float_amount ELSE 0 END),0),
    'usd', COALESCE(SUM(CASE WHEN currency='USD' THEN starting_float_amount ELSE 0 END),0),
    'grand_tzs', COALESCE(SUM(
      CASE WHEN currency='TZS' THEN starting_float_amount
           WHEN currency='USD' THEN starting_float_amount * v_usd_tzs
           ELSE starting_float_amount END
    ),0),
    'per_wallet', COALESCE(jsonb_agg(jsonb_build_object(
      'wallet_id', id, 'name', name, 'currency', currency, 'amount', starting_float_amount
    )) FILTER (WHERE starting_float_amount > 0), '[]'::jsonb)
  ) INTO v_starting
  FROM fin_wallets
  WHERE casino_id = p_casino_id AND is_active = TRUE;

  SELECT -COALESCE(SUM( COALESCE((closing_count->>'chip_miss_total')::numeric, 0) ), 0)
    INTO v_missed_chips
  FROM shifts
  WHERE casino_id = p_casino_id
    AND COALESCE(closed_at, opened_at)::date BETWEEN p_period_start AND p_period_end
    AND closing_count IS NOT NULL;

  SELECT -COALESCE(SUM(COALESCE(cards_miss,0)),0) INTO v_missed_cards
  FROM cage_slots_shifts
  WHERE casino_id = p_casino_id
    AND COALESCE(business_date, COALESCE(closed_at, opened_at)::date)
        BETWEEN p_period_start AND p_period_end;

  v_incomes := jsonb_build_object(
    'live_game', COALESCE((
      SELECT SUM(result_tzs) FROM table_daily_results
      WHERE casino_id = p_casino_id AND business_date BETWEEN p_period_start AND p_period_end
    ),0),
    -- SLOTS: source of truth = fin_day_closing.slots_result (daily cage-verified value)
    'slots', COALESCE((
      SELECT SUM(COALESCE(slots_result,0)) FROM fin_day_closing
      WHERE casino_id = p_casino_id
        AND business_date BETWEEN p_period_start AND p_period_end
    ),0),
    'other', COALESCE((
      SELECT SUM(amount * fx_rate) FROM fin_other_incomes
      WHERE casino_id = p_casino_id AND business_date BETWEEN p_period_start AND p_period_end
        AND reverses_id IS NULL AND reversed_by_id IS NULL
    ),0),
    'missed_chips', v_missed_chips,
    'missed_cards', v_missed_cards
  );

  SELECT COALESCE(SUM(fwt.amount_tzs),0) INTO v_collections FROM fin_wallet_tx fwt
  LEFT JOIN fin_categories fc ON fc.id = fwt.category_id
  WHERE fwt.casino_id = p_casino_id
    AND fwt.business_date BETWEEN p_period_start AND p_period_end
    AND fwt.kind = 'expense'
    AND (fc.name ILIKE '%collection%' OR fc.group_code ILIKE '%collection%');

  SELECT COALESCE(SUM(fwt.amount_tzs),0) INTO v_expenses
  FROM fin_wallet_tx fwt
  LEFT JOIN fin_categories fc ON fc.id = fwt.category_id
  WHERE fwt.casino_id = p_casino_id
    AND fwt.business_date BETWEEN p_period_start AND p_period_end
    AND fwt.kind = 'expense'
    AND NOT (fc.name ILIKE '%collection%' OR fc.group_code ILIKE '%collection%');

  SELECT jsonb_build_object(
    'per_wallet', COALESCE(jsonb_agg(jsonb_build_object(
      'wallet_id', id, 'name', name, 'currency', currency,
      'amount', COALESCE(current_balance,0)
    )), '[]'::jsonb),
    'grand_tzs', COALESCE(SUM(
      CASE WHEN currency='TZS' THEN COALESCE(current_balance,0)
           WHEN currency='USD' THEN COALESCE(current_balance,0) * v_usd_tzs
           ELSE COALESCE(current_balance,0) END
    ),0)
  ) INTO v_wallets
  FROM fin_wallets
  WHERE casino_id = p_casino_id AND is_active = TRUE;

  v_result := jsonb_build_object(
    'usd_tzs', v_usd_tzs,
    'starting', v_starting,
    'incomes', v_incomes,
    'expenses_total', v_expenses,
    'collections_total', v_collections,
    'wallets', v_wallets
  );

  RETURN v_result;
END;
$function$;