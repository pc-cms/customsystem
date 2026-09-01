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
  v_transfers_exp NUMERIC;
  v_wallets JSONB;
  v_daily JSONB;
  v_missed_chips NUMERIC;
  v_missed_cards NUMERIC;
  v_card_balance NUMERIC;
  v_rates JSONB;
  v_float_open NUMERIC;
  v_float_add NUMERIC;
  v_ic_liability NUMERIC;
  v_ic_receivable NUMERIC;
  v_bar NUMERIC;
  c_commission TEXT[] := ARRAY['other','fee','commission','agent_commission'];
  c_tips TEXT[] := ARRAY['tips','bonus','tips_bonus'];
  c_move TEXT[] := ARRAY['investment','owner_topup','office'];
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

  SELECT COALESCE(SUM(COALESCE(amount,0)*CASE WHEN COALESCE(currency,'TZS')='TZS' THEN 1 ELSE COALESCE(NULLIF(fx_rate,0), NULLIF((v_rates->>currency),'')::numeric, v_usd_tzs) END),0) INTO v_float_open
  FROM fin_other_incomes
  WHERE casino_id=p_casino_id AND business_date < p_period_start
    AND reverses_id IS NULL AND reversed_by_id IS NULL
    AND COALESCE(source,'') = 'add_float';
  v_float_open := v_float_open + COALESCE((v_starting->>'grand_tzs')::numeric, 0);

  SELECT COALESCE(SUM(COALESCE(amount,0)*CASE WHEN COALESCE(currency,'TZS')='TZS' THEN 1 ELSE COALESCE(NULLIF(fx_rate,0), NULLIF((v_rates->>currency),'')::numeric, v_usd_tzs) END),0) INTO v_float_add
  FROM fin_other_incomes
  WHERE casino_id=p_casino_id AND business_date BETWEEN p_period_start AND p_period_end
    AND reverses_id IS NULL AND reversed_by_id IS NULL
    AND COALESCE(source,'') = 'add_float';

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

  SELECT COALESCE(SUM(COALESCE(d.players_card_balance,0)),0) INTO v_card_balance
  FROM fin_day_closing d
  WHERE d.casino_id=p_casino_id
    AND d.business_date BETWEEN p_period_start AND p_period_end
    AND EXISTS (SELECT 1 FROM business_day_closures c
                 WHERE c.casino_id=d.casino_id AND c.business_date=d.business_date);

  SELECT COALESCE(SUM(
           CASE
             WHEN t.payment_split IS NOT NULL THEN
               COALESCE(NULLIF((t.payment_split->>'cash'),'')::numeric,0)
               + COALESCE(NULLIF((t.payment_split->>'card'),'')::numeric,0)
             ELSE COALESCE(t.total_tzs,0)
           END), 0) INTO v_bar
  FROM pos_tabs t
  WHERE t.casino_id = p_casino_id
    AND t.business_date BETWEEN p_period_start AND p_period_end
    AND COALESCE(t.status,'') NOT IN ('void','voided','cancelled','open')
    AND t.closed_at IS NOT NULL;

  v_incomes := jsonb_build_object(
    'live_game', COALESCE((SELECT SUM(COALESCE(d.tables_result,0)) FROM fin_day_closing d
      WHERE d.casino_id=p_casino_id AND d.business_date BETWEEN p_period_start AND p_period_end
        AND EXISTS (SELECT 1 FROM business_day_closures c
                     WHERE c.casino_id=d.casino_id AND c.business_date=d.business_date)),0),
    'slots', COALESCE((SELECT SUM(COALESCE(d.cashdesk_win,0)) FROM fin_day_closing d
      WHERE d.casino_id=p_casino_id AND d.business_date BETWEEN p_period_start AND p_period_end
        AND EXISTS (SELECT 1 FROM business_day_closures c
                     WHERE c.casino_id=d.casino_id AND c.business_date=d.business_date)),0),
    'slots_system', COALESCE((SELECT SUM(COALESCE(d.slots_result,0)) FROM fin_day_closing d
      WHERE d.casino_id=p_casino_id AND d.business_date BETWEEN p_period_start AND p_period_end
        AND EXISTS (SELECT 1 FROM business_day_closures c
                     WHERE c.casino_id=d.casino_id AND c.business_date=d.business_date)),0),
    'other', COALESCE((SELECT SUM(COALESCE(amount,0)*CASE WHEN COALESCE(currency,'TZS')='TZS' THEN 1 ELSE COALESCE(NULLIF(fx_rate,0), NULLIF((v_rates->>currency),'')::numeric, v_usd_tzs) END) FROM fin_other_incomes
      WHERE casino_id=p_casino_id AND business_date BETWEEN p_period_start AND p_period_end
        AND reverses_id IS NULL AND reversed_by_id IS NULL
        AND COALESCE(source,'') = ANY(c_commission)),0),
    'tips_bonus', COALESCE((SELECT SUM(COALESCE(amount,0)*CASE WHEN COALESCE(currency,'TZS')='TZS' THEN 1 ELSE COALESCE(NULLIF(fx_rate,0), NULLIF((v_rates->>currency),'')::numeric, v_usd_tzs) END) FROM fin_other_incomes
      WHERE casino_id=p_casino_id AND business_date BETWEEN p_period_start AND p_period_end
        AND reverses_id IS NULL AND reversed_by_id IS NULL
        AND COALESCE(source,'') = ANY(c_tips)),0),
    'movements', COALESCE((SELECT SUM(COALESCE(amount,0)*CASE WHEN COALESCE(currency,'TZS')='TZS' THEN 1 ELSE COALESCE(NULLIF(fx_rate,0), NULLIF((v_rates->>currency),'')::numeric, v_usd_tzs) END) FROM fin_other_incomes
      WHERE casino_id=p_casino_id AND business_date BETWEEN p_period_start AND p_period_end
        AND reverses_id IS NULL AND reversed_by_id IS NULL
        AND COALESCE(source,'') = ANY(c_move)),0),
    'add_float', v_float_add,
    'jp', COALESCE((SELECT SUM(COALESCE(amount,0)*CASE WHEN COALESCE(currency,'TZS')='TZS' THEN 1 ELSE COALESCE(NULLIF(fx_rate,0), NULLIF((v_rates->>currency),'')::numeric, v_usd_tzs) END) FROM fin_other_incomes
      WHERE casino_id=p_casino_id AND business_date BETWEEN p_period_start AND p_period_end
        AND reverses_id IS NULL AND reversed_by_id IS NULL
        AND COALESCE(source,'') = 'jp'),0),
    'bar_income', v_bar,
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
      AND e.approved = TRUE AND e.voided_at IS NULL AND e.reversal_of IS NULL
      AND (e.source = 'office' OR EXISTS (SELECT 1 FROM business_day_closures c
                   WHERE c.casino_id = p_casino_id AND c.business_date = e.business_date))
  )
  SELECT
    COALESCE(SUM(amt) FILTER (WHERE NOT (gcode ILIKE '%collection%' OR cname ILIKE '%collection%')),0),
    COALESCE(SUM(amt) FILTER (WHERE (gcode ILIKE '%collection%' OR cname ILIKE '%collection%')
                                AND NOT (cname ILIKE '%transfer%' OR cname ILIKE '%money change%')),0),
    COALESCE(SUM(amt) FILTER (WHERE (gcode ILIKE '%collection%' OR cname ILIKE '%collection%')
                                AND (cname ILIKE '%transfer%' OR cname ILIKE '%money change%')),0)
  INTO v_expenses, v_collections, v_transfers_exp
  FROM e;

  SELECT COALESCE(SUM(
           CASE WHEN t.from_casino_id = p_casino_id THEN 1 ELSE -1 END
           * COALESCE(t.amount,0)
           * CASE WHEN COALESCE(t.currency,'TZS') = 'TZS' THEN 1
                  ELSE COALESCE(NULLIF((v_rates->>t.currency),'')::numeric, v_usd_tzs) END
         ),0)
    INTO v_transfers
  FROM fin_inter_casino_transfers t
  WHERE (t.from_casino_id = p_casino_id OR t.to_casino_id = p_casino_id)
    AND t.business_date BETWEEN p_period_start AND p_period_end
    AND COALESCE(t.status,'') = 'accepted';

  v_transfers := v_transfers + COALESCE(v_transfers_exp,0);

  SELECT
    COALESCE(SUM(CASE
      WHEN t.to_casino_id = p_casino_id AND COALESCE(t.kind,'funding') = 'funding' THEN amt
      WHEN t.from_casino_id = p_casino_id AND COALESCE(t.kind,'funding') = 'repayment' THEN -amt
      ELSE 0 END),0),
    COALESCE(SUM(CASE
      WHEN t.from_casino_id = p_casino_id AND COALESCE(t.kind,'funding') = 'funding' THEN amt
      WHEN t.to_casino_id = p_casino_id AND COALESCE(t.kind,'funding') = 'repayment' THEN -amt
      ELSE 0 END),0)
  INTO v_ic_liability, v_ic_receivable
  FROM (
    SELECT t.*, COALESCE(t.amount,0) * CASE WHEN COALESCE(t.currency,'TZS')='TZS' THEN 1
                  ELSE COALESCE(NULLIF((v_rates->>t.currency),'')::numeric, v_usd_tzs) END AS amt
    FROM fin_inter_casino_transfers t
    WHERE (t.from_casino_id = p_casino_id OR t.to_casino_id = p_casino_id)
      AND t.business_date <= p_period_end
      AND COALESCE(t.status,'') = 'accepted'
  ) t;

  WITH days AS (
    SELECT d::date AS business_date FROM generate_series(p_period_start, p_period_end, interval '1 day') d
  ),
  inc AS (
    SELECT d.business_date,
           COALESCE(d.tables_result,0) AS live_game,
           COALESCE(d.cashdesk_win,0) AS slots,
           COALESCE(d.slots_result,0) AS slots_system,
           COALESCE(d.players_card_balance,0) AS card_balance
    FROM fin_day_closing d
    WHERE d.casino_id=p_casino_id AND d.business_date BETWEEN p_period_start AND p_period_end
      AND EXISTS (SELECT 1 FROM business_day_closures c
                   WHERE c.casino_id=d.casino_id AND c.business_date=d.business_date)
  ),
  oth AS (
    SELECT business_date,
           SUM(COALESCE(amount,0)*CASE WHEN COALESCE(currency,'TZS')='TZS' THEN 1 ELSE COALESCE(NULLIF(fx_rate,0), NULLIF((v_rates->>currency),'')::numeric, v_usd_tzs) END) FILTER (WHERE COALESCE(source,'') = ANY(c_commission)) AS other,
           SUM(COALESCE(amount,0)*CASE WHEN COALESCE(currency,'TZS')='TZS' THEN 1 ELSE COALESCE(NULLIF(fx_rate,0), NULLIF((v_rates->>currency),'')::numeric, v_usd_tzs) END) FILTER (WHERE COALESCE(source,'') = ANY(c_tips)) AS tips_bonus,
           SUM(COALESCE(amount,0)*CASE WHEN COALESCE(currency,'TZS')='TZS' THEN 1 ELSE COALESCE(NULLIF(fx_rate,0), NULLIF((v_rates->>currency),'')::numeric, v_usd_tzs) END) FILTER (WHERE COALESCE(source,'') = ANY(c_move)) AS movements,
           SUM(COALESCE(amount,0)*CASE WHEN COALESCE(currency,'TZS')='TZS' THEN 1 ELSE COALESCE(NULLIF(fx_rate,0), NULLIF((v_rates->>currency),'')::numeric, v_usd_tzs) END) FILTER (WHERE COALESCE(source,'') = 'add_float') AS add_float,
           SUM(COALESCE(amount,0)*CASE WHEN COALESCE(currency,'TZS')='TZS' THEN 1 ELSE COALESCE(NULLIF(fx_rate,0), NULLIF((v_rates->>currency),'')::numeric, v_usd_tzs) END) FILTER (WHERE COALESCE(source,'') = 'jp') AS jp
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
  bar AS (
    SELECT t.business_date,
      SUM(CASE
            WHEN t.payment_split IS NOT NULL THEN
              COALESCE(NULLIF((t.payment_split->>'cash'),'')::numeric,0)
              + COALESCE(NULLIF((t.payment_split->>'card'),'')::numeric,0)
            ELSE COALESCE(t.total_tzs,0)
          END) AS bar_income
    FROM pos_tabs t
    WHERE t.casino_id = p_casino_id
      AND t.business_date BETWEEN p_period_start AND p_period_end
      AND COALESCE(t.status,'') NOT IN ('void','voided','cancelled','open')
      AND t.closed_at IS NOT NULL
    GROUP BY t.business_date
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
    'slots_system', COALESCE(inc.slots_system,0),
    'card_balance', COALESCE(inc.card_balance,0),
    'other', COALESCE(oth.other,0),
    'tips_bonus', COALESCE(oth.tips_bonus,0),
    'movements', COALESCE(oth.movements,0),
    'add_float', COALESCE(oth.add_float,0),
    'jp', COALESCE(oth.jp,0),
    'bar_income', COALESCE(bar.bar_income,0),
    'expenses', COALESCE(exp.expenses,0),
    'collections', COALESCE(exp.collections,0),
    'cage_expenses', COALESCE(cage.cage_expenses,0),
    'cage_posted', COALESCE(cage.cage_posted, TRUE),
    'net', COALESCE(inc.live_game,0)+COALESCE(inc.slots,0)+COALESCE(oth.other,0)+COALESCE(oth.tips_bonus,0)+COALESCE(oth.movements,0)+COALESCE(oth.add_float,0)+COALESCE(oth.jp,0)+COALESCE(bar.bar_income,0)-COALESCE(exp.expenses,0)-COALESCE(exp.collections,0)
  ) ORDER BY d.business_date), '[]'::jsonb)
  INTO v_daily
  FROM days d
  LEFT JOIN inc ON inc.business_date = d.business_date
  LEFT JOIN oth ON oth.business_date = d.business_date
  LEFT JOIN exp ON exp.business_date = d.business_date
  LEFT JOIN bar ON bar.business_date = d.business_date
  LEFT JOIN cage ON cage.business_date = d.business_date
  WHERE COALESCE(inc.live_game,0)<>0 OR COALESCE(inc.slots,0)<>0 OR COALESCE(inc.slots_system,0)<>0 OR COALESCE(inc.card_balance,0)<>0
     OR COALESCE(oth.other,0)<>0 OR COALESCE(oth.tips_bonus,0)<>0 OR COALESCE(oth.movements,0)<>0
     OR COALESCE(oth.add_float,0)<>0 OR COALESCE(oth.jp,0)<>0
     OR COALESCE(exp.expenses,0)<>0 OR COALESCE(exp.collections,0)<>0 OR COALESCE(cage.cage_expenses,0)<>0 OR COALESCE(bar.bar_income,0)<>0;

  WITH tx AS (
    SELECT t.wallet_id,
      SUM(CASE WHEN t.kind IN ('expense','manual_expense','collection','change_out','transfer_out')
               THEN -abs(COALESCE(t.amount,0)) ELSE COALESCE(t.amount,0) END) AS delta_native,
      SUM(CASE WHEN t.kind IN ('expense','manual_expense','collection','change_out','transfer_out')
               THEN -abs(COALESCE(t.amount_tzs,0)) ELSE COALESCE(t.amount_tzs,0) END) AS delta_tzs
    FROM fin_wallet_tx t
    JOIN fin_wallets w2 ON w2.id = t.wallet_id
    WHERE t.casino_id=p_casino_id AND t.posted_at IS NOT NULL
      AND t.business_date <= p_period_end
      AND t.business_date >= COALESCE(w2.starting_float_date, p_period_start)
      AND COALESCE(t.kind,'') <> 'adjustment'
      AND COALESCE(t.ref_table,'') <> 'cash_count'
    GROUP BY t.wallet_id
  ),
  -- CANON: a physical count belongs to the BUSINESS DAY it was taken for,
  -- not to the calendar day it was typed in. Counting 31/08 on 01/09 is the
  -- normal flow and must stay inside the August accounting window.
  phys AS (
    SELECT DISTINCT ON (wallet_id)
           wallet_id, physical_total, created_at, source,
           COALESCE(business_date, created_at::date) AS count_date
    FROM cash_count_snapshots
    WHERE casino_id=p_casino_id AND wallet_id IS NOT NULL
      AND COALESCE(business_date, created_at::date) <= p_period_end
    ORDER BY wallet_id, COALESCE(business_date, created_at::date) DESC, created_at DESC
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
    'physical_date', ph.count_date,
    'physical_source', ph.source,
    'actual_native', COALESCE(ph.physical_total, COALESCE(w.starting_float_amount,0)),
    'actual_tzs', CASE
      WHEN w.currency='TZS' THEN COALESCE(ph.physical_total, COALESCE(w.starting_float_amount,0))
      WHEN w.currency='USD' THEN COALESCE(ph.physical_total, COALESCE(w.starting_float_amount,0)) * v_usd_tzs
      ELSE COALESCE(ph.physical_total, COALESCE(w.starting_float_amount,0)) * COALESCE(NULLIF((v_rates->>w.currency),'')::numeric, 1)
    END
  ) ORDER BY w.sort_order NULLS LAST, w.name), '[]'::jsonb)
  INTO v_wallets
  FROM fin_wallets w
  LEFT JOIN tx ON tx.wallet_id = w.id
  LEFT JOIN phys ph ON ph.wallet_id = w.id
  WHERE w.casino_id=p_casino_id AND w.is_active=TRUE;

  RETURN jsonb_build_object(
    'period', jsonb_build_object('start', p_period_start, 'end', p_period_end),
    'rates', v_rates || jsonb_build_object('usd_tzs', v_usd_tzs),
    'starting_float', v_starting,
    'basic_float', jsonb_build_object(
      'opening_tzs', v_float_open,
      'add_tzs', v_float_add,
      'current_tzs', v_float_open + v_float_add
    ),
    'intercompany', jsonb_build_object(
      'liability_tzs', v_ic_liability,
      'receivable_tzs', v_ic_receivable
    ),
    'incomes', v_incomes,
    'expenses_total', v_expenses,
    'collections_total', v_collections,
    'transfers_total', v_transfers,
    'daily', v_daily,
    'wallets', v_wallets
  );
END
$function$;