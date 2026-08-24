DO $do$
DECLARE
  s text;
  old_tail text;
  new_tail text;
BEGIN
  SELECT prosrc INTO s FROM pg_proc WHERE proname = 'fin_balance_snapshot' LIMIT 1;
  IF s IS NULL THEN RAISE EXCEPTION 'fin_balance_snapshot not found'; END IF;

  old_tail := position('  SELECT COALESCE(jsonb_agg(w ORDER BY w->>''name''), ''[]''::jsonb) INTO v_wallets' in s)::text;
  IF old_tail = '0' THEN RAISE EXCEPTION 'wallets block not found'; END IF;

  s := left(s, position('  SELECT COALESCE(jsonb_agg(w ORDER BY w->>''name''), ''[]''::jsonb) INTO v_wallets' in s) - 1);

  new_tail := '
  WITH tx AS (
    SELECT t.wallet_id,
      SUM(CASE WHEN t.kind IN (''expense'',''manual_expense'',''collection'',''change_out'',''transfer_out'')
               THEN -abs(COALESCE(t.amount,0)) ELSE COALESCE(t.amount,0) END) AS delta_native,
      SUM(CASE WHEN t.kind IN (''expense'',''manual_expense'',''collection'',''change_out'',''transfer_out'')
               THEN -abs(COALESCE(t.amount_tzs,0)) ELSE COALESCE(t.amount_tzs,0) END) AS delta_tzs
    FROM fin_wallet_tx t
    JOIN fin_wallets w2 ON w2.id = t.wallet_id
    WHERE t.casino_id=p_casino_id AND t.posted_at IS NOT NULL
      AND t.business_date <= p_period_end
      AND t.business_date >= COALESCE(w2.starting_float_date, p_period_start)
      AND COALESCE(t.kind,'''') <> ''adjustment''
      AND COALESCE(t.ref_table,'''') <> ''cash_count''
    GROUP BY t.wallet_id
  ),
  phys AS (
    SELECT DISTINCT ON (wallet_id)
           wallet_id, physical_total, created_at, source
    FROM cash_count_snapshots
    WHERE casino_id=p_casino_id AND wallet_id IS NOT NULL AND created_at::date <= p_period_end
    ORDER BY wallet_id, created_at DESC
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    ''wallet_id'', w.id,
    ''name'', w.name,
    ''kind'', w.kind,
    ''currency'', w.currency,
    ''ledger'', COALESCE(w.starting_float_amount,0) + COALESCE(tx.delta_native,0),
    ''ledger_native'', COALESCE(w.starting_float_amount,0) + COALESCE(tx.delta_native,0),
    ''ledger_tzs'', CASE
      WHEN w.currency=''TZS'' THEN COALESCE(w.starting_float_amount,0) + COALESCE(tx.delta_tzs,0)
      WHEN w.currency=''USD'' THEN (COALESCE(w.starting_float_amount,0) + COALESCE(tx.delta_native,0)) * v_usd_tzs
      ELSE COALESCE(w.starting_float_amount,0) * COALESCE(NULLIF((v_rates->>w.currency),'''')::numeric, 1) + COALESCE(tx.delta_tzs,0)
    END,
    ''physical'', ph.physical_total,
    ''physical_asof'', ph.created_at,
    ''physical_source'', ph.source,
    ''actual_native'', COALESCE(ph.physical_total, COALESCE(w.starting_float_amount,0)),
    ''actual_tzs'', CASE
      WHEN w.currency=''TZS'' THEN COALESCE(ph.physical_total, COALESCE(w.starting_float_amount,0))
      WHEN w.currency=''USD'' THEN COALESCE(ph.physical_total, COALESCE(w.starting_float_amount,0)) * v_usd_tzs
      ELSE COALESCE(ph.physical_total, COALESCE(w.starting_float_amount,0)) * COALESCE(NULLIF((v_rates->>w.currency),'''')::numeric, 1)
    END
  ) ORDER BY w.sort_order NULLS LAST, w.name), ''[]''::jsonb)
  INTO v_wallets
  FROM fin_wallets w
  LEFT JOIN tx ON tx.wallet_id = w.id
  LEFT JOIN phys ph ON ph.wallet_id = w.id
  WHERE w.casino_id=p_casino_id AND w.is_active=TRUE;

  RETURN jsonb_build_object(
    ''period'', jsonb_build_object(''start'', p_period_start, ''end'', p_period_end),
    ''rates'', v_rates || jsonb_build_object(''usd_tzs'', v_usd_tzs),
    ''starting_float'', v_starting,
    ''incomes'', v_incomes,
    ''expenses_total'', v_expenses,
    ''collections_total'', v_collections,
    ''transfers_total'', v_transfers,
    ''daily'', v_daily,
    ''wallets'', v_wallets
  );
END
';

  EXECUTE 'CREATE OR REPLACE FUNCTION public.fin_balance_snapshot(p_casino_id uuid, p_period_start date, p_period_end date)
    RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$' || s || new_tail || '$fn$';
END
$do$;