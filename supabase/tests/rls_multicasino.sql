-- RLS regression tests for multi-casino access on
--   dealer_attendance, chip_snapshots, table_tracker
--
-- Verifies:
--   * pit user with access to casino A can INSERT/UPDATE/SELECT rows for A
--   * same pit user is DENIED for casino B (no user_casino_access row)
--   * cashier role (no pit / manager) is DENIED for INSERT even on their casino
--   * granting user_casino_access to casino B lifts the block (casino switch)
--   * super_admin sees rows in any casino
--
-- Runs in a single transaction with ROLLBACK — no data persists.
-- Usage: psql -v ON_ERROR_STOP=1 -f supabase/tests/rls_multicasino.sql

\set ON_ERROR_STOP on
\timing off
BEGIN;

-- ── Fixtures ──────────────────────────────────────────────────────────
DO $fx$
DECLARE
  v_casino_a uuid;
  v_casino_b uuid;
  v_employee uuid;
  v_table    uuid;
BEGIN
  SELECT id INTO v_casino_a FROM public.casinos ORDER BY created_at LIMIT 1;
  SELECT id INTO v_casino_b FROM public.casinos WHERE id <> v_casino_a ORDER BY created_at LIMIT 1;
  IF v_casino_a IS NULL OR v_casino_b IS NULL THEN
    RAISE EXCEPTION 'need at least two casinos to run RLS tests';
  END IF;

  SELECT id INTO v_employee FROM public.employees WHERE casino_id = v_casino_a LIMIT 1;
  SELECT id INTO v_table    FROM public.gaming_tables WHERE casino_id = v_casino_a LIMIT 1;
  IF v_employee IS NULL OR v_table IS NULL THEN
    RAISE EXCEPTION 'casino A needs at least one employee and one gaming_table';
  END IF;

  CREATE TEMP TABLE _ctx(k text primary key, v text);
  INSERT INTO _ctx VALUES
    ('casino_a',   v_casino_a::text),
    ('casino_b',   v_casino_b::text),
    ('employee',   v_employee::text),
    ('table',      v_table::text),
    ('pit_user',   gen_random_uuid()::text),
    ('cash_user',  gen_random_uuid()::text),
    ('admin_user', gen_random_uuid()::text);
END
$fx$;

-- Seed auth.users (FK target for user_roles / user_casino_access), then roles + access
INSERT INTO auth.users(id, is_sso_user, is_anonymous)
SELECT (v)::uuid, false, false FROM _ctx WHERE k IN ('pit_user','cash_user','admin_user');

INSERT INTO public.user_roles(user_id, role)
SELECT (v)::uuid, 'pit'::app_role FROM _ctx WHERE k='pit_user'
UNION ALL SELECT (v)::uuid, 'cashier'::app_role FROM _ctx WHERE k='cash_user'
UNION ALL SELECT (v)::uuid, 'super_admin'::app_role FROM _ctx WHERE k='admin_user';

INSERT INTO public.user_casino_access(user_id, casino_id)
SELECT (SELECT v FROM _ctx WHERE k='pit_user')::uuid,
       (SELECT v FROM _ctx WHERE k='casino_a')::uuid
UNION ALL
SELECT (SELECT v FROM _ctx WHERE k='cash_user')::uuid,
       (SELECT v FROM _ctx WHERE k='casino_a')::uuid;

