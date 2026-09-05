DO $mig$
DECLARE
  src text;
  new_txt text := E'      AND t.created_at > b.created_at\n      AND t.business_date >= b.count_date';
  old_txt text := E'      AND (\n        t.business_date > b.count_date\n        OR (t.business_date = b.count_date AND t.created_at > b.created_at)\n      )';
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'fin_balance_snapshot'
  LIMIT 1;

  IF position(old_txt in src) = 0 THEN
    RAISE EXCEPTION 'clause not found';
  END IF;

  src := replace(src, old_txt, new_txt);
  EXECUTE src;
END
$mig$;