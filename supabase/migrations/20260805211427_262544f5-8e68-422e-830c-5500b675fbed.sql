DO $$
DECLARE
  r RECORD;
  v_actor uuid;
  v_diff numeric;
BEGIN
  SELECT u.id INTO v_actor FROM auth.users u ORDER BY u.created_at LIMIT 1;
  IF v_actor IS NULL THEN RETURN; END IF;

  FOR r IN
    WITH w AS (
      SELECT id, COALESCE(starting_float_amount,0) AS sf
      FROM fin_wallets WHERE is_active = TRUE
    ),
    p AS (
      SELECT DISTINCT ON (wallet_id) wallet_id, physical_total
      FROM cash_count_snapshots
      WHERE wallet_id IS NOT NULL
      ORDER BY wallet_id, created_at DESC
    ),
    tx AS (
      SELECT wallet_id,
             SUM(CASE WHEN kind IN ('expense','manual_expense','collection','change_out')
                      THEN -abs(COALESCE(amount,0)) ELSE COALESCE(amount,0) END) AS delta_all
      FROM fin_wallet_tx
      WHERE posted_at IS NOT NULL
      GROUP BY wallet_id
    )
    SELECT w.id, w.sf, p.physical_total, COALESCE(tx.delta_all,0) AS delta_all
    FROM w LEFT JOIN p ON p.wallet_id = w.id LEFT JOIN tx ON tx.wallet_id = w.id
  LOOP
    v_diff := (r.sf + r.delta_all) - COALESCE(r.physical_total, r.sf);
    IF v_diff <> 0 THEN
      PERFORM fin_wallet_autocount(r.id, v_diff, NULL, v_actor,
                                   'Baseline · adjustments sync');
    END IF;
  END LOOP;
END $$;