DO $mig$
DECLARE r record; d text;
BEGIN
  FOR r IN
    SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public'
      AND pg_get_functiondef(p.oid) LIKE '%''change_out'',''transfer_out''%'
  LOOP
    d := pg_get_functiondef(r.oid);
    d := replace(d,
      '''expense'',''manual_expense'',''collection'',''change_out'',''transfer_out''',
      '''expense'',''manual_expense'',''collection'',''change_out'',''transfer_out'',''adjustment_out''');
    EXECUTE d;
  END LOOP;

  FOR r IN
    SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='fin_resync_wallet_counts'
  LOOP
    d := pg_get_functiondef(r.oid);
    d := replace(d, 'WHEN t2.kind=''expense'' THEN', 'WHEN t2.kind IN (''expense'',''adjustment_out'') THEN');
    EXECUTE d;
  END LOOP;
END
$mig$;