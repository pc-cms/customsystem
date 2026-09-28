DO $do$
DECLARE d text; r record;
BEGIN
  FOR r IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
           WHERE n.nspname='public' AND p.proname='close_business_day_with_figures' AND p.pronargs=8 LOOP
    d := pg_get_functiondef(r.oid);
    IF position('AND oi.source = ''jp'';' in d) = 0 THEN RAISE EXCEPTION 'pattern not found (close)'; END IF;
    d := replace(d, 'AND oi.source = ''jp'';', 'AND oi.source = ''jp'' AND oi.amount > 0 AND oi.reverses_id IS NULL AND oi.reversed_by_id IS NULL;');
    EXECUTE d;
  END LOOP;
  SELECT p.oid INTO r FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='ace_apply_closed_report';
  d := pg_get_functiondef(r.oid);
  IF position('AND COALESCE(oi.note,'''') LIKE ''JP · ACE%''' in d) = 0 THEN RAISE EXCEPTION 'pattern not found (ace)'; END IF;
  d := replace(d, 'AND COALESCE(oi.note,'''') LIKE ''JP · ACE%''', 'AND COALESCE(oi.note,'''') LIKE ''JP · ACE%'' AND oi.amount > 0');
  EXECUTE d;
END $do$;