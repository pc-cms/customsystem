DO $mig$
DECLARE
  v_def text;
  v_old text;
  v_new text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'fin_balance_snapshot'
    AND pg_get_function_identity_arguments(p.oid) = 'p_casino_id uuid, p_period_start date, p_period_end date';

  v_old := E'    FROM phys_base b\n    LEFT JOIN adjm a ON a.wallet_id = b.wallet_id\n  )';

  v_new := E'    FROM phys_base b\n    LEFT JOIN adjm a ON a.wallet_id = b.wallet_id\n'
        || E'    UNION ALL\n'
        || E'    SELECT aa.wallet_id,\n'
        || E'           COALESCE(fl2.amount,0) + COALESCE(aa.delta,0),\n'
        || E'           aa.last_at,\n'
        || E'           ''movement''::text,\n'
        || E'           aa.last_date\n'
        || E'    FROM (\n'
        || E'      SELECT t.wallet_id, SUM(COALESCE(t.amount,0)) AS delta,\n'
        || E'             MAX(t.created_at) AS last_at, MAX(t.business_date) AS last_date\n'
        || E'      FROM fin_wallet_tx t\n'
        || E'      WHERE t.casino_id = p_casino_id\n'
        || E'        AND COALESCE(t.kind,'''') = ''adjustment''\n'
        || E'        AND COALESCE(t.ref_table,'''') = ''wallet_movement''\n'
        || E'        AND t.business_date BETWEEN p_period_start AND p_period_end\n'
        || E'      GROUP BY t.wallet_id\n'
        || E'    ) aa\n'
        || E'    LEFT JOIN fl fl2 ON fl2.wallet_id = aa.wallet_id\n'
        || E'    WHERE NOT EXISTS (SELECT 1 FROM phys_base b2 WHERE b2.wallet_id = aa.wallet_id)\n  )';

  IF v_def IS NULL OR strpos(v_def, v_old) = 0 THEN
    RAISE EXCEPTION 'fin_balance_snapshot phys block not found';
  END IF;

  EXECUTE replace(v_def, v_old, v_new);
END
$mig$;