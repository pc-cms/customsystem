-- Hapa POS adapter v1 (server-to-server). Reviewable copy of the applied migration.
-- Scope: new private schema + adapter RPC + private FIFO kernel + shared daily-cap trigger.
-- Existing entrypoints (redeem_promo_fifo, cashier_redeem_promo_by_account, pos_close_tab_v2)
-- are NOT modified: their bodies and grants stay exactly as in the inspected baseline.
-- No installations, tokens, grants or redemptions are created here.

-- 1. Refuse to apply when wallet functions differ from the inspected baseline.
DO $baseline$
BEGIN
  IF md5(replace(pg_get_functiondef('public.redeem_promo_fifo(uuid,uuid,bigint,uuid,uuid,uuid,text)'::regprocedure),chr(13),'')) IS DISTINCT FROM 'e86c6357f5dc9ac27e67f02ddbddd4b0'
    OR md5(replace(pg_get_functiondef('public.cashier_redeem_promo_by_account(uuid,uuid,uuid,uuid,bigint)'::regprocedure),chr(13),'')) IS DISTINCT FROM 'd474f3c067bae127f25af70a602da316' THEN
    RAISE EXCEPTION 'hapa_adapter_baseline_changed: inspect current CMS functions before applying';
  END IF;
END;
$baseline$;

