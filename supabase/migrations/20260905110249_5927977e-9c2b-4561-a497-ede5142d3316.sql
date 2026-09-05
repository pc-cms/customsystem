DO $mig$
DECLARE
  v_def text;
  v_old text;
  v_new text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname='public' AND p.proname='fin_balance_snapshot';

  v_old := $old$  phys AS (
    SELECT DISTINCT ON (wallet_id)
           wallet_id, physical_total, created_at, source,
           COALESCE(business_date, created_at::date) AS count_date
    FROM cash_count_snapshots
    WHERE casino_id=p_casino_id AND wallet_id IS NOT NULL
      AND COALESCE(business_date, created_at::date) BETWEEN p_period_start AND p_period_end
    ORDER BY wallet_id, COALESCE(business_date, created_at::date) DESC, created_at DESC
  )$old$;

  v_new := $new$  phys_base AS (
    SELECT DISTINCT ON (wallet_id)
           wallet_id, physical_total, created_at, source,
           COALESCE(business_date, created_at::date) AS count_date
    FROM cash_count_snapshots
    WHERE casino_id=p_casino_id AND wallet_id IS NOT NULL
      AND COALESCE(business_date, created_at::date) BETWEEN p_period_start AND p_period_end
      AND COALESCE(note,'') !~* '^(add money|take money|transfer)'
    ORDER BY wallet_id, COALESCE(business_date, created_at::date) DESC, created_at DESC
  ),
  adjm AS (
    SELECT b.wallet_id,
           SUM(COALESCE(t.amount,0)) AS delta,
           MAX(t.created_at) AS last_at,
           MAX(t.business_date) AS last_date
    FROM phys_base b
    JOIN fin_wallet_tx t ON t.wallet_id = b.wallet_id
    WHERE t.casino_id=p_casino_id
      AND COALESCE(t.kind,'') = 'adjustment'
      AND COALESCE(t.ref_table,'') = 'wallet_movement'
      AND t.business_date BETWEEN p_period_start AND p_period_end
      AND (t.business_date > b.count_date
           OR (t.business_date = b.count_date AND t.created_at > b.created_at))
    GROUP BY b.wallet_id
  ),
  phys AS (
    SELECT b.wallet_id,
           b.physical_total + COALESCE(a.delta,0) AS physical_total,
           GREATEST(b.created_at, COALESCE(a.last_at, b.created_at)) AS created_at,
           b.source,
           GREATEST(b.count_date, COALESCE(a.last_date, b.count_date)) AS count_date
    FROM phys_base b
    LEFT JOIN adjm a ON a.wallet_id = b.wallet_id
  )$new$;

  IF position(v_old in v_def) = 0 THEN
    RAISE EXCEPTION 'fin_balance_snapshot phys block not found';
  END IF;

  EXECUTE replace(v_def, v_old, v_new);
END
$mig$;

UPDATE public.fin_wallet_tx
SET ref_table = 'wallet_movement'
WHERE kind = 'adjustment'
  AND COALESCE(ref_table,'') = ''
  AND note ~* '^(add money|take money|transfer)';