-- ── Helper: run as given user under `authenticated` role ──────────────
-- Uses set_config so that auth.uid() picks it up via request.jwt.claim.sub
CREATE OR REPLACE FUNCTION pg_temp.as_user(_uid uuid) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', _uid::text, true);
  PERFORM set_config('request.jwt.claim.role','authenticated', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
END $$;

CREATE OR REPLACE FUNCTION pg_temp.reset_role() RETURNS void
LANGUAGE plpgsql AS $$ BEGIN EXECUTE 'RESET ROLE'; END $$;

-- Assertion helpers
CREATE OR REPLACE FUNCTION pg_temp.should_fail(_label text, _sql text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE ok boolean := false;
BEGIN
  BEGIN
    EXECUTE _sql;
  EXCEPTION WHEN insufficient_privilege OR check_violation OR others THEN
    ok := true;
  END;
  IF NOT ok THEN
    RAISE EXCEPTION '❌ expected DENY but SUCCEEDED: %', _label;
  END IF;
  RAISE NOTICE '✅ deny  %', _label;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.should_pass(_label text, _sql text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE _sql;
  RAISE NOTICE '✅ allow %', _label;
EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION '❌ expected ALLOW but FAILED (%): %', SQLERRM, _label;
END $$;

-- ── Tests ─────────────────────────────────────────────────────────────
DO $tests$
DECLARE
  ca uuid := (SELECT v FROM _ctx WHERE k='casino_a')::uuid;
  cb uuid := (SELECT v FROM _ctx WHERE k='casino_b')::uuid;
  emp uuid := (SELECT v FROM _ctx WHERE k='employee')::uuid;
  tbl uuid := (SELECT v FROM _ctx WHERE k='table')::uuid;
  pit uuid := (SELECT v FROM _ctx WHERE k='pit_user')::uuid;
  csh uuid := (SELECT v FROM _ctx WHERE k='cash_user')::uuid;
  adm uuid := (SELECT v FROM _ctx WHERE k='admin_user')::uuid;
  today date := current_date;
  v_cnt int;
BEGIN
  ---------- PIT on casino A (allowed) ----------
  PERFORM pg_temp.as_user(pit);

  PERFORM pg_temp.should_pass('pit INSERT dealer_attendance A', format(
    $q$ INSERT INTO public.dealer_attendance(casino_id, employee_id, date, value, recorded_by)
        VALUES (%L,%L,%L,'P',%L) $q$, ca, emp, today, pit));

  PERFORM pg_temp.should_pass('pit UPDATE dealer_attendance A', format(
    $q$ UPDATE public.dealer_attendance SET value='A'
        WHERE casino_id=%L AND employee_id=%L AND date=%L $q$, ca, emp, today));

  SELECT count(*) INTO v_cnt FROM public.dealer_attendance
    WHERE casino_id=ca AND employee_id=emp AND date=today;
  IF v_cnt <> 1 THEN RAISE EXCEPTION '❌ pit SELECT dealer_attendance A: expected 1 got %', v_cnt; END IF;
  RAISE NOTICE '✅ allow pit SELECT dealer_attendance A';

  PERFORM pg_temp.should_pass('pit INSERT chip_snapshots A', format(
    $q$ INSERT INTO public.chip_snapshots(casino_id,date,location_type,denomination,expected_quantity,actual_quantity,recorded_by)
        VALUES (%L,%L,'inventory',1000,0,0,%L) $q$, ca, today, pit));

  PERFORM pg_temp.should_pass('pit INSERT table_tracker A', format(
    $q$ INSERT INTO public.table_tracker(casino_id,table_id,date,time_slot,value,recorded_by)
        VALUES (%L,%L,%L,'10:00',5,%L) $q$, ca, tbl, today, pit));

  PERFORM pg_temp.should_pass('pit UPDATE table_tracker A', format(
    $q$ UPDATE public.table_tracker SET value=7
        WHERE casino_id=%L AND table_id=%L AND date=%L AND time_slot='10:00' $q$, ca, tbl, today));

  ---------- PIT on casino B (denied — no access) ----------
  PERFORM pg_temp.should_fail('pit INSERT dealer_attendance B (no access)', format(
    $q$ INSERT INTO public.dealer_attendance(casino_id, employee_id, date, value, recorded_by)
        VALUES (%L,%L,%L,'P',%L) $q$, cb, emp, today, pit));

  PERFORM pg_temp.should_fail('pit INSERT chip_snapshots B (no access)', format(
    $q$ INSERT INTO public.chip_snapshots(casino_id,date,location_type,denomination,expected_quantity,actual_quantity,recorded_by)
        VALUES (%L,%L,'inventory',1000,0,0,%L) $q$, cb, today, pit));

  PERFORM pg_temp.should_fail('pit INSERT table_tracker B (no access)', format(
    $q$ INSERT INTO public.table_tracker(casino_id,table_id,date,time_slot,value,recorded_by)
        VALUES (%L,%L,%L,'10:00',5,%L) $q$, cb, tbl, today, pit));

  ---------- CASHIER on casino A (denied — wrong role) ----------
  PERFORM pg_temp.as_user(csh);

  PERFORM pg_temp.should_fail('cashier INSERT dealer_attendance A (wrong role)', format(
    $q$ INSERT INTO public.dealer_attendance(casino_id, employee_id, date, value, recorded_by)
        VALUES (%L,%L,%L,'P',%L) $q$, ca, emp, today, csh));

  PERFORM pg_temp.should_fail('cashier INSERT table_tracker A (wrong role)', format(
    $q$ INSERT INTO public.table_tracker(casino_id,table_id,date,time_slot,value,recorded_by)
        VALUES (%L,%L,%L,'11:00',3,%L) $q$, ca, tbl, today, csh));

  ---------- Grant pit access to B → operations now allowed ----------
  PERFORM pg_temp.reset_role();
  INSERT INTO public.user_casino_access(user_id, casino_id) VALUES (pit, cb);
  PERFORM pg_temp.as_user(pit);

  PERFORM pg_temp.should_pass('pit INSERT dealer_attendance B after grant', format(
    $q$ INSERT INTO public.dealer_attendance(casino_id, employee_id, date, value, recorded_by)
        VALUES (%L,%L,%L,'P',%L) $q$, cb, emp, today, pit));

  PERFORM pg_temp.should_pass('pit INSERT chip_snapshots B after grant', format(
    $q$ INSERT INTO public.chip_snapshots(casino_id,date,location_type,denomination,expected_quantity,actual_quantity,recorded_by)
        VALUES (%L,%L,'inventory',500,0,0,%L) $q$, cb, today, pit));

  ---------- SUPER ADMIN sees rows in both casinos ----------
  PERFORM pg_temp.as_user(adm);
  SELECT count(*) INTO v_cnt FROM public.dealer_attendance
    WHERE date=today AND casino_id IN (ca, cb) AND recorded_by = pit;
  IF v_cnt < 2 THEN RAISE EXCEPTION '❌ super_admin SELECT dealer_attendance: expected >=2 got %', v_cnt; END IF;
  RAISE NOTICE '✅ allow super_admin SELECT across casinos (dealer_attendance=%)', v_cnt;

  PERFORM pg_temp.reset_role();
  RAISE NOTICE '── ALL RLS TESTS PASSED ──';
END
$tests$;

ROLLBACK;
