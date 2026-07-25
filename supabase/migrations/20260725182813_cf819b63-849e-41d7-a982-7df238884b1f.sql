
CREATE OR REPLACE FUNCTION public.run_rls_multicasino_tests()
RETURNS TABLE(status text, test text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $fn$
DECLARE
  needle text := 'user_has_casino_access';
  tb text; ac text;
  cases text[][] := ARRAY[
    ['dealer_attendance','SELECT'],
    ['dealer_attendance','INSERT'],
    ['dealer_attendance','UPDATE'],
    ['chip_snapshots','SELECT'],
    ['chip_snapshots','INSERT'],
    -- chip_snapshots is append-only: no UPDATE policy expected
    ['table_tracker','SELECT'],
    ['table_tracker','INSERT'],
    ['table_tracker','UPDATE']
  ];
  i int;
  has_expr boolean;
  has_rls  boolean;
  tbls text[] := ARRAY['dealer_attendance','chip_snapshots','table_tracker'];
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'run_rls_multicasino_tests: super_admin only';
  END IF;

  FOREACH tb IN ARRAY tbls LOOP
    SELECT c.relrowsecurity INTO has_rls
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname=tb;
    status := CASE WHEN has_rls THEN 'PASS' ELSE 'FAIL' END;
    test   := format('RLS enabled on public.%s', tb);
    RETURN NEXT;
  END LOOP;

  FOR i IN 1 .. array_length(cases,1) LOOP
    tb := cases[i][1];
    ac := cases[i][2];
    SELECT EXISTS(
      SELECT 1 FROM pg_policies p
      WHERE p.schemaname='public' AND p.tablename=tb
        AND (p.cmd = ac OR p.cmd = 'ALL')
        AND (COALESCE(p.qual,'') ILIKE '%'||needle||'%'
          OR COALESCE(p.with_check,'') ILIKE '%'||needle||'%')
    ) INTO has_expr;
    status := CASE WHEN has_expr THEN 'PASS' ELSE 'FAIL' END;
    test   := format('%s policy on public.%s references %s()', ac, tb, needle);
    RETURN NEXT;
  END LOOP;

  SELECT EXISTS(
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='user_has_casino_access' AND p.prosecdef
  ) INTO has_expr;
  status := CASE WHEN has_expr THEN 'PASS' ELSE 'FAIL' END;
  test   := 'helper public.user_has_casino_access() is SECURITY DEFINER';
  RETURN NEXT;

  RETURN;
END
$fn$;
