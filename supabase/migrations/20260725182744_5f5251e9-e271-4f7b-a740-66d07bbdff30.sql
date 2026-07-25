
CREATE OR REPLACE FUNCTION public.run_rls_multicasino_tests()
RETURNS TABLE(status text, test text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $fn$
DECLARE
  r record;
  needle text := 'user_has_casino_access';
  tbls  text[] := ARRAY['dealer_attendance','chip_snapshots','table_tracker'];
  acts  text[] := ARRAY['SELECT','INSERT','UPDATE'];
  tb text; ac text;
  has_policy boolean;
  has_expr   boolean;
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'run_rls_multicasino_tests: super_admin only';
  END IF;

  -- 1) RLS enabled on all three
  FOREACH tb IN ARRAY tbls LOOP
    SELECT c.relrowsecurity INTO has_policy
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname=tb;
    status := CASE WHEN has_policy THEN 'PASS' ELSE 'FAIL' END;
    test   := format('RLS enabled on public.%s', tb);
    RETURN NEXT;
  END LOOP;

  -- 2) For each (table, action): at least one policy that (a) applies to the action
  --    and (b) references user_has_casino_access in USING or WITH CHECK
  FOREACH tb IN ARRAY tbls LOOP
    FOREACH ac IN ARRAY acts LOOP
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
  END LOOP;

  -- 3) Sanity: user_has_casino_access() function exists and is SECURITY DEFINER
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

REVOKE ALL ON FUNCTION public.run_rls_multicasino_tests() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.run_rls_multicasino_tests() TO authenticated, service_role;
COMMENT ON FUNCTION public.run_rls_multicasino_tests() IS
  'Static regression check: RLS multi-casino policies for dealer_attendance, chip_snapshots, table_tracker. Super_admin only.';
