DO $mig$
DECLARE
  src text;
  old_txt text := E'    AND NOT EXISTS (SELECT 1 FROM fin_wallet_tx t\n                     WHERE t.ref_table=''expenses'' AND t.ref_id=e.id AND t.posted_at IS NULL)';
  new_txt text := E'    AND EXISTS (SELECT 1 FROM fin_wallet_tx t\n                     WHERE t.ref_table=''expenses'' AND t.ref_id=e.id AND t.posted_at IS NOT NULL)';
  n int;
BEGIN
  SELECT pg_get_functiondef(oid) INTO src FROM pg_proc
   WHERE proname='fin_balance_snapshot' AND pronamespace='public'::regnamespace;
  n := (length(src) - length(replace(src, old_txt, ''))) / length(old_txt);
  IF n <> 3 THEN
    RAISE EXCEPTION 'expected 3 occurrences, found %', n;
  END IF;
  EXECUTE replace(src, old_txt, new_txt);
END
$mig$;