-- 1. Post a single cage expense to the main TZS cash wallet
CREATE OR REPLACE FUNCTION public.fin_post_cage_expense(_expense_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  e public.expenses%ROWTYPE;
  v_wallet uuid;
  v_tzs numeric;
BEGIN
  SELECT * INTO e FROM public.expenses WHERE id = _expense_id;
  IF NOT FOUND THEN RETURN false; END IF;

  IF COALESCE(e.source,'') = 'office' THEN RETURN false; END IF;
  IF e.approved IS NOT TRUE OR e.voided_at IS NOT NULL OR e.reversal_of IS NOT NULL THEN RETURN false; END IF;
  IF COALESCE(e.amount,0) = 0 THEN RETURN false; END IF;

  IF EXISTS (SELECT 1 FROM public.fin_wallet_tx
              WHERE ref_table = 'expenses' AND ref_id = e.id) THEN
    RETURN false;
  END IF;

  SELECT id INTO v_wallet
  FROM public.fin_wallets
  WHERE casino_id = e.casino_id AND is_active = TRUE
    AND currency = 'TZS' AND kind = 'cash'
  ORDER BY sort_order NULLS LAST, name
  LIMIT 1;

  IF v_wallet IS NULL THEN RETURN false; END IF;

  v_tzs := COALESCE(e.amount_tzs, e.amount * COALESCE(NULLIF(e.exchange_rate,0),1));

  INSERT INTO public.fin_wallet_tx (
    casino_id, wallet_id, kind, category_id,
    amount, currency, fx_rate, amount_tzs,
    ref_table, ref_id, business_date, note, created_by, denominations, posted_at
  ) VALUES (
    e.casino_id, v_wallet, 'expense', e.fin_category_id,
    v_tzs, 'TZS', 1, v_tzs,
    'expenses', e.id,
    COALESCE(e.business_date, business_date_of(now())),
    'Cage expense (' || COALESCE(e.source,'cage') || '): ' || COALESCE(NULLIF(e.description,''), '(no description)'),
    e.created_by, e.denominations, now()
  );
  RETURN true;
END $$;

-- 2. Post all eligible cage expenses of a business day
CREATE OR REPLACE FUNCTION public.fin_post_cage_expenses_for_day(_casino_id uuid, _business_date date)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE r RECORD; v_n integer := 0;
BEGIN
  FOR r IN
    SELECT e.id FROM public.expenses e
    WHERE e.casino_id = _casino_id
      AND e.business_date = _business_date
      AND COALESCE(e.source,'') <> 'office'
      AND e.approved = TRUE
      AND e.voided_at IS NULL
      AND e.reversal_of IS NULL
      AND NOT EXISTS (SELECT 1 FROM public.fin_wallet_tx t
                       WHERE t.ref_table='expenses' AND t.ref_id = e.id)
  LOOP
    IF public.fin_post_cage_expense(r.id) THEN v_n := v_n + 1; END IF;
  END LOOP;
  RETURN v_n;
END $$;

-- 3. On business day closure -> post that day's cage expenses
CREATE OR REPLACE FUNCTION public.tg_bdc_post_cage_expenses()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.fin_post_cage_expenses_for_day(NEW.casino_id, NEW.business_date);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_bdc_post_cage_expenses ON public.business_day_closures;
CREATE TRIGGER trg_bdc_post_cage_expenses
AFTER INSERT ON public.business_day_closures
FOR EACH ROW EXECUTE FUNCTION public.tg_bdc_post_cage_expenses();

-- 4. Expense approved/voided after the day is already closed
CREATE OR REPLACE FUNCTION public.tg_expenses_cage_wallet_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_day_closed boolean;
BEGIN
  IF COALESCE(NEW.source,'') = 'office' THEN RETURN NEW; END IF;

  IF NEW.approved IS NOT TRUE OR NEW.voided_at IS NOT NULL OR NEW.reversal_of IS NOT NULL THEN
    DELETE FROM public.fin_wallet_tx WHERE ref_table='expenses' AND ref_id = NEW.id;
    RETURN NEW;
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.business_day_closures c
                  WHERE c.casino_id = NEW.casino_id
                    AND c.business_date = COALESCE(NEW.business_date, business_date_of(now())))
    INTO v_day_closed;

  IF v_day_closed THEN
    PERFORM public.fin_post_cage_expense(NEW.id);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_expenses_cage_wallet_sync ON public.expenses;
