DO $mig$
DECLARE
  v_batch uuid := '11111111-1111-4111-8111-111111111102';
  r record;
  total_before int; total_after int; remaining int; changed int := 0;
  new_qual text; new_check text; role_list text; sql text;
BEGIN
  SELECT count(*) INTO total_before FROM pg_policies WHERE schemaname='public';
  PERFORM public.snapshot_policies(v_batch);

  FOR r IN
    SELECT schemaname, tablename, policyname, cmd, permissive, roles, qual, with_check
    FROM pg_policies
    WHERE schemaname='public'
      AND (coalesce(qual,'')||coalesce(with_check,'')) LIKE '%has_role(auth.uid(), ''finance_manager''::app_role)%'
  LOOP
    new_qual  := replace(coalesce(r.qual,''),       'has_role(auth.uid(), ''finance_manager''::app_role)', 'can_finance(auth.uid())');
    new_check := replace(coalesce(r.with_check,''), 'has_role(auth.uid(), ''finance_manager''::app_role)', 'can_finance(auth.uid())');

    role_list := array_to_string(ARRAY(SELECT quote_ident(x) FROM unnest(r.roles) AS x), ', ');
    IF role_list IS NULL OR role_list = '' THEN role_list := 'public'; END IF;

    sql := format(
      'DROP POLICY IF EXISTS %I ON %I.%I; CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s%s%s;',
      r.policyname, r.schemaname, r.tablename,
      r.policyname, r.schemaname, r.tablename,
      r.permissive, r.cmd, role_list,
      CASE WHEN r.qual IS NULL THEN '' ELSE ' USING (' || new_qual || ')' END,
      CASE WHEN r.with_check IS NULL THEN '' ELSE ' WITH CHECK (' || new_check || ')' END
    );
    EXECUTE sql;
    changed := changed + 1;
  END LOOP;

  SELECT count(*) INTO total_after FROM pg_policies WHERE schemaname='public';
  IF total_after <> total_before THEN
    RAISE EXCEPTION 'policy count changed: % -> %', total_before, total_after;
  END IF;

  SELECT count(*) INTO remaining FROM pg_policies
  WHERE schemaname='public'
    AND (coalesce(qual,'')||coalesce(with_check,'')) LIKE '%has_role(auth.uid(), ''finance_manager''::app_role)%';
  IF remaining <> 0 THEN RAISE EXCEPTION 'leftover finance_manager literals: %', remaining; END IF;

  PERFORM 1
  FROM pg_policies p
  JOIN public._policy_backup b ON b.batch_id=v_batch AND b.tablename=p.tablename AND b.policyname=p.policyname
  WHERE replace(coalesce(p.qual,''), 'can_finance(auth.uid())', 'has_role(auth.uid(), ''finance_manager''::app_role)') IS DISTINCT FROM coalesce(b.qual,'')
     OR replace(coalesce(p.with_check,''), 'can_finance(auth.uid())', 'has_role(auth.uid(), ''finance_manager''::app_role)') IS DISTINCT FROM coalesce(b.with_check,'');
  IF FOUND THEN RAISE EXCEPTION 'policy text diff detected after rewrite'; END IF;

  RAISE NOTICE 'rewritten % finance policies (batch %)', changed, v_batch;
END
$mig$;