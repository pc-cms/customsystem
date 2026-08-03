-- 1. Actual = last physical count + movements after it
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
    WHERE casino_id=p_casino_id AND business_date <= p_period_end
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
    -- movements booked AFTER the last physical count (count itself excluded)
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
    -- Actual: count is the anchor, later movements still apply.
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

-- 2. RLS for cash_count_snapshots: multi-casino access
DROP POLICY IF EXISTS "Casino fm/managers insert cash counts" ON public.cash_count_snapshots;
DROP POLICY IF EXISTS "Casino fm/managers see cash counts" ON public.cash_count_snapshots;

CREATE POLICY "Finance/managers see cash counts"
ON public.cash_count_snapshots FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'super_admin'::app_role)
  OR ((can_manage(auth.uid()) OR can_finance(auth.uid()))
      AND (casino_id = get_user_casino_id(auth.uid()) OR user_has_casino_access(auth.uid(), casino_id)))
);

CREATE POLICY "Finance/managers insert cash counts"
ON public.cash_count_snapshots FOR INSERT TO authenticated
WITH CHECK (
  counted_by = auth.uid()
  AND (
    has_role(auth.uid(), 'super_admin'::app_role)
    OR ((can_manage(auth.uid()) OR can_finance(auth.uid()))
        AND (casino_id = get_user_casino_id(auth.uid()) OR user_has_casino_access(auth.uid(), casino_id)))
  )
);

GRANT SELECT, INSERT ON public.cash_count_snapshots TO authenticated;
GRANT ALL ON public.cash_count_snapshots TO service_role;

-- 3. Keep physical counts authoritative when earlier rows change
CREATE OR REPLACE FUNCTION public.fin_resync_wallet_counts(p_wallet_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r RECORD;
  v_base NUMERIC;
  v_target NUMERIC;
BEGIN
  IF p_wallet_id IS NULL THEN RETURN; END IF;
  FOR r IN
    SELECT s.id AS snap_id, s.physical_total, s.created_at,
           t.id AS tx_id, COALESCE(NULLIF(t.fx_rate,0),1) AS fx_rate,
           w.starting_float_amount
    FROM cash_count_snapshots s
    JOIN fin_wallet_tx t ON t.ref_table='cash_count' AND t.ref_id = s.id
    JOIN fin_wallets w ON w.id = s.wallet_id
    WHERE s.wallet_id = p_wallet_id
  LOOP
    SELECT COALESCE(r.starting_float_amount,0) + COALESCE(SUM(
      CASE WHEN t2.kind='income' THEN COALESCE(t2.amount,0)
           WHEN t2.kind='expense' THEN -COALESCE(t2.amount,0)
           ELSE COALESCE(t2.amount,0) END),0)
      INTO v_base
    FROM fin_wallet_tx t2
    WHERE t2.wallet_id = p_wallet_id
      AND t2.id <> r.tx_id
      AND t2.created_at < r.created_at;

    v_target := r.physical_total - v_base;

    UPDATE fin_wallet_tx
       SET amount = v_target,
           amount_tzs = v_target * r.fx_rate
     WHERE id = r.tx_id
       AND amount IS DISTINCT FROM v_target;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_fin_wallet_tx_resync_counts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_row RECORD;
BEGIN
  v_row := COALESCE(NEW, OLD);
  IF COALESCE(v_row.ref_table,'') = 'cash_count' THEN
    RETURN NULL;
  END IF;
  PERFORM public.fin_resync_wallet_counts(v_row.wallet_id);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_fin_wallet_tx_resync_counts ON public.fin_wallet_tx;
CREATE TRIGGER trg_fin_wallet_tx_resync_counts
AFTER INSERT OR UPDATE OR DELETE ON public.fin_wallet_tx
FOR EACH ROW EXECUTE FUNCTION public.tg_fin_wallet_tx_resync_counts();

-- 4. Atomic save of a physical count (snapshot + linked adjustment)
CREATE OR REPLACE FUNCTION public.fin_save_wallet_count(
  p_wallet_id uuid,
  p_counted numeric,
  p_denominations jsonb DEFAULT '{}'::jsonb,
  p_note text DEFAULT '',
  p_business_date date DEFAULT NULL,
  p_fx_rate numeric DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  w RECORD;
  v_uid uuid := auth.uid();
  v_rate NUMERIC;
  v_base NUMERIC;
  v_variance NUMERIC;
  v_date DATE;
  v_snap uuid;
  v_tx uuid;
  v_wallet_type wallet_type;
BEGIN
  SELECT * INTO w FROM fin_wallets WHERE id = p_wallet_id;
  IF w.id IS NULL THEN RAISE EXCEPTION 'wallet not found'; END IF;
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT (
    has_role(v_uid,'super_admin'::app_role)
    OR ((can_manage(v_uid) OR can_finance(v_uid))
        AND (w.casino_id = get_user_casino_id(v_uid) OR user_has_casino_access(v_uid, w.casino_id)))
  ) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  v_rate := COALESCE(NULLIF(p_fx_rate,0), 1);
  v_date := COALESCE(p_business_date, (now() AT TIME ZONE 'Africa/Dar_es_Salaam')::date);

  SELECT COALESCE(w.starting_float_amount,0) + COALESCE(SUM(
    CASE WHEN t.kind='income' THEN COALESCE(t.amount,0)
         WHEN t.kind='expense' THEN -COALESCE(t.amount,0)
         ELSE COALESCE(t.amount,0) END),0)
    INTO v_base
  FROM fin_wallet_tx t WHERE t.wallet_id = p_wallet_id;

  v_variance := p_counted - v_base;

  v_wallet_type := CASE w.kind
    WHEN 'cash' THEN 'main_cash'
    WHEN 'safe' THEN 'office_safe'
    WHEN 'bank' THEN 'bank_account'
    WHEN 'mobile_money' THEN 'mobile_money'
    WHEN 'cage' THEN 'cage_table'
    ELSE 'other_reserve' END::wallet_type;

  INSERT INTO cash_count_snapshots (
    casino_id, wallet_id, wallet_type, currency, denominations,
    physical_total, expected_balance, discrepancy, exchange_rate,
    physical_total_tzs, counted_by, note
  ) VALUES (
    w.casino_id, w.id, v_wallet_type, w.currency, COALESCE(p_denominations,'{}'::jsonb),
    p_counted, v_base, v_variance, v_rate,
    p_counted * v_rate, v_uid, COALESCE(p_note,'')
  ) RETURNING id INTO v_snap;

  IF abs(v_variance) >= 0.01 THEN
    INSERT INTO fin_wallet_tx (
      casino_id, wallet_id, kind, amount, currency, fx_rate, amount_tzs,
      business_date, ref_table, ref_id, note, created_by
    ) VALUES (
      w.casino_id, w.id, 'adjustment', v_variance, w.currency, v_rate, v_variance * v_rate,
      v_date, 'cash_count', v_snap,
      'Physical count · ' || w.name || ' = ' || trim(to_char(p_counted,'FM999999999990.99')) || ' ' || w.currency
        || CASE WHEN COALESCE(p_note,'') <> '' THEN ' · ' || p_note ELSE '' END,
      v_uid
    ) RETURNING id INTO v_tx;
  END IF;

  RETURN jsonb_build_object(
    'snapshot_id', v_snap, 'tx_id', v_tx,
    'expected', v_base, 'counted', p_counted, 'variance', v_variance
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.fin_save_wallet_count(uuid, numeric, jsonb, text, date, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fin_resync_wallet_counts(uuid) TO authenticated;