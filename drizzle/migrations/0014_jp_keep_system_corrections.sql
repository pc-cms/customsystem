DO $do$
DECLARE d text; r record;
BEGIN
  FOR r IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
           WHERE n.nspname='public' AND p.proname='close_business_day_with_figures' AND p.pronargs=8 LOOP
    d := pg_get_functiondef(r.oid);
    d := replace(d, 'AND oi.amount > 0 AND oi.reverses_id', 'AND (oi.amount > 0 OR COALESCE(oi.note,'''') LIKE ''JP · %'') AND oi.reverses_id');
    EXECUTE d;
  END LOOP;
  SELECT p.oid INTO r FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='ace_apply_closed_report';
  d := pg_get_functiondef(r.oid);
  d := replace(d, 'LIKE ''JP · ACE%'' AND oi.amount > 0', 'LIKE ''JP · ACE%''');
  EXECUTE d;
END $do$;