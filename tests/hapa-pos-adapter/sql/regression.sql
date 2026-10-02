-- Transactional regression suite for hapa_pos_adapter_v1.
-- Runs ONLY on synthetic rows and always ends with RAISE EXCEPTION so the whole
-- transaction (schema + synthetic data) is rolled back. A final message
-- 'HAPA_TESTS_PASSED n=<count>' means every assertion below passed.
DO $t$
DECLARE
  c uuid := gen_random_uuid(); c2 uuid := gen_random_uuid();
  actor uuid := gen_random_uuid(); term uuid := gen_random_uuid(); stranger uuid := gen_random_uuid();
  inst uuid := gen_random_uuid();
  cred_hash text := encode(sha256(convert_to('synthetic_installation_credential_only_0123456789','UTF8')),'hex');
  pl uuid := gen_random_uuid(); vis uuid; today date;
  g_exp uuid := gen_random_uuid(); g1 uuid := gen_random_uuid(); g2 uuid := gen_random_uuid();
  op1 uuid := gen_random_uuid(); op2 uuid := gen_random_uuid(); op3 uuid := gen_random_uuid(); op4 uuid := gen_random_uuid(); op5 uuid := gen_random_uuid();
  h text := repeat('a',64);
  r jsonb; r2 jsonb; n int := 0; cnt int; rem bigint; st text;
  base jsonb;
