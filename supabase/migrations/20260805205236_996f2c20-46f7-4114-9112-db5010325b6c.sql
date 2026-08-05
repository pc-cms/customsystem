ALTER TABLE public.cash_count_snapshots ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual';

CREATE OR REPLACE FUNCTION public.fin_denoms_scale(p_denoms jsonb, p_factor numeric)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT COALESCE(jsonb_object_agg(key, (value::numeric) * p_factor), '{}'::jsonb)
  FROM jsonb_each_text(COALESCE(p_denoms, '{}'::jsonb))
  WHERE value ~ '^-?[0-9]+(\.[0-9]+)?$';
$$;

CREATE OR REPLACE FUNCTION public.fin_wallet_autocount(
  p_wallet_id uuid, p_amount numeric, p_denoms jsonb, p_actor uuid, p_note text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  w RECORD;
  lastc RECORD;
  base jsonb;
  newd jsonb;
  k text;
  v numeric;
  q numeric;
  total numeric;
  rate numeric;
  wt wallet_type;
BEGIN
  IF p_wallet_id IS NULL OR p_actor IS NULL THEN RETURN; END IF;
  IF COALESCE(p_amount,0) = 0 AND COALESCE(p_denoms,'{}'::jsonb) = '{}'::jsonb THEN RETURN; END IF;

  SELECT * INTO w FROM fin_wallets WHERE id = p_wallet_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT * INTO lastc FROM cash_count_snapshots
   WHERE wallet_id = p_wallet_id ORDER BY created_at DESC LIMIT 1;

  base := COALESCE(lastc.denominations, '{}'::jsonb);
  newd := base;
  IF p_denoms IS NOT NULL THEN
    FOR k, v IN
      SELECT key, value::numeric FROM jsonb_each_text(p_denoms)
      WHERE value ~ '^-?[0-9]+(\.[0-9]+)?$'
    LOOP
      q := COALESCE(NULLIF(base->>k,'')::numeric, 0) + v;
      IF q < 0 THEN q := 0; END IF;
      newd := jsonb_set(newd, ARRAY[k], to_jsonb(q));
    END LOOP;
  END IF;

  total := COALESCE(lastc.physical_total, COALESCE(w.starting_float_amount,0)) + COALESCE(p_amount,0);
  rate := COALESCE(NULLIF(lastc.exchange_rate,0), 1);

  wt := CASE w.kind
    WHEN 'cash' THEN 'main_cash'
    WHEN 'safe' THEN 'office_safe'
    WHEN 'bank' THEN 'bank_account'
    WHEN 'mobile_money' THEN 'mobile_money'
    WHEN 'cage' THEN 'cage_table'
    ELSE 'other_reserve' END::wallet_type;

  INSERT INTO cash_count_snapshots (
    casino_id, wallet_id, wallet_type, currency, denominations,
    physical_total, expected_balance, discrepancy, exchange_rate,
    physical_total_tzs, counted_by, note, source
  ) VALUES (
    w.casino_id, w.id, wt, w.currency, newd,
    total, total, 0, rate,
    total * rate, p_actor, COALESCE(p_note,''), 'auto'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.fin_autocount_after_tx()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  sgn numeric;
  amt numeric;
BEGIN
  -- Reverse the OLD row (update / delete)
  IF TG_OP IN ('UPDATE','DELETE')
     AND OLD.posted_at IS NOT NULL
     AND COALESCE(OLD.kind,'') <> 'adjustment'
     AND COALESCE(OLD.ref_table,'') <> 'cash_count' THEN
    amt := CASE WHEN OLD.kind IN ('expense','manual_expense','collection','change_out')
                THEN -abs(COALESCE(OLD.amount,0)) ELSE COALESCE(OLD.amount,0) END;
    sgn := CASE WHEN amt < 0 THEN -1 ELSE 1 END;
    PERFORM fin_wallet_autocount(
      OLD.wallet_id, -amt,
      fin_denoms_scale(OLD.denominations, -sgn),
      OLD.created_by,
      'Auto count · reversed movement'
    );
  END IF;

  -- Apply the NEW row (insert / update)
  IF TG_OP IN ('INSERT','UPDATE')
     AND NEW.posted_at IS NOT NULL
     AND COALESCE(NEW.kind,'') <> 'adjustment'
     AND COALESCE(NEW.ref_table,'') <> 'cash_count' THEN
    amt := CASE WHEN NEW.kind IN ('expense','manual_expense','collection','change_out')
                THEN -abs(COALESCE(NEW.amount,0)) ELSE COALESCE(NEW.amount,0) END;
    sgn := CASE WHEN amt < 0 THEN -1 ELSE 1 END;
    PERFORM fin_wallet_autocount(
      NEW.wallet_id, amt,
      fin_denoms_scale(NEW.denominations, sgn),
      NEW.created_by,
      'Auto count · ' || COALESCE(NEW.note, NEW.kind)
    );
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_fin_autocount_after_tx ON public.fin_wallet_tx;
CREATE TRIGGER trg_fin_autocount_after_tx
AFTER INSERT OR UPDATE OR DELETE ON public.fin_wallet_tx
FOR EACH ROW EXECUTE FUNCTION public.fin_autocount_after_tx();

CREATE OR REPLACE FUNCTION public.fin_balance_snapshot(
  p_casino_id uuid, p_period_start date, p_period_end date
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
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

  -- Card balance is a per-day difference: sum every day of the period.
  SELECT COALESCE(SUM(COALESCE(players_card_balance,0)),0) INTO v_card_balance
  FROM fin_day_closing
  WHERE casino_id=p_casino_id
    AND business_date BETWEEN p_period_start AND p_period_end;

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
  INTO v_expenses, v_collections, v_transfers
  FROM e;

  WITH days AS (
    SELECT d::date AS business_date FROM generate_series(p_period_start, p_period_end, interval '1 day') d
  ),
  inc AS (
    SELECT business_date,
           COALESCE(tables_result,0) AS live_game,
           COALESCE(slots_result,0) AS slots,
           COALESCE(players_card_balance,0) AS card_balance
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
    'card_balance', COALESCE(inc.card_balance,0),
    'other', COALESCE(oth.other,0),
    'jp', COALESCE(oth.jp,0),
    'expenses', COALESCE(exp.expenses,0),
    'collections', COALESCE(exp.collections,0),
    'cage_expenses', COALESCE(cage.cage_expenses,0),
    'cage_posted', COALESCE(cage.cage_posted, TRUE),
    'net', COALESCE(inc.live_game,0)+COALESCE(inc.slots,0)+COALESCE(inc.card_balance,0)+COALESCE(oth.other,0)+COALESCE(oth.jp,0)-COALESCE(exp.expenses,0)-COALESCE(exp.collections,0)
  ) ORDER BY d.business_date), '[]'::jsonb)
  INTO v_daily
  FROM days d
  LEFT JOIN inc ON inc.business_date = d.business_date
  LEFT JOIN oth ON oth.business_date = d.business_date
  LEFT JOIN exp ON exp.business_date = d.business_date
  LEFT JOIN cage ON cage.business_date = d.business_date
  WHERE COALESCE(inc.live_game,0)<>0 OR COALESCE(inc.slots,0)<>0 OR COALESCE(inc.card_balance,0)<>0
     OR COALESCE(oth.other,0)<>0 OR COALESCE(oth.jp,0)<>0
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
           wallet_id, physical_total, created_at, source
    FROM cash_count_snapshots
    WHERE casino_id=p_casino_id AND wallet_id IS NOT NULL AND created_at::date <= p_period_end
    ORDER BY wallet_id, created_at DESC
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
    'physical_source', ph.source,
    -- Actual = the physical count only. Movements are audit records; each of
    -- them already writes an automatic count, so no ledger top-up here.
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
    'incomes', v_incomes,
    'expenses_total', v_expenses,
    'collections_total', v_collections,
    'transfers_total', v_transfers,
    'daily', v_daily,
    'wallets', v_wallets
  );
END;
$$;