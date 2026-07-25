
CREATE OR REPLACE FUNCTION public.run_rls_multicasino_tests()
RETURNS TABLE(status text, test text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $fn$
DECLARE
  v_casino_a uuid;
  v_casino_b uuid;
  v_employee uuid;
  v_table    uuid;
  v_pit      uuid := gen_random_uuid();
  v_cash     uuid := gen_random_uuid();
  v_admin    uuid := gen_random_uuid();
  v_today    date := current_date;
  v_cnt      int;
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'run_rls_multicasino_tests: super_admin only';
  END IF;

  SELECT id INTO v_casino_a FROM public.casinos ORDER BY created_at LIMIT 1;
  SELECT id INTO v_casino_b FROM public.casinos WHERE id <> v_casino_a ORDER BY created_at LIMIT 1;
  SELECT id INTO v_employee FROM public.employees WHERE casino_id = v_casino_a LIMIT 1;
  SELECT id INTO v_table    FROM public.gaming_tables WHERE casino_id = v_casino_a LIMIT 1;
  IF v_casino_a IS NULL OR v_casino_b IS NULL OR v_employee IS NULL OR v_table IS NULL THEN
    RAISE EXCEPTION 'need >=2 casinos and at least one employee+table in casino A';
  END IF;

  INSERT INTO auth.users(id, is_sso_user, is_anonymous)
    VALUES (v_pit,false,false),(v_cash,false,false),(v_admin,false,false);
  INSERT INTO public.user_roles(user_id, role) VALUES
    (v_pit,'pit'::app_role),
    (v_cash,'cashier'::app_role),
    (v_admin,'super_admin'::app_role);
  INSERT INTO public.user_casino_access(user_id, casino_id) VALUES
    (v_pit, v_casino_a),
    (v_cash, v_casino_a);

  ---------- PIT on casino A ----------
  PERFORM set_config('request.jwt.claim.sub', v_pit::text, true);
  PERFORM set_config('request.jwt.claim.role','authenticated', true);
  SET LOCAL ROLE authenticated;

  BEGIN
    INSERT INTO public.dealer_attendance(casino_id,employee_id,date,value,recorded_by)
      VALUES(v_casino_a,v_employee,v_today,'P',v_pit);
    status:='PASS'; test:='allow pit INSERT dealer_attendance A'; RETURN NEXT;
  EXCEPTION WHEN OTHERS THEN
    status:='FAIL'; test:='allow pit INSERT dealer_attendance A — '||SQLERRM; RETURN NEXT;
  END;

  BEGIN
    UPDATE public.dealer_attendance SET value='A'
      WHERE casino_id=v_casino_a AND employee_id=v_employee AND date=v_today;
    IF NOT FOUND THEN RAISE EXCEPTION 'no rows updated'; END IF;
    status:='PASS'; test:='allow pit UPDATE dealer_attendance A'; RETURN NEXT;
  EXCEPTION WHEN OTHERS THEN
    status:='FAIL'; test:='allow pit UPDATE dealer_attendance A — '||SQLERRM; RETURN NEXT;
  END;

  SELECT count(*) INTO v_cnt FROM public.dealer_attendance
    WHERE casino_id=v_casino_a AND employee_id=v_employee AND date=v_today;
  status := CASE WHEN v_cnt=1 THEN 'PASS' ELSE 'FAIL' END;
  test   := format('allow pit SELECT dealer_attendance A (rows=%s)', v_cnt); RETURN NEXT;

  BEGIN
    INSERT INTO public.chip_snapshots(casino_id,date,location_type,denomination,expected_quantity,actual_quantity,recorded_by)
      VALUES(v_casino_a,v_today,'inventory',1000,0,0,v_pit);
    status:='PASS'; test:='allow pit INSERT chip_snapshots A'; RETURN NEXT;
  EXCEPTION WHEN OTHERS THEN
    status:='FAIL'; test:='allow pit INSERT chip_snapshots A — '||SQLERRM; RETURN NEXT;
  END;

  BEGIN
    INSERT INTO public.table_tracker(casino_id,table_id,date,time_slot,value,recorded_by)
      VALUES(v_casino_a,v_table,v_today,'10:00',5,v_pit);
    status:='PASS'; test:='allow pit INSERT table_tracker A'; RETURN NEXT;
  EXCEPTION WHEN OTHERS THEN
    status:='FAIL'; test:='allow pit INSERT table_tracker A — '||SQLERRM; RETURN NEXT;
  END;

  BEGIN
    UPDATE public.table_tracker SET value=7
      WHERE casino_id=v_casino_a AND table_id=v_table AND date=v_today AND time_slot='10:00';
    IF NOT FOUND THEN RAISE EXCEPTION 'no rows updated'; END IF;
    status:='PASS'; test:='allow pit UPDATE table_tracker A'; RETURN NEXT;
  EXCEPTION WHEN OTHERS THEN
    status:='FAIL'; test:='allow pit UPDATE table_tracker A — '||SQLERRM; RETURN NEXT;
  END;

  ---------- PIT on casino B (no access) ----------
  BEGIN
    INSERT INTO public.dealer_attendance(casino_id,employee_id,date,value,recorded_by)
      VALUES(v_casino_b,v_employee,v_today,'P',v_pit);
    status:='FAIL'; test:='deny pit INSERT dealer_attendance B — unexpected SUCCESS'; RETURN NEXT;
  EXCEPTION WHEN OTHERS THEN
    status:='PASS'; test:='deny pit INSERT dealer_attendance B'; RETURN NEXT;
  END;

  BEGIN
    INSERT INTO public.chip_snapshots(casino_id,date,location_type,denomination,expected_quantity,actual_quantity,recorded_by)
      VALUES(v_casino_b,v_today,'inventory',1000,0,0,v_pit);
    status:='FAIL'; test:='deny pit INSERT chip_snapshots B — unexpected SUCCESS'; RETURN NEXT;
  EXCEPTION WHEN OTHERS THEN
    status:='PASS'; test:='deny pit INSERT chip_snapshots B'; RETURN NEXT;
  END;

  BEGIN
    INSERT INTO public.table_tracker(casino_id,table_id,date,time_slot,value,recorded_by)
      VALUES(v_casino_b,v_table,v_today,'10:00',5,v_pit);
    status:='FAIL'; test:='deny pit INSERT table_tracker B — unexpected SUCCESS'; RETURN NEXT;
  EXCEPTION WHEN OTHERS THEN
    status:='PASS'; test:='deny pit INSERT table_tracker B'; RETURN NEXT;
  END;

  ---------- CASHIER (wrong role) on casino A ----------
  PERFORM set_config('request.jwt.claim.sub', v_cash::text, true);
  BEGIN
    INSERT INTO public.dealer_attendance(casino_id,employee_id,date,value,recorded_by)
      VALUES(v_casino_a,v_employee,v_today,'P',v_cash);
    status:='FAIL'; test:='deny cashier INSERT dealer_attendance A — unexpected SUCCESS'; RETURN NEXT;
  EXCEPTION WHEN OTHERS THEN
    status:='PASS'; test:='deny cashier INSERT dealer_attendance A'; RETURN NEXT;
  END;

  BEGIN
    INSERT INTO public.table_tracker(casino_id,table_id,date,time_slot,value,recorded_by)
      VALUES(v_casino_a,v_table,v_today,'11:00',3,v_cash);
    status:='FAIL'; test:='deny cashier INSERT table_tracker A — unexpected SUCCESS'; RETURN NEXT;
  EXCEPTION WHEN OTHERS THEN
    status:='PASS'; test:='deny cashier INSERT table_tracker A'; RETURN NEXT;
  END;

  ---------- Grant pit access to B ----------
  RESET ROLE;
  INSERT INTO public.user_casino_access(user_id, casino_id) VALUES (v_pit, v_casino_b);
  PERFORM set_config('request.jwt.claim.sub', v_pit::text, true);
  SET LOCAL ROLE authenticated;

  BEGIN
    INSERT INTO public.dealer_attendance(casino_id,employee_id,date,value,recorded_by)
      VALUES(v_casino_b,v_employee,v_today,'P',v_pit);
    status:='PASS'; test:='allow pit INSERT dealer_attendance B after grant'; RETURN NEXT;
  EXCEPTION WHEN OTHERS THEN
    status:='FAIL'; test:='allow pit INSERT dealer_attendance B after grant — '||SQLERRM; RETURN NEXT;
  END;

  BEGIN
    INSERT INTO public.chip_snapshots(casino_id,date,location_type,denomination,expected_quantity,actual_quantity,recorded_by)
      VALUES(v_casino_b,v_today,'inventory',500,0,0,v_pit);
    status:='PASS'; test:='allow pit INSERT chip_snapshots B after grant'; RETURN NEXT;
  EXCEPTION WHEN OTHERS THEN
    status:='FAIL'; test:='allow pit INSERT chip_snapshots B after grant — '||SQLERRM; RETURN NEXT;
  END;

  ---------- SUPER ADMIN sees across casinos ----------
  PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);
  SELECT count(*) INTO v_cnt FROM public.dealer_attendance
    WHERE date=v_today AND casino_id IN (v_casino_a, v_casino_b) AND recorded_by=v_pit;
  status := CASE WHEN v_cnt >= 2 THEN 'PASS' ELSE 'FAIL' END;
  test   := format('allow super_admin SELECT across casinos (rows=%s)', v_cnt); RETURN NEXT;

  RESET ROLE;

  -- ── Cleanup: remove everything created by this run ────────────────
  DELETE FROM public.dealer_attendance WHERE recorded_by IN (v_pit, v_cash, v_admin);
  DELETE FROM public.chip_snapshots    WHERE recorded_by IN (v_pit, v_cash, v_admin);
  DELETE FROM public.table_tracker     WHERE recorded_by IN (v_pit, v_cash, v_admin);
  DELETE FROM public.user_casino_access WHERE user_id IN (v_pit, v_cash, v_admin);
  DELETE FROM public.user_roles         WHERE user_id IN (v_pit, v_cash, v_admin);
  DELETE FROM auth.users                WHERE id      IN (v_pit, v_cash, v_admin);

  RETURN;
EXCEPTION WHEN OTHERS THEN
  -- best-effort cleanup on any failure
  BEGIN RESET ROLE; EXCEPTION WHEN OTHERS THEN NULL; END;
  DELETE FROM public.dealer_attendance WHERE recorded_by IN (v_pit, v_cash, v_admin);
  DELETE FROM public.chip_snapshots    WHERE recorded_by IN (v_pit, v_cash, v_admin);
  DELETE FROM public.table_tracker     WHERE recorded_by IN (v_pit, v_cash, v_admin);
  DELETE FROM public.user_casino_access WHERE user_id IN (v_pit, v_cash, v_admin);
  DELETE FROM public.user_roles         WHERE user_id IN (v_pit, v_cash, v_admin);
  DELETE FROM auth.users                WHERE id      IN (v_pit, v_cash, v_admin);
  RAISE;
END
$fn$;

REVOKE ALL ON FUNCTION public.run_rls_multicasino_tests() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.run_rls_multicasino_tests() TO authenticated, service_role;
COMMENT ON FUNCTION public.run_rls_multicasino_tests() IS
  'RLS regression tests for dealer_attendance, chip_snapshots, table_tracker across multi-casino access. Super_admin only. Test data is cleaned up before return.';
