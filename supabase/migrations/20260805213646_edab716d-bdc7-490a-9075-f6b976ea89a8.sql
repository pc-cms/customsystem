-- 1) Wallet balance can never go negative
CREATE OR REPLACE FUNCTION public.fin_wallet_autocount(
  p_wallet_id uuid, p_amount numeric, p_denoms jsonb, p_actor uuid, p_note text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
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

  -- Balance after the movement, starting from the last recorded wallet state.
  total := COALESCE(lastc.physical_total, COALESCE(w.starting_float_amount,0)) + COALESCE(p_amount,0);
  -- A wallet can never hold negative money.
  IF total < 0 THEN total := 0; END IF;
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
$fn$;

-- 2) Office Balance: wallet movements scoped to the starting-float date,
--    physical-count adjustment rows excluded from the ledger column.
DO $do$
DECLARE
  s text;
  old_cte text;
  new_cte text;
BEGIN
  SELECT prosrc INTO s FROM pg_proc WHERE proname = 'fin_balance_snapshot' LIMIT 1;
  IF s IS NULL THEN RAISE EXCEPTION 'fin_balance_snapshot not found'; END IF;

  old_cte := '  WITH tx AS (
    SELECT wallet_id,
      SUM(CASE WHEN kind=''income'' THEN COALESCE(amount,0)
               WHEN kind=''expense'' THEN -COALESCE(amount,0)
               ELSE COALESCE(amount,0) END) AS delta_native,
      SUM(CASE WHEN kind=''income'' THEN COALESCE(amount_tzs,0)
               WHEN kind=''expense'' THEN -COALESCE(amount_tzs,0)
               ELSE COALESCE(amount_tzs,0) END) AS delta_tzs
    FROM fin_wallet_tx
    WHERE casino_id=p_casino_id AND business_date <= p_period_end AND posted_at IS NOT NULL
    GROUP BY wallet_id
  ),';

  new_cte := '  WITH tx AS (
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
  ),';

  IF position(old_cte in s) = 0 THEN
    RAISE EXCEPTION 'fin_balance_snapshot: wallet tx block not found, aborting';
  END IF;

  s := replace(s, old_cte, new_cte);

  EXECUTE 'CREATE OR REPLACE FUNCTION public.fin_balance_snapshot(p_casino_id uuid, p_period_start date, p_period_end date)
    RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$' || s || '$fn$';
END
$do$;