-- 2. Private schema: never exposed to API roles.
CREATE SCHEMA IF NOT EXISTS hapa_pos_private;
REVOKE ALL ON SCHEMA hapa_pos_private FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS hapa_pos_private.installations (
  id uuid PRIMARY KEY,
  casino_id uuid NOT NULL REFERENCES public.casinos(id),
  actor_id uuid NOT NULL REFERENCES auth.users(id),
  credential_hash text NOT NULL CHECK (credential_hash ~ '^[0-9a-f]{64}$'),
  active boolean NOT NULL DEFAULT false,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS hapa_pos_private.operations (
  id uuid PRIMARY KEY,
  installation_id uuid NOT NULL REFERENCES hapa_pos_private.installations(id),
  action text NOT NULL CHECK (action IN ('debit','reverse')),
  request_fingerprint text NOT NULL,
  payload jsonb NOT NULL,
  receipt jsonb NOT NULL,
  redemption_id uuid REFERENCES public.promo_redemptions(id),
  reverses_id uuid UNIQUE REFERENCES hapa_pos_private.operations(id),
  reversed_by uuid UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE hapa_pos_private.installations ENABLE ROW LEVEL SECURITY;
ALTER TABLE hapa_pos_private.operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA hapa_pos_private FROM PUBLIC, anon, authenticated, service_role;

-- 3. Shared daily cap for every promo redemption writer (Cage, POS terminal, adapter).
--    Business day comes from the redemption ledger rows; no existing rows are changed.
CREATE INDEX IF NOT EXISTS hapa_pr_casino_created ON public.promo_redemptions(casino_id, created_at);
CREATE INDEX IF NOT EXISTS hapa_pwl_ref ON public.promo_wallet_ledger(ref_id);

CREATE OR REPLACE FUNCTION hapa_pos_private.redemption_cap_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $cap$
DECLARE v_today date; v_cap bigint; v_spent bigint;
BEGIN
  IF NEW.amount IS NULL OR NEW.amount <= 0 THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(194701, hashtext(NEW.casino_id::text));
  v_today := public.get_current_business_date(NEW.casino_id);
  SELECT daily_cap_credits INTO v_cap FROM public.club_daily_spend_limits
   WHERE casino_id = NEW.casino_id AND effective_from <= v_today
   ORDER BY effective_from DESC, set_at DESC, id DESC LIMIT 1;
  IF v_cap IS NULL THEN RETURN NEW; END IF;
  SELECT coalesce(sum(r.amount),0) INTO v_spent FROM public.promo_redemptions r
   WHERE r.casino_id = NEW.casino_id AND r.created_at > now() - interval '5 days'
     AND EXISTS (SELECT 1 FROM public.promo_wallet_ledger l
                  WHERE l.ref_id = r.id AND l.ref_type = 'promo_redemption' AND l.business_date = v_today);
  IF v_spent + NEW.amount > v_cap THEN
    RAISE EXCEPTION 'Daily promo spend cap exceeded (%/%)', v_spent + NEW.amount, v_cap;
  END IF;
  RETURN NEW;
END;
$cap$;
REVOKE ALL ON FUNCTION hapa_pos_private.redemption_cap_guard() FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS hapa_promo_redemption_cap_guard ON public.promo_redemptions;
CREATE TRIGGER hapa_promo_redemption_cap_guard BEFORE INSERT ON public.promo_redemptions
  FOR EACH ROW EXECUTE FUNCTION hapa_pos_private.redemption_cap_guard();

-- 4. Private FIFO kernel used only by the adapter (authorization lives in the adapter).
CREATE OR REPLACE FUNCTION hapa_pos_private.redeem_fifo(p_player uuid, p_casino uuid, p_amount bigint, p_actor uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $k$
DECLARE v_today date; v_remaining bigint := p_amount; v_grant record; v_take bigint;
        v_breakdown jsonb := '[]'::jsonb; v_red uuid;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Amount must be positive'; END IF;
  PERFORM pg_advisory_xact_lock(194701, hashtext(p_casino::text));
  v_today := public.get_current_business_date(p_casino);
  INSERT INTO public.promo_redemptions(player_id, casino_id, cage_id, cashier_id, shift_id, amount, grant_breakdown, payout_type)
  VALUES (p_player, p_casino, NULL, p_actor, NULL, p_amount, '[]'::jsonb, 'bar') RETURNING id INTO v_red;
  FOR v_grant IN
    SELECT id, remaining, expires_business_date FROM public.promo_grants
     WHERE player_id = p_player AND status = 'active' AND remaining > 0
       AND (expires_business_date IS NULL OR expires_business_date >= v_today)
     ORDER BY (expires_business_date IS NULL), expires_business_date, created_at, id
     FOR UPDATE
  LOOP
    EXIT WHEN v_remaining <= 0;
    v_take := LEAST(v_grant.remaining, v_remaining);
    UPDATE public.promo_grants SET remaining = remaining - v_take,
           status = CASE WHEN remaining - v_take = 0 THEN 'exhausted'::public.promo_grant_status ELSE status END,
           updated_at = now() WHERE id = v_grant.id;
    INSERT INTO public.promo_wallet_ledger(grant_id, player_id, delta, reason, ref_type, ref_id, business_date, created_by)
    VALUES (v_grant.id, p_player, -v_take, 'redeem', 'promo_redemption', v_red, v_today, p_actor);
    v_breakdown := v_breakdown || jsonb_build_array(jsonb_build_object('grant_id', v_grant.id, 'amount', v_take, 'expires', v_grant.expires_business_date));
    v_remaining := v_remaining - v_take;
  END LOOP;
  IF v_remaining > 0 THEN RAISE EXCEPTION 'Insufficient promo balance (short by %)', v_remaining; END IF;
  UPDATE public.promo_redemptions SET grant_breakdown = v_breakdown WHERE id = v_red;
  RETURN jsonb_build_object('redemption_id', v_red, 'amount', p_amount, 'breakdown', v_breakdown);
END;
$k$;
REVOKE ALL ON FUNCTION hapa_pos_private.redeem_fifo(uuid,uuid,bigint,uuid) FROM PUBLIC, anon, authenticated, service_role;

-- 5. Adapter entrypoint: service_role only (called by the hapa-pos-adapter Edge Function).
CREATE OR REPLACE FUNCTION public.hapa_pos_adapter_v1(p_installation uuid, p_credential_hash text, p_action text, p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  inst hapa_pos_private.installations%ROWTYPE;
  previous hapa_pos_private.operations%ROWTYPE;
  original hapa_pos_private.operations%ROWTYPE;
  v_op uuid; v_casino uuid; v_player uuid; v_visit uuid;
  v_amount bigint; v_money bigint; v_free bigint; v_retail bigint;
  v_fp text; v_hash text; v_result jsonb; v_receipt jsonb;
  v_grant record; v_b record; v_day date; v_red uuid; v_restored bigint := 0; v_orig uuid;
BEGIN
  SELECT * INTO inst FROM hapa_pos_private.installations WHERE id = p_installation FOR UPDATE;
  IF inst.id IS NULL OR NOT inst.active OR inst.expires_at <= now()
     OR p_credential_hash IS NULL OR p_credential_hash <> inst.credential_hash
     OR NOT public.user_has_casino_access(inst.actor_id, inst.casino_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'installation_unauthorized';
  END IF;
  IF p_action IS NULL OR p_action NOT IN ('players','eligibility','debit','status','reverse')
     OR p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_action_or_payload';
  END IF;
  v_casino := (p_payload->>'casino_id')::uuid;
  IF v_casino IS DISTINCT FROM inst.casino_id THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'installation_scope_mismatch';
  END IF;

  IF p_action = 'players' THEN
    IF length(coalesce(p_payload->>'query','')) > 80 THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'query_too_long'; END IF;
    SELECT coalesce(jsonb_agg(to_jsonb(m)), '[]'::jsonb) INTO v_result FROM (
      SELECT p.id AS player_id, left(concat_ws(' ', p.first_name, p.last_name), 120) AS name
        FROM public.players p
       WHERE p.status = 'active'::public.player_status AND p.merged_into_id IS NULL
         AND EXISTS (SELECT 1 FROM public.casino_visits v WHERE v.player_id = p.id AND v.casino_id = v_casino AND v.checked_out_at IS NULL)
         AND (coalesce(p_payload->>'query','') = '' OR position(lower(p_payload->>'query') IN lower(concat_ws(' ', p.first_name, p.last_name))) > 0)
       ORDER BY p.first_name, p.last_name, p.id LIMIT 50) m;
    RETURN jsonb_build_object('players', v_result);
  END IF;

  IF p_action = 'status' THEN
    v_op := (p_payload->>'operation_id')::uuid;
    SELECT * INTO previous FROM hapa_pos_private.operations WHERE id = v_op AND installation_id = p_installation;
    IF previous.id IS NULL THEN RETURN jsonb_build_object('state', 'not_found'); END IF;
    RETURN previous.receipt;
  END IF;

  v_player := (p_payload->>'external_player_id')::uuid;
  IF p_action = 'eligibility' THEN
    SELECT v.id INTO v_visit FROM public.casino_visits v JOIN public.players p ON p.id = v.player_id
     WHERE v.casino_id = v_casino AND v.player_id = v_player AND v.checked_out_at IS NULL
       AND p.status = 'active'::public.player_status AND p.merged_into_id IS NULL
     ORDER BY v.checked_in_at DESC, v.id LIMIT 1;
    SELECT jsonb_build_object('active', v_visit IS NOT NULL, 'casino_id', v_casino, 'player_id', v_player, 'visit_id', v_visit,
                              'name', left(concat_ws(' ', first_name, last_name), 120))
      INTO v_result FROM public.players WHERE id = v_player AND v_visit IS NOT NULL;
    RETURN coalesce(v_result, jsonb_build_object('active', false, 'casino_id', v_casino, 'player_id', v_player));
  END IF;

  -- debit / reverse
  v_op := (p_payload->>'operation_id')::uuid;
  v_hash := p_payload->>'payload_hash';
  IF v_op IS NULL OR v_player IS NULL OR p_payload->>'currency' IS DISTINCT FROM 'TZS'
     OR v_hash IS NULL OR v_hash !~ '^[0-9a-f]{64}$'
     OR (p_payload->>'amount_credits') IS NULL OR (p_payload->>'amount_credits') !~ '^[0-9]{1,10}$' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_operation';
  END IF;
  v_amount := (p_payload->>'amount_credits')::bigint;
  IF v_amount <= 0 OR v_amount > 1000000000 THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'amount_out_of_range'; END IF;
  v_fp := encode(sha256(convert_to(p_action || ':' || p_payload::text, 'UTF8')), 'hex');

  PERFORM pg_advisory_xact_lock(194701, hashtext(v_casino::text));
  SELECT * INTO previous FROM hapa_pos_private.operations WHERE id = v_op FOR UPDATE;
  IF previous.id IS NOT NULL THEN
    IF previous.installation_id <> p_installation OR previous.action <> p_action OR previous.request_fingerprint <> v_fp THEN
      RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'operation_payload_conflict';
    END IF;
    RETURN previous.receipt;
  END IF;

  v_receipt := jsonb_build_object('operation_id', v_op, 'casino_id', v_casino, 'external_player_id', v_player,
                                  'currency', 'TZS', 'amount_credits', v_amount, 'payload_hash', v_hash);
  v_day := public.get_current_business_date(v_casino);

  IF p_action = 'debit' THEN
    IF p_payload->>'pos_settlement_id' IS DISTINCT FROM v_op::text
       OR coalesce(p_payload->>'money','') !~ '^[0-9]{1,10}$'
       OR coalesce(p_payload->>'free','') !~ '^[0-9]{1,10}$'
       OR coalesce(p_payload->>'retail_tzs','') !~ '^[0-9]{1,10}$'
       OR (p_payload->>'visit_id') IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_tenders';
    END IF;
    v_money := (p_payload->>'money')::bigint; v_free := (p_payload->>'free')::bigint; v_retail := (p_payload->>'retail_tzs')::bigint;
    IF v_money > 1000000000 OR v_free > 1000000000 OR v_retail > 1000000000 OR v_retail <> v_money + v_amount + v_free THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'tender_identity_mismatch';
    END IF;
    -- Lock the active visit row: a concurrent checkout waits until this debit commits.
    SELECT v.id INTO v_visit FROM public.casino_visits v JOIN public.players p ON p.id = v.player_id
     WHERE v.id = (p_payload->>'visit_id')::uuid AND v.casino_id = v_casino AND v.player_id = v_player
       AND v.checked_out_at IS NULL AND p.status = 'active'::public.player_status AND p.merged_into_id IS NULL
     FOR UPDATE OF v;
    IF v_visit IS NULL THEN
      v_receipt := v_receipt || jsonb_build_object('state','denied','debit_applied',false,'reason_code','player_ineligible');
    ELSE
      BEGIN
        v_result := hapa_pos_private.redeem_fifo(v_player, v_casino, v_amount, inst.actor_id);
        v_red := (v_result->>'redemption_id')::uuid;
        v_receipt := v_receipt || jsonb_build_object('state','succeeded','receipt_id',v_red,'debit_applied',true);
      EXCEPTION WHEN SQLSTATE 'P0001' THEN
        IF SQLERRM NOT LIKE 'Insufficient promo balance%' AND SQLERRM NOT LIKE 'Daily promo spend cap exceeded%' THEN RAISE; END IF;
        v_receipt := v_receipt || jsonb_build_object('state','denied','debit_applied',false,'reason_code',
                       CASE WHEN SQLERRM LIKE 'Insufficient%' THEN 'insufficient_spendable_credits' ELSE 'daily_cap' END);
      END;
    END IF;
    INSERT INTO hapa_pos_private.operations(id, installation_id, action, request_fingerprint, payload, receipt, redemption_id)
    VALUES (v_op, p_installation, p_action, v_fp, p_payload, v_receipt, v_red);
    RETURN v_receipt;
  END IF;

  -- reverse: restore exactly the grants recorded on the original redemption
  v_orig := (p_payload->>'original_operation_id')::uuid;
  IF v_orig IS NULL OR v_orig = v_op OR length(coalesce(p_payload->>'reason','')) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_reversal';
  END IF;
  SELECT * INTO original FROM hapa_pos_private.operations WHERE id = v_orig AND installation_id = p_installation FOR UPDATE;
  IF original.id IS NULL OR original.action <> 'debit' OR original.receipt->>'state' <> 'succeeded' OR original.reversed_by IS NOT NULL
     OR original.redemption_id IS NULL
     OR original.payload->>'external_player_id' IS DISTINCT FROM v_player::text
     OR original.payload->>'casino_id' IS DISTINCT FROM v_casino::text
     OR (original.payload->>'amount_credits')::bigint <> v_amount THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'original_debit_not_reversible';
  END IF;
  FOR v_b IN SELECT (e->>'grant_id')::uuid AS grant_id, (e->>'amount')::bigint AS amount
               FROM public.promo_redemptions r, LATERAL jsonb_array_elements(r.grant_breakdown) e
              WHERE r.id = original.redemption_id ORDER BY (e->>'grant_id')::uuid LOOP
    SELECT * INTO v_grant FROM public.promo_grants WHERE id = v_b.grant_id AND player_id = v_player FOR UPDATE;
    IF v_grant.id IS NULL OR v_b.amount <= 0 OR v_grant.remaining + v_b.amount > v_grant.amount THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'original_grant_requires_review';
    END IF;
    UPDATE public.promo_grants SET remaining = remaining + v_b.amount,
           status = CASE WHEN status = 'reversed'::public.promo_grant_status THEN status
                         WHEN expires_business_date IS NOT NULL AND expires_business_date < v_day THEN 'expired'::public.promo_grant_status
                         ELSE 'active'::public.promo_grant_status END,
           updated_at = now() WHERE id = v_grant.id;
    INSERT INTO public.promo_wallet_ledger(grant_id, player_id, delta, reason, ref_type, ref_id, business_date, created_by)
    VALUES (v_grant.id, v_player, v_b.amount, 'hapa_pos_reverse', 'hapa_pos_reversal', v_op, v_day, inst.actor_id);
    v_restored := v_restored + v_b.amount;
  END LOOP;
  IF v_restored <> v_amount THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'original_breakdown_mismatch'; END IF;
  v_receipt := v_receipt || jsonb_build_object('state','reversed','receipt_id',v_op,'original_operation_id',v_orig,'original_receipt_id',original.redemption_id);
  INSERT INTO hapa_pos_private.operations(id, installation_id, action, request_fingerprint, payload, receipt, redemption_id, reverses_id)
  VALUES (v_op, p_installation, p_action, v_fp, p_payload, v_receipt, original.redemption_id, v_orig);
  UPDATE hapa_pos_private.operations o SET reversed_by = v_op,
         receipt = o.receipt || jsonb_build_object('state','reversed','reversal_operation_id',v_op)
   WHERE id = v_orig;
  RETURN v_receipt;
END;
$$;
REVOKE ALL ON FUNCTION public.hapa_pos_adapter_v1(uuid,text,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hapa_pos_adapter_v1(uuid,text,text,jsonb) TO service_role;
