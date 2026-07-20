
CREATE OR REPLACE FUNCTION public.fin_balance_snapshot(p_casino_id uuid, p_period_start date, p_period_end date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
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
  ORDER BY COALESCE(closed_at, opened_at) DESC LIMIT 1;
  IF v_usd_tzs IS NULL THEN
    SELECT rate_to_tzs INTO v_usd_tzs FROM fin_daily_rates
    WHERE casino_id = p_casino_id AND currency='USD' AND business_date <= p_period_end
    ORDER BY business_date DESC LIMIT 1;
  END IF;
  v_usd_tzs := COALESCE(v_usd_tzs, 2600);

  SELECT jsonb_build_object(
    'tzs',   COALESCE(SUM(CASE WHEN currency='TZS' THEN starting_float_amount ELSE 0 END),0),
    'usd',   COALESCE(SUM(CASE WHEN currency='USD' THEN starting_float_amount ELSE 0 END),0),
    'grand_tzs', COALESCE(SUM(
      CASE WHEN currency='TZS' THEN COALESCE(starting_float_amount,0)
           WHEN currency='USD' THEN COALESCE(starting_float_amount,0)*v_usd_tzs
           ELSE COALESCE(starting_float_amount,0) END),0),
    'per_wallet', COALESCE(jsonb_agg(jsonb_build_object(
      'wallet_id', id, 'name', name, 'currency', currency, 'amount', starting_float_amount
    )) FILTER (WHERE COALESCE(starting_float_amount,0)>0), '[]'::jsonb)
  ) INTO v_starting
  FROM fin_wallets WHERE casino_id=p_casino_id AND is_active=TRUE;

  SELECT -COALESCE(SUM(COALESCE((closing_count->>'chip_miss_total')::numeric,0)),0)
    INTO v_missed_chips FROM shifts
  WHERE casino_id=p_casino_id
    AND COALESCE(closed_at,opened_at)::date BETWEEN p_period_start AND p_period_end
    AND closing_count IS NOT NULL;

  SELECT -COALESCE(SUM(COALESCE(cards_miss,0)),0) INTO v_missed_cards
  FROM cage_slots_shifts
  WHERE casino_id=p_casino_id
    AND COALESCE(business_date, COALESCE(closed_at,opened_at)::date)
        BETWEEN p_period_start AND p_period_end;

  v_incomes := jsonb_build_object(
    'live_game', COALESCE((SELECT SUM(COALESCE(result,0)) FROM table_daily_results
      WHERE casino_id=p_casino_id AND date BETWEEN p_period_start AND p_period_end),0),
    'slots', COALESCE((SELECT SUM(COALESCE(slots_result,0)) FROM fin_day_closing
      WHERE casino_id=p_casino_id AND business_date BETWEEN p_period_start AND p_period_end),0),
    'other', COALESCE((SELECT SUM(COALESCE(amount,0)*COALESCE(fx_rate,1)) FROM fin_other_incomes
      WHERE casino_id=p_casino_id AND business_date BETWEEN p_period_start AND p_period_end
        AND reverses_id IS NULL AND reversed_by_id IS NULL),0),
    'missed_chips', v_missed_chips,
    'missed_cards', v_missed_cards
  );

  SELECT COALESCE(SUM(fwt.amount_tzs),0) INTO v_collections
  FROM fin_wallet_tx fwt LEFT JOIN fin_categories fc ON fc.id=fwt.category_id
  WHERE fwt.casino_id=p_casino_id AND fwt.business_date BETWEEN p_period_start AND p_period_end
    AND fwt.kind='expense'
    AND (fc.name ILIKE '%collection%' OR fc.group_code ILIKE '%collection%');

  SELECT COALESCE(SUM(fwt.amount_tzs),0) INTO v_expenses
  FROM fin_wallet_tx fwt LEFT JOIN fin_categories fc ON fc.id=fwt.category_id
  WHERE fwt.casino_id=p_casino_id AND fwt.business_date BETWEEN p_period_start AND p_period_end
    AND fwt.kind='expense'
    AND NOT (fc.name ILIKE '%collection%' OR fc.group_code ILIKE '%collection%');

  WITH tx AS (
    SELECT wallet_id,
      SUM(CASE WHEN kind='income' THEN COALESCE(amount,0)
               WHEN kind='expense' THEN -COALESCE(amount,0)
               ELSE COALESCE(amount,0) END) AS delta_native,
      SUM(CASE WHEN kind='income' THEN COALESCE(amount_tzs,0)
               WHEN kind='expense' THEN -COALESCE(amount_tzs,0)
               ELSE COALESCE(amount_tzs,0) END) AS delta_tzs
    FROM fin_wallet_tx
    WHERE casino_id=p_casino_id AND business_date <= p_period_end
    GROUP BY wallet_id
  ),
  phys AS (
    SELECT DISTINCT ON (wallet_type, currency)
           wallet_type::text AS wallet_type, currency, physical_total, created_at
    FROM cash_count_snapshots
    WHERE casino_id=p_casino_id AND created_at::date <= p_period_end
    ORDER BY wallet_type, currency, created_at DESC
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'wallet_id', w.id, 'name', w.name, 'kind', w.kind, 'currency', w.currency,
    'ledger',        COALESCE(w.starting_float_amount,0)+COALESCE(tx.delta_native,0),
    'ledger_native', COALESCE(w.starting_float_amount,0)+COALESCE(tx.delta_native,0),
    'ledger_tzs',    COALESCE(
                       CASE WHEN w.currency='TZS' THEN COALESCE(w.starting_float_amount,0) ELSE 0 END
                       + COALESCE(tx.delta_tzs,0),
                       0),
    'physical', p.physical_total
  ) ORDER BY w.sort_order, w.name), '[]'::jsonb)
  INTO v_wallets
  FROM fin_wallets w
  LEFT JOIN tx   ON tx.wallet_id=w.id
  LEFT JOIN phys p ON p.wallet_type = w.kind::text AND p.currency = w.currency
  WHERE w.casino_id=p_casino_id AND w.is_active=TRUE;

  RETURN jsonb_build_object(
    'period', jsonb_build_object('start',p_period_start,'end',p_period_end),
    'rates',  jsonb_build_object('usd_tzs', v_usd_tzs),
    'starting_float', v_starting,
    'incomes', v_incomes,
    'expenses_total', v_expenses,
    'collections_total', v_collections,
    'wallets', v_wallets
  );
END;
$function$;
