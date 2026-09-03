DO $$
DECLARE
  src text;
  cur_line text := 'ORDER BY wallet_id, created_at DESC, COALESCE(business_date, created_at::date) DESC';
  orig_line text := 'ORDER BY wallet_id, COALESCE(business_date, created_at::date) DESC, created_at DESC';
BEGIN
  SELECT pg_get_functiondef(oid) INTO src
  FROM pg_proc WHERE proname = 'fin_balance_snapshot'
    AND pronamespace = 'public'::regnamespace;
  IF position(cur_line in src) = 0 THEN
    RAISE EXCEPTION 'expected clause not found';
  END IF;
  EXECUTE replace(src, cur_line, orig_line);
END $$;