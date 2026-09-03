DO $$
DECLARE
  src text;
  old_line text := 'ORDER BY wallet_id, COALESCE(business_date, created_at::date) DESC, created_at DESC';
  new_line text := 'ORDER BY wallet_id, created_at DESC, COALESCE(business_date, created_at::date) DESC';
BEGIN
  SELECT pg_get_functiondef(oid) INTO src
  FROM pg_proc WHERE proname = 'fin_balance_snapshot'
    AND pronamespace = 'public'::regnamespace;

  IF src IS NULL THEN
    RAISE EXCEPTION 'fin_balance_snapshot not found';
  END IF;
  IF position(old_line in src) = 0 THEN
    RAISE EXCEPTION 'phys ORDER BY clause not found — aborting';
  END IF;

  EXECUTE replace(src, old_line, new_line);
END $$;