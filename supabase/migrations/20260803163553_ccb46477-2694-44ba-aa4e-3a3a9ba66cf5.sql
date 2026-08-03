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
  IF NEW.source = 'office' AND NEW.amount > 0 AND NEW.wallet_id IS NOT NULL THEN
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
  v_transfers NUMERIC;
  v_wallets JSONB;
  v_missed_chips NUMERIC;
  v_missed_cards NUMERIC;
  v_card_balance NUMERIC;
  v_rates JSONB;
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

  SELECT COALESCE(jsonb_object_agg(currency, rate_to_tzs), '{}'::jsonb) INTO v_rates
  FROM (
    SELECT DISTINCT ON (currency) currency, rate_to_tzs
    FROM fin_daily_rates
    WHERE casino_id = p_casino_id AND business_date <= p_period_end
    ORDER BY currency, business_date DESC
  ) r;
  v_rates := v_rates || jsonb_build_object('USD', v_usd_tzs, 'TZS', 1);

  SELECT jsonb_build_object(
    'tzs',   COALESCE(SUM(CASE WHEN currency='TZS' THEN starting_float_amount ELSE 0 END),0),
    'usd',   COALESCE(SUM(CASE WHEN currency='USD' THEN starting_float_amount ELSE 0 END),0),
    'grand_tzs', COALESCE(SUM(
      CASE WHEN currency='TZS' THEN COALESCE(starting_float_amount,0)
           WHEN currency='USD' THEN COALESCE(starting_float_amount,0)*v_usd_tzs
           ELSE COALESCE(starting_float_amount,0) * COALESCE(NULLIF((v_rates->>currency),'')::numeric, 1) END),0),
    'per_wallet', COALESCE(jsonb_agg(jsonb_build_object(
      'wallet_id', id, 'name', name, 'currency', currency, 'amount', starting_float_amount
    )) FILTER (WHERE COALESCE(starting_float_amount,0)>0), '[]'::jsonb)
  ) INTO v_starting
  FROM fin_wallets WHERE casino_id=p_casino_id AND is_active=TRUE;

  SELECT -COALESCE(SUM(COALESCE((closing_count->>'chip_miss_total')::numeric,0)),0)
    INTO v_missed_chips FROM shifts
  WHERE casino_id=p_casino_id
    AND business_date_of(COALESCE(opened_at, closed_at)) BETWEEN p_period_start AND p_period_end
    AND closing_count IS NOT NULL;

  SELECT -COALESCE(SUM(COALESCE(cards_miss,0)),0) INTO v_missed_cards
  FROM cage_slots_shifts
  WHERE casino_id=p_casino_id
    AND COALESCE(business_date, business_date_of(COALESCE(opened_at, closed_at)))
        BETWEEN p_period_start AND p_period_end;

  SELECT COALESCE(players_card_balance,0) INTO v_card_balance
  FROM fin_day_closing
  WHERE casino_id=p_casino_id
    AND business_date BETWEEN p_period_start AND p_period_end
    AND COALESCE(players_card_balance,0) <> 0
  ORDER BY business_date DESC LIMIT 1;
  v_card_balance := COALESCE(v_card_balance, 0);

  v_incomes := jsonb_build_object(
    'live_game', COALESCE((SELECT SUM(COALESCE(tables_result,0)) FROM fin_day_closing
      WHERE casino_id=p_casino_id AND business_date BETWEEN p_period_start AND p_period_end),0),
    'slots', COALESCE((SELECT SUM(COALESCE(slots_result,0)) FROM fin_day_closing
      WHERE casino_id=p_casino_id AND business_date BETWEEN p_period_start AND p_period_end),0),
    'other', COALESCE((SELECT SUM(COALESCE(amount,0)*COALESCE(fx_rate,1)) FROM fin_other_incomes
      WHERE casino_id=p_casino_id AND business_date BETWEEN p_period_start AND p_period_end
        AND reverses_id IS NULL AND reversed_by_id IS NULL),0),
    'card_balance', v_card_balance,
    'missed_chips', v_missed_chips,
    'missed_cards', v_missed_cards
  );

  SELECT COALESCE(SUM(COALESCE(e.amount_tzs, e.amount)),0) INTO v_collections
  FROM expenses e
  LEFT JOIN fin_categories fc ON fc.id = e.fin_category_id
  WHERE e.casino_id = p_casino_id
    AND e.business_date BETWEEN p_period_start AND p_period_end
    AND e.approved = TRUE
    AND e.voided_at IS NULL
    AND e.reversal_of IS NULL
    AND (e.source = 'office' OR EXISTS (SELECT 1 FROM business_day_closures c
                 WHERE c.casino_id = e.casino_id AND c.business_date = e.business_date))
    AND NOT EXISTS (SELECT 1 FROM fin_wallet_tx t
                     WHERE t.ref_table='expenses' AND t.ref_id=e.id AND t.posted_at IS NULL)
    AND (COALESCE(fc.group_code,'') ILIKE '%collection%' OR COALESCE(fc.name,'') ILIKE '%collection%')
    AND NOT (COALESCE(fc.name,'') ILIKE '%transfer%' OR COALESCE(fc.name,'') ILIKE '%money change%');

  SELECT COALESCE(SUM(COALESCE(e.amount_tzs, e.amount)),0) INTO v_transfers
  FROM expenses e
  LEFT JOIN fin_categories fc ON fc.id = e.fin_category_id
  WHERE e.casino_id = p_casino_id
    AND e.business_date BETWEEN p_period_start AND p_period_end
    AND e.approved = TRUE
    AND e.voided_at IS NULL
    AND e.reversal_of IS NULL
    AND (e.source = 'office' OR EXISTS (SELECT 1 FROM business_day_closures c
                 WHERE c.casino_id = e.casino_id AND c.business_date = e.business_date))
    AND NOT EXISTS (SELECT 1 FROM fin_wallet_tx t
                     WHERE t.ref_table='expenses' AND t.ref_id=e.id AND t.posted_at IS NULL)
    AND (COALESCE(fc.group_code,'') ILIKE '%collection%' OR COALESCE(fc.name,'') ILIKE '%collection%')
    AND (COALESCE(fc.name,'') ILIKE '%transfer%' OR COALESCE(fc.name,'') ILIKE '%money change%');

  SELECT COALESCE(SUM(COALESCE(e.amount_tzs, e.amount)),0) INTO v_expenses
  FROM expenses e
  LEFT JOIN fin_categories fc ON fc.id = e.fin_category_id
  WHERE e.casino_id = p_casino_id
    AND e.business_date BETWEEN p_period_start AND p_period_end
    AND e.approved = TRUE
    AND e.voided_at IS NULL
    AND e.reversal_of IS NULL
    AND (e.source = 'office' OR EXISTS (SELECT 1 FROM business_day_closures c
                 WHERE c.casino_id = e.casino_id AND c.business_date = e.business_date))
    AND NOT EXISTS (SELECT 1 FROM fin_wallet_tx t
                     WHERE t.ref_table='expenses' AND t.ref_id=e.id AND t.posted_at IS NULL)
    AND NOT (COALESCE(fc.group_code,'') ILIKE '%collection%' OR COALESCE(fc.name,'') ILIKE '%collection%');

  WITH tx AS (
    SELECT wallet_id,
      SUM(CASE WHEN kind='income' THEN COALESCE(amount,0)
               WHEN kind='expense' THEN -COALESCE(amount,0)
               ELSE COALESCE(amount,0) END) AS delta_native,
      SUM(CASE WHEN kind='income' THEN COALESCE(amount_tzs,0)
               WHEN kind='expense' THEN -COALESCE(amount_tzs,0)
               ELSE COALESCE(amount_tzs,0) END) AS delta_tzs
    FROM fin_wallet_tx
    WHERE casino_id=p_casino_id AND business_date <= p_period_end AND posted_at IS NOT NULL
    GROUP BY wallet_id
  ),
  phys AS (
    SELECT DISTINCT ON (wallet_id)
           wallet_id, physical_total, created_at
    FROM cash_count_snapshots
    WHERE casino_id=p_casino_id AND wallet_id IS NOT NULL AND created_at::date <= p_period_end
    ORDER BY wallet_id, created_at DESC
  ),
  post AS (
    SELECT t.wallet_id,
      SUM(CASE WHEN t.kind='income' THEN COALESCE(t.amount,0)
               WHEN t.kind='expense' THEN -COALESCE(t.amount,0)
               ELSE COALESCE(t.amount,0) END) AS delta_native,
      SUM(CASE WHEN t.kind='income' THEN COALESCE(t.amount_tzs,0)
               WHEN t.kind='expense' THEN -COALESCE(t.amount_tzs,0)
               ELSE COALESCE(t.amount_tzs,0) END) AS delta_tzs
    FROM fin_wallet_tx t
    JOIN phys p ON p.wallet_id = t.wallet_id
    WHERE t.casino_id=p_casino_id
      AND t.business_date <= p_period_end
      AND t.posted_at IS NOT NULL
      AND t.created_at > p.created_at
    GROUP BY t.wallet_id
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'wallet_id', w.id,
    'name', w.name,
    'kind', w.kind,
    'currency', w.currency,
    'ledger', COALESCE(w.starting_float_amount,0) + COALESCE(tx.delta_native,0),
    'ledger_native', COALESCE(w.starting_float_amount,0) + COALESCE(tx.delta_native,0),
    'ledger_tzs', CASE
      WHEN w.currency='TZS' THEN COALESCE(w.starting_float_amount,0) + COALESCE(tx.delta_tzs,0)
      WHEN w.currency='USD' THEN (COALESCE(w.starting_float_amount,0) + COALESCE(tx.delta_native,0)) * v_usd_tzs
      ELSE COALESCE(w.starting_float_amount,0) * COALESCE(NULLIF((v_rates->>w.currency),'')::numeric, 1) + COALESCE(tx.delta_tzs,0)
    END,
    'physical', ph.physical_total,
    'physical_asof', ph.created_at,
    'actual_native', CASE
      WHEN ph.physical_total IS NULL THEN COALESCE(w.starting_float_amount,0) + COALESCE(tx.delta_native,0)
      ELSE ph.physical_total + COALESCE(po.delta_native,0) END,
    'actual_tzs', CASE
      WHEN ph.physical_total IS NULL THEN (CASE
          WHEN w.currency='TZS' THEN COALESCE(w.starting_float_amount,0) + COALESCE(tx.delta_tzs,0)
          WHEN w.currency='USD' THEN (COALESCE(w.starting_float_amount,0) + COALESCE(tx.delta_native,0)) * v_usd_tzs
          ELSE COALESCE(w.starting_float_amount,0) * COALESCE(NULLIF((v_rates->>w.currency),'')::numeric, 1) + COALESCE(tx.delta_tzs,0)
        END)
      WHEN w.currency='TZS' THEN ph.physical_total + COALESCE(po.delta_tzs,0)
      WHEN w.currency='USD' THEN (ph.physical_total + COALESCE(po.delta_native,0)) * v_usd_tzs
      ELSE (ph.physical_total + COALESCE(po.delta_native,0)) * COALESCE(NULLIF((v_rates->>w.currency),'')::numeric, 1)
    END
  ) ORDER BY w.sort_order NULLS LAST, w.name), '[]'::jsonb)
  INTO v_wallets
  FROM fin_wallets w
  LEFT JOIN tx ON tx.wallet_id = w.id
  LEFT JOIN phys ph ON ph.wallet_id = w.id
  LEFT JOIN post po ON po.wallet_id = w.id
  WHERE w.casino_id=p_casino_id AND w.is_active=TRUE;

  RETURN jsonb_build_object(
    'period', jsonb_build_object('start', p_period_start, 'end', p_period_end),
    'rates', v_rates || jsonb_build_object('usd_tzs', v_usd_tzs),
    'starting_float', v_starting,
    'incomes', v_incomes,
    'expenses_total', v_expenses,
    'collections_total', v_collections,
    'transfers_total', v_transfers,
    'wallets', v_wallets
  );
END;
$function$;