CREATE TRIGGER trg_expenses_cage_wallet_sync
AFTER INSERT OR UPDATE OF approved, voided_at, amount, amount_tzs, business_date ON public.expenses
FOR EACH ROW EXECUTE FUNCTION public.tg_expenses_cage_wallet_sync();

-- 5. Expose cage expenses + posted flag per day in the balance snapshot
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
  v_daily JSONB;
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
    INTO v_missed_chips FROM shifts s
  WHERE s.casino_id=p_casino_id
    AND business_date_of(COALESCE(s.opened_at, s.closed_at)) BETWEEN p_period_start AND p_period_end
    AND s.closing_count IS NOT NULL
    AND EXISTS (SELECT 1 FROM business_day_closures c
                 WHERE c.casino_id = s.casino_id
                   AND c.business_date = business_date_of(COALESCE(s.opened_at, s.closed_at)));

  SELECT -COALESCE(SUM(COALESCE(cs.cards_miss,0)),0) INTO v_missed_cards
  FROM cage_slots_shifts cs
  WHERE cs.casino_id=p_casino_id
    AND COALESCE(cs.business_date, business_date_of(COALESCE(cs.opened_at, cs.closed_at)))
        BETWEEN p_period_start AND p_period_end
    AND EXISTS (SELECT 1 FROM business_day_closures c
                 WHERE c.casino_id = cs.casino_id
                   AND c.business_date = COALESCE(cs.business_date, business_date_of(COALESCE(cs.opened_at, cs.closed_at))));

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
        AND reverses_id IS NULL AND reversed_by_id IS NULL
        AND COALESCE(source,'') <> 'jp'),0),
    'jp', COALESCE((SELECT SUM(COALESCE(amount,0)*COALESCE(fx_rate,1)) FROM fin_other_incomes
      WHERE casino_id=p_casino_id AND business_date BETWEEN p_period_start AND p_period_end
        AND reverses_id IS NULL AND reversed_by_id IS NULL
        AND COALESCE(source,'') = 'jp'),0),
    'card_balance', v_card_balance,
    'missed_chips', v_missed_chips,
    'missed_cards', v_missed_cards
  );

  WITH e AS (
    SELECT COALESCE(e.amount_tzs, e.amount) AS amt,
           COALESCE(fc.group_code,'') AS gcode,
           COALESCE(fc.name,'') AS cname
    FROM expenses e
    LEFT JOIN fin_categories fc ON fc.id = e.fin_category_id
    WHERE e.casino_id = p_casino_id
      AND e.business_date BETWEEN p_period_start AND p_period_end
      AND e.approved = TRUE
      AND e.voided_at IS NULL
      AND e.reversal_of IS NULL
      AND (e.source = 'office' OR EXISTS (SELECT 1 FROM business_day_closures c
                   WHERE c.casino_id = p_casino_id AND c.business_date = e.business_date))
  )
  SELECT
    COALESCE(SUM(amt) FILTER (WHERE NOT (gcode ILIKE '%collection%' OR cname ILIKE '%collection%')),0),
    COALESCE(SUM(amt) FILTER (WHERE (gcode ILIKE '%collection%' OR cname ILIKE '%collection%')
                                AND NOT (cname ILIKE '%transfer%' OR cname ILIKE '%money change%')),0),
    COALESCE(SUM(amt) FILTER (WHERE (gcode ILIKE '%collection%' OR cname ILIKE '%collection%')
                                AND (cname ILIKE '%transfer%' OR cname ILIKE '%money change%')),0)
  INTO v_expenses, v_collections, v_transfers
  FROM e;

  WITH days AS (
    SELECT d::date AS business_date FROM generate_series(p_period_start, p_period_end, interval '1 day') d
  ),
  inc AS (
    SELECT business_date,
           COALESCE(tables_result,0) AS live_game,
           COALESCE(slots_result,0) AS slots
    FROM fin_day_closing
    WHERE casino_id=p_casino_id AND business_date BETWEEN p_period_start AND p_period_end
  ),
  oth AS (
    SELECT business_date,
           SUM(COALESCE(amount,0)*COALESCE(fx_rate,1)) FILTER (WHERE COALESCE(source,'') <> 'jp') AS other,
           SUM(COALESCE(amount,0)*COALESCE(fx_rate,1)) FILTER (WHERE COALESCE(source,'') = 'jp') AS jp
    FROM fin_other_incomes
    WHERE casino_id=p_casino_id AND business_date BETWEEN p_period_start AND p_period_end
      AND reverses_id IS NULL AND reversed_by_id IS NULL
    GROUP BY business_date
  ),
  exp AS (
    SELECT e.business_date,
      SUM(COALESCE(e.amount_tzs,e.amount)) FILTER (WHERE NOT (COALESCE(fc.group_code,'') ILIKE '%collection%' OR COALESCE(fc.name,'') ILIKE '%collection%')) AS expenses,
      SUM(COALESCE(e.amount_tzs,e.amount)) FILTER (WHERE (COALESCE(fc.group_code,'') ILIKE '%collection%' OR COALESCE(fc.name,'') ILIKE '%collection%')
                                AND NOT (COALESCE(fc.name,'') ILIKE '%transfer%' OR COALESCE(fc.name,'') ILIKE '%money change%')) AS collections
    FROM expenses e
    LEFT JOIN fin_categories fc ON fc.id = e.fin_category_id
    WHERE e.casino_id = p_casino_id
      AND e.business_date BETWEEN p_period_start AND p_period_end
      AND e.approved = TRUE AND e.voided_at IS NULL AND e.reversal_of IS NULL
      AND (e.source = 'office' OR EXISTS (SELECT 1 FROM business_day_closures c
                   WHERE c.casino_id = p_casino_id AND c.business_date = e.business_date))
    GROUP BY e.business_date
  ),
  cage AS (
    SELECT e.business_date,
      SUM(COALESCE(e.amount_tzs,e.amount)) AS cage_expenses,
      bool_and(EXISTS (SELECT 1 FROM fin_wallet_tx t WHERE t.ref_table='expenses' AND t.ref_id=e.id)) AS cage_posted
    FROM expenses e
    WHERE e.casino_id = p_casino_id
      AND e.business_date BETWEEN p_period_start AND p_period_end
      AND COALESCE(e.source,'') <> 'office'
      AND e.approved = TRUE AND e.voided_at IS NULL AND e.reversal_of IS NULL
    GROUP BY e.business_date
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'business_date', d.business_date,
    'day_closed', EXISTS (SELECT 1 FROM business_day_closures c WHERE c.casino_id=p_casino_id AND c.business_date=d.business_date),
    'live_game', COALESCE(inc.live_game,0),
    'slots', COALESCE(inc.slots,0),
    'other', COALESCE(oth.other,0),
    'jp', COALESCE(oth.jp,0),
    'expenses', COALESCE(exp.expenses,0),
    'collections', COALESCE(exp.collections,0),
    'cage_expenses', COALESCE(cage.cage_expenses,0),
    'cage_posted', COALESCE(cage.cage_posted, TRUE),
    'net', COALESCE(inc.live_game,0)+COALESCE(inc.slots,0)+COALESCE(oth.other,0)+COALESCE(oth.jp,0)-COALESCE(exp.expenses,0)-COALESCE(exp.collections,0)
  ) ORDER BY d.business_date), '[]'::jsonb)
  INTO v_daily
  FROM days d
  LEFT JOIN inc ON inc.business_date = d.business_date
  LEFT JOIN oth ON oth.business_date = d.business_date
  LEFT JOIN exp ON exp.business_date = d.business_date
  LEFT JOIN cage ON cage.business_date = d.business_date
  WHERE COALESCE(inc.live_game,0)<>0 OR COALESCE(inc.slots,0)<>0 OR COALESCE(oth.other,0)<>0 OR COALESCE(oth.jp,0)<>0
     OR COALESCE(exp.expenses,0)<>0 OR COALESCE(exp.collections,0)<>0 OR COALESCE(cage.cage_expenses,0)<>0;

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
    'daily', v_daily,
    'wallets', v_wallets
  );
END;
$function$;