BEGIN
  -- synthetic fixtures
  INSERT INTO auth.users(id, instance_id, aud, role, email)
  VALUES (actor,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','hapa-actor@synthetic.invalid'),
         (term ,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','hapa-terminal@synthetic.invalid'),
         (stranger,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','hapa-stranger@synthetic.invalid');
  INSERT INTO public.casinos(id, name, code) VALUES (c,'HAPA SYNTH A','HZ'||substr(md5(c::text),1,6)), (c2,'HAPA SYNTH B','HZ'||substr(md5(c2::text),1,6));
  INSERT INTO public.profiles(user_id, casino_id, display_name) VALUES (actor, c, 'synthetic actor'), (term, c, 'synthetic terminal');
  INSERT INTO public.house_promo_fund(casino_id, balance) VALUES (c, 100000000);
  INSERT INTO public.players(id, casino_id, first_name, last_name) VALUES (pl, c, 'Synthzq'||substr(md5(pl::text),1,6), 'Hapatest');
  today := public.get_current_business_date(c);
  INSERT INTO public.promo_grants(id, player_id, casino_id, amount, remaining, source, funding_pool, issued_business_date, expires_business_date, status, created_by, created_at)
  VALUES (g_exp, pl, c, 500, 500, 'manual_am', 'house', today-10, today-1, 'active', actor, now()-interval '3 hours'),
         (g1,    pl, c, 300, 300, 'manual_am', 'house', today-1,  today+1, 'active', actor, now()-interval '2 hours'),
         (g2,    pl, c, 1000,1000,'manual_am', 'house', today,    NULL,    'active', actor, now()-interval '1 hour');
  INSERT INTO public.casino_visits(casino_id, player_id, checked_in_at, checked_in_by) VALUES (c, pl, now(), actor) RETURNING id INTO vis;
  INSERT INTO hapa_pos_private.installations(id, casino_id, actor_id, credential_hash, active, expires_at)
  VALUES (inst, c, actor, cred_hash, true, now() + interval '1 day');

  IF NOT public.user_has_casino_access(actor, c) OR public.user_has_casino_access(actor, c2) THEN RAISE EXCEPTION 'FAIL fixture scope'; END IF;
  base := jsonb_build_object('casino_id', c, 'external_player_id', pl, 'currency', 'TZS', 'payload_hash', h);

  -- T1 anon / authenticated direct calls are denied; service_role cannot read private tables
  BEGIN SET LOCAL ROLE anon; PERFORM public.hapa_pos_adapter_v1(inst, cred_hash, 'players', jsonb_build_object('casino_id', c)); RESET ROLE; RAISE EXCEPTION 'FAIL anon adapter';
  EXCEPTION WHEN insufficient_privilege THEN n := n+1; END;
  BEGIN PERFORM set_config('request.jwt.claims', json_build_object('sub', actor, 'role', 'authenticated')::text, true);
        SET LOCAL ROLE authenticated; PERFORM public.hapa_pos_adapter_v1(inst, cred_hash, 'players', jsonb_build_object('casino_id', c)); RESET ROLE; RAISE EXCEPTION 'FAIL auth adapter';
  EXCEPTION WHEN insufficient_privilege THEN n := n+1; END;
  BEGIN SET LOCAL ROLE authenticated; PERFORM hapa_pos_private.redeem_fifo(pl, c, 1, actor); RESET ROLE; RAISE EXCEPTION 'FAIL auth kernel';
  EXCEPTION WHEN insufficient_privilege THEN n := n+1; END;
  BEGIN SET LOCAL ROLE anon; PERFORM hapa_pos_private.redeem_fifo(pl, c, 1, actor); RESET ROLE; RAISE EXCEPTION 'FAIL anon kernel';
  EXCEPTION WHEN insufficient_privilege THEN n := n+1; END;
  BEGIN SET LOCAL ROLE service_role; PERFORM 1 FROM hapa_pos_private.installations; RESET ROLE; RAISE EXCEPTION 'FAIL service_role table';
  EXCEPTION WHEN insufficient_privilege THEN n := n+1; END;
  BEGIN SET LOCAL ROLE service_role; PERFORM hapa_pos_private.redeem_fifo(pl, c, 1, actor); RESET ROLE; RAISE EXCEPTION 'FAIL service_role kernel';
  EXCEPTION WHEN insufficient_privilege THEN n := n+1; END;
  PERFORM set_config('request.jwt.claims', '', true);

  -- T2 service_role reaches adapter but installation checks hold
  BEGIN SET LOCAL ROLE service_role; PERFORM public.hapa_pos_adapter_v1(gen_random_uuid(), cred_hash, 'players', jsonb_build_object('casino_id', c)); RESET ROLE; RAISE EXCEPTION 'FAIL unknown installation';
  EXCEPTION WHEN insufficient_privilege THEN IF SQLERRM <> 'installation_unauthorized' THEN RAISE; END IF; n := n+1; END;
  BEGIN PERFORM public.hapa_pos_adapter_v1(inst, repeat('b',64), 'players', jsonb_build_object('casino_id', c)); RAISE EXCEPTION 'FAIL wrong hash';
  EXCEPTION WHEN insufficient_privilege THEN IF SQLERRM <> 'installation_unauthorized' THEN RAISE; END IF; n := n+1; END;
  UPDATE hapa_pos_private.installations SET active = false WHERE id = inst;
  BEGIN PERFORM public.hapa_pos_adapter_v1(inst, cred_hash, 'players', jsonb_build_object('casino_id', c)); RAISE EXCEPTION 'FAIL inactive';
  EXCEPTION WHEN insufficient_privilege THEN n := n+1; END;
  UPDATE hapa_pos_private.installations SET active = true, expires_at = now() - interval '1 second' WHERE id = inst;
  BEGIN PERFORM public.hapa_pos_adapter_v1(inst, cred_hash, 'players', jsonb_build_object('casino_id', c)); RAISE EXCEPTION 'FAIL expired installation';
  EXCEPTION WHEN insufficient_privilege THEN n := n+1; END;
  UPDATE hapa_pos_private.installations SET expires_at = now() + interval '1 day' WHERE id = inst;

  -- T3 spoofed casino scope
  BEGIN PERFORM public.hapa_pos_adapter_v1(inst, cred_hash, 'players', jsonb_build_object('casino_id', c2)); RAISE EXCEPTION 'FAIL scope';
  EXCEPTION WHEN insufficient_privilege THEN IF SQLERRM <> 'installation_scope_mismatch' THEN RAISE; END IF; n := n+1; END;

  -- T4 players / eligibility
  r := public.hapa_pos_adapter_v1(inst, cred_hash, 'players', jsonb_build_object('casino_id', c, 'query', 'hapatest'));
  IF jsonb_array_length(r->'players') <> 1 THEN RAISE EXCEPTION 'FAIL players %', r; END IF; n := n+1;
  r := public.hapa_pos_adapter_v1(inst, cred_hash, 'eligibility', jsonb_build_object('casino_id', c, 'external_player_id', pl));
  IF (r->>'active')::boolean IS NOT TRUE OR (r->>'visit_id')::uuid <> vis THEN RAISE EXCEPTION 'FAIL eligibility %', r; END IF; n := n+1;

  -- T5 tender identity + whole integers
  BEGIN PERFORM public.hapa_pos_adapter_v1(inst, cred_hash, 'debit', base || jsonb_build_object('operation_id', op1, 'pos_settlement_id', op1, 'visit_id', vis, 'amount_credits', 400, 'money', 100, 'free', 0, 'retail_tzs', 499));
        RAISE EXCEPTION 'FAIL tender identity';
  EXCEPTION WHEN invalid_parameter_value THEN IF SQLERRM <> 'tender_identity_mismatch' THEN RAISE; END IF; n := n+1; END;
  BEGIN PERFORM public.hapa_pos_adapter_v1(inst, cred_hash, 'debit', base || jsonb_build_object('operation_id', op1, 'pos_settlement_id', op1, 'visit_id', vis, 'amount_credits', 400.5, 'money', 99.5, 'free', 0, 'retail_tzs', 500));
        RAISE EXCEPTION 'FAIL fractional';
  EXCEPTION WHEN invalid_parameter_value THEN IF SQLERRM <> 'invalid_operation' THEN RAISE; END IF; n := n+1; END;
  BEGIN PERFORM public.hapa_pos_adapter_v1(inst, cred_hash, 'debit', base || jsonb_build_object('operation_id', op1, 'pos_settlement_id', op1, 'visit_id', vis, 'amount_credits', 400, 'money', 100, 'free', 0, 'retail_tzs', 500, 'currency', 'USD'));
        RAISE EXCEPTION 'FAIL currency';
  EXCEPTION WHEN invalid_parameter_value THEN n := n+1; END;

  -- T6 debit 400: expired grant untouched, FIFO g1 300 then g2 100
  r := public.hapa_pos_adapter_v1(inst, cred_hash, 'debit', base || jsonb_build_object('operation_id', op1, 'pos_settlement_id', op1, 'visit_id', vis, 'amount_credits', 400, 'money', 100, 'free', 0, 'retail_tzs', 500));
  IF r->>'state' <> 'succeeded' THEN RAISE EXCEPTION 'FAIL debit %', r; END IF;
  SELECT remaining INTO rem FROM public.promo_grants WHERE id = g_exp; IF rem <> 500 THEN RAISE EXCEPTION 'FAIL expired spent'; END IF;
  SELECT remaining, status::text INTO rem, st FROM public.promo_grants WHERE id = g1; IF rem <> 0 OR st <> 'exhausted' THEN RAISE EXCEPTION 'FAIL g1 %/%', rem, st; END IF;
  SELECT remaining INTO rem FROM public.promo_grants WHERE id = g2; IF rem <> 900 THEN RAISE EXCEPTION 'FAIL g2 %', rem; END IF;
  n := n+1;

  -- T7 replay returns same receipt, no second debit
  r2 := public.hapa_pos_adapter_v1(inst, cred_hash, 'debit', base || jsonb_build_object('operation_id', op1, 'pos_settlement_id', op1, 'visit_id', vis, 'amount_credits', 400, 'money', 100, 'free', 0, 'retail_tzs', 500));
  SELECT count(*) INTO cnt FROM public.promo_redemptions WHERE player_id = pl;
  SELECT remaining INTO rem FROM public.promo_grants WHERE id = g2;
  IF r2 <> r OR cnt <> 1 OR rem <> 900 THEN RAISE EXCEPTION 'FAIL replay'; END IF; n := n+1;

  -- T8 same id, different payload => conflict
  BEGIN PERFORM public.hapa_pos_adapter_v1(inst, cred_hash, 'debit', base || jsonb_build_object('operation_id', op1, 'pos_settlement_id', op1, 'visit_id', vis, 'amount_credits', 401, 'money', 99, 'free', 0, 'retail_tzs', 500));
        RAISE EXCEPTION 'FAIL conflict';
  EXCEPTION WHEN unique_violation THEN IF SQLERRM <> 'operation_payload_conflict' THEN RAISE; END IF; n := n+1; END;

  -- T9 status
  r2 := public.hapa_pos_adapter_v1(inst, cred_hash, 'status', jsonb_build_object('casino_id', c, 'operation_id', op1));
  IF r2->>'state' <> 'succeeded' THEN RAISE EXCEPTION 'FAIL status'; END IF;
  r2 := public.hapa_pos_adapter_v1(inst, cred_hash, 'status', jsonb_build_object('casino_id', c, 'operation_id', gen_random_uuid()));
  IF r2->>'state' <> 'not_found' THEN RAISE EXCEPTION 'FAIL status nf'; END IF; n := n+1;

  -- T10 shared daily cap: Cage-style redemption + adapter share the same business-day budget
  INSERT INTO public.club_daily_spend_limits(casino_id, daily_cap_credits, effective_from) VALUES (c, 600, today);
  PERFORM public.redeem_promo_fifo(pl, c, 150, NULL, actor, NULL, 'chips');   -- Cage path, 400+150=550
  r2 := public.hapa_pos_adapter_v1(inst, cred_hash, 'debit', base || jsonb_build_object('operation_id', op2, 'pos_settlement_id', op2, 'visit_id', vis, 'amount_credits', 100, 'money', 0, 'free', 0, 'retail_tzs', 100));
  IF r2->>'state' <> 'denied' OR r2->>'reason_code' <> 'daily_cap' THEN RAISE EXCEPTION 'FAIL adapter cap %', r2; END IF;
  BEGIN PERFORM public.redeem_promo_fifo(pl, c, 100, NULL, actor, NULL, 'chips'); RAISE EXCEPTION 'FAIL cage cap';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Daily promo spend cap exceeded%' THEN RAISE; END IF; END;
  SELECT remaining INTO rem FROM public.promo_grants WHERE id = g2; IF rem <> 750 THEN RAISE EXCEPTION 'FAIL cap balance %', rem; END IF;
  UPDATE public.club_daily_spend_limits SET daily_cap_credits = 1000000000 WHERE casino_id = c;
  n := n+1;

  -- T11 POS terminal path preserved (authenticated terminal without cashier role) + spoofed waiter rejected
  PERFORM set_config('request.jwt.claims', json_build_object('sub', term, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  r2 := public.redeem_promo_fifo(pl, c, 50, NULL, term, NULL, 'bar');
  RESET ROLE;
  IF (r2->>'amount')::bigint <> 50 THEN RAISE EXCEPTION 'FAIL terminal redeem'; END IF;
  BEGIN SET LOCAL ROLE authenticated; PERFORM public._pos_operator_employee('spoofed-opaque-session', c); RESET ROLE; RAISE EXCEPTION 'FAIL spoofed waiter';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'OPERATOR_LOCKED%' THEN RAISE; END IF; END;
  BEGIN SET LOCAL ROLE authenticated; PERFORM public.pos_close_tab_v2('spoofed-opaque-session', gen_random_uuid(), 0, 1, 0, 'x', NULL); RESET ROLE; RAISE EXCEPTION 'FAIL close tab';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Tab not found%' THEN RAISE; END IF; END;
  PERFORM set_config('request.jwt.claims', '', true);
  n := n+1;   -- g2 now 700

  -- T12 reversal restores exactly the original grants (g1 300 -> expired if past expiry, g2 +100)
  UPDATE public.promo_grants SET expires_business_date = today - 1 WHERE id = g1;
  BEGIN PERFORM public.hapa_pos_adapter_v1(inst, cred_hash, 'reverse', base || jsonb_build_object('operation_id', op3, 'original_operation_id', op1, 'amount_credits', 399, 'reason', 'synthetic'));
        RAISE EXCEPTION 'FAIL wrong amount reversal';
  EXCEPTION WHEN invalid_parameter_value THEN IF SQLERRM <> 'original_debit_not_reversible' THEN RAISE; END IF; END;
  r2 := public.hapa_pos_adapter_v1(inst, cred_hash, 'reverse', base || jsonb_build_object('operation_id', op3, 'original_operation_id', op1, 'amount_credits', 400, 'reason', 'synthetic'));
  IF r2->>'state' <> 'reversed' THEN RAISE EXCEPTION 'FAIL reverse %', r2; END IF;
  SELECT remaining, status::text INTO rem, st FROM public.promo_grants WHERE id = g1; IF rem <> 300 OR st <> 'expired' THEN RAISE EXCEPTION 'FAIL g1 restore %/%', rem, st; END IF;
  SELECT remaining INTO rem FROM public.promo_grants WHERE id = g2; IF rem <> 800 THEN RAISE EXCEPTION 'FAIL g2 restore %', rem; END IF;
  SELECT remaining INTO rem FROM public.promo_grants WHERE id = g_exp; IF rem <> 500 THEN RAISE EXCEPTION 'FAIL g_exp touched'; END IF;
  BEGIN PERFORM public.hapa_pos_adapter_v1(inst, cred_hash, 'reverse', base || jsonb_build_object('operation_id', op4, 'original_operation_id', op1, 'amount_credits', 400, 'reason', 'again'));
        RAISE EXCEPTION 'FAIL double reversal';
  EXCEPTION WHEN invalid_parameter_value THEN IF SQLERRM <> 'original_debit_not_reversible' THEN RAISE; END IF; END;
  r := public.hapa_pos_adapter_v1(inst, cred_hash, 'status', jsonb_build_object('casino_id', c, 'operation_id', op1));
  IF r->>'state' <> 'reversed' THEN RAISE EXCEPTION 'FAIL original status'; END IF;
  n := n+1;

  -- T13 restored-but-expired credits are not spendable
  r2 := public.hapa_pos_adapter_v1(inst, cred_hash, 'debit', base || jsonb_build_object('operation_id', op4, 'pos_settlement_id', op4, 'visit_id', vis, 'amount_credits', 801, 'money', 0, 'free', 0, 'retail_tzs', 801));
  IF r2->>'reason_code' <> 'insufficient_spendable_credits' THEN RAISE EXCEPTION 'FAIL expiry %', r2; END IF;
  n := n+1;

  -- T14 checkout blocks debit and eligibility
  UPDATE public.casino_visits SET checked_out_at = now() WHERE id = vis;
  r2 := public.hapa_pos_adapter_v1(inst, cred_hash, 'debit', base || jsonb_build_object('operation_id', op5, 'pos_settlement_id', op5, 'visit_id', vis, 'amount_credits', 10, 'money', 0, 'free', 0, 'retail_tzs', 10));
  IF r2->>'reason_code' <> 'player_ineligible' OR (r2->>'debit_applied')::boolean THEN RAISE EXCEPTION 'FAIL checkout %', r2; END IF;
  r2 := public.hapa_pos_adapter_v1(inst, cred_hash, 'eligibility', jsonb_build_object('casino_id', c, 'external_player_id', pl));
  IF (r2->>'active')::boolean THEN RAISE EXCEPTION 'FAIL eligibility after checkout'; END IF;
  SELECT remaining INTO rem FROM public.promo_grants WHERE id = g2; IF rem <> 800 THEN RAISE EXCEPTION 'FAIL checkout balance'; END IF;
  n := n+1;

  -- T15 existing wallet entrypoints unchanged
  IF md5(replace(pg_get_functiondef('public.redeem_promo_fifo(uuid,uuid,bigint,uuid,uuid,uuid,text)'::regprocedure),chr(13),'')) <> 'e86c6357f5dc9ac27e67f02ddbddd4b0'
     OR md5(replace(pg_get_functiondef('public.cashier_redeem_promo_by_account(uuid,uuid,uuid,uuid,bigint)'::regprocedure),chr(13),'')) <> 'd474f3c067bae127f25af70a602da316'
     OR md5(replace(pg_get_functiondef('public.pos_close_tab_v2(text,uuid,bigint,bigint,bigint,text,text)'::regprocedure),chr(13),'')) <> '212f87f804d885278058c6a6157f025c' THEN
    RAISE EXCEPTION 'FAIL baseline drift';
  END IF;
  n := n+1;

  RAISE EXCEPTION 'HAPA_TESTS_PASSED n=%', n;
END;
$t$;
