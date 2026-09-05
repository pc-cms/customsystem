DO $mig$
DECLARE
  v_def text;
  v_old text;
  v_new text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname='public' AND p.proname='fin_save_wallet_count';

  v_old := $old$  SELECT physical_total
    INTO v_previous
  FROM cash_count_snapshots
  WHERE wallet_id = p_wallet_id
  ORDER BY business_date DESC NULLS LAST, created_at DESC
  LIMIT 1;$old$;

  v_new := $new$  SELECT physical_total
    INTO v_previous
  FROM cash_count_snapshots
  WHERE wallet_id = p_wallet_id
    AND COALESCE(business_date, created_at::date) <= v_bdate
    AND COALESCE(note,'') !~* '^(add money|take money|transfer)'
  ORDER BY business_date DESC NULLS LAST, created_at DESC
  LIMIT 1;$new$;

  IF position(v_old in v_def) = 0 THEN
    RAISE EXCEPTION 'fin_save_wallet_count previous block not found';
  END IF;

  EXECUTE replace(v_def, v_old, v_new);
END
$mig$;