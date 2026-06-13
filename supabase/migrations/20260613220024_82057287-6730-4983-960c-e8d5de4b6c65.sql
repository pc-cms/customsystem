
CREATE OR REPLACE FUNCTION public.cs_can_approve(_casino uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT (_casino = public.get_user_casino_id(auth.uid()))
     AND (
       public.has_role(auth.uid(),'manager'::public.app_role)
       OR public.has_role(auth.uid(),'shift_manager'::public.app_role)
     )
  OR public.has_role(auth.uid(),'super_admin'::public.app_role)
$function$;

CREATE OR REPLACE FUNCTION public.cs_can_write(_casino uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT (_casino = public.get_user_casino_id(auth.uid()))
     AND (
       public.has_role(auth.uid(),'cashier_slots'::public.app_role)
       OR public.has_role(auth.uid(),'manager'::public.app_role)
       OR public.has_role(auth.uid(),'shift_manager'::public.app_role)
     )
  OR public.has_role(auth.uid(),'super_admin'::public.app_role)
$function$;

CREATE OR REPLACE FUNCTION public.cs_can_view(_casino uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT (_casino = public.get_user_casino_id(auth.uid()))
     AND (
       public.has_role(auth.uid(),'cashier_slots'::public.app_role)
       OR public.has_role(auth.uid(),'manager'::public.app_role)
       OR public.has_role(auth.uid(),'shift_manager'::public.app_role)
       OR public.has_role(auth.uid(),'finance_manager'::public.app_role)
       OR public.has_role(auth.uid(),'surveillance'::public.app_role)
       OR public.has_role(auth.uid(),'pit'::public.app_role)
     )
  OR public.has_role(auth.uid(),'super_admin'::public.app_role)
$function$;

CREATE OR REPLACE FUNCTION public.is_manager_op(_uid uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _uid
      AND role IN ('manager','shift_manager','super_admin')
  );
$function$;

CREATE OR REPLACE FUNCTION public.reception_verify_player(p_player_id uuid, p_first text, p_last text, p_dob date, p_id_number text, p_photo_url text DEFAULT NULL::text, p_id_doc_url text DEFAULT NULL::text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_player record;
  v_dup uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT (
    public.has_role(v_uid,'reception') OR
    public.has_role(v_uid,'manager') OR
    public.has_role(v_uid,'super_admin') OR
    public.has_role(v_uid,'shift_manager') OR
    public.has_role(v_uid,'account_manager')
  ) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF p_first IS NULL OR length(trim(p_first)) = 0 THEN RAISE EXCEPTION 'first_name_required'; END IF;
  IF p_last  IS NULL OR length(trim(p_last))  = 0 THEN RAISE EXCEPTION 'last_name_required'; END IF;
  IF p_dob   IS NULL THEN RAISE EXCEPTION 'dob_required'; END IF;
  IF p_id_number IS NULL OR length(trim(p_id_number)) = 0 THEN RAISE EXCEPTION 'id_number_required'; END IF;
  IF p_dob > (current_date - interval '18 years')::date THEN
    RAISE EXCEPTION 'must_be_18_plus';
  END IF;

  SELECT * INTO v_player FROM public.players WHERE id = p_player_id FOR UPDATE;
  IF v_player IS NULL THEN RAISE EXCEPTION 'player_not_found'; END IF;

  SELECT id INTO v_dup
    FROM public.players
   WHERE casino_id = v_player.casino_id
     AND id <> v_player.id
     AND id_number IS NOT NULL
     AND lower(trim(id_number)) = lower(trim(p_id_number))
   LIMIT 1;
  IF v_dup IS NOT NULL THEN RAISE EXCEPTION 'duplicate_id_number'; END IF;

  UPDATE public.players
     SET first_name = p_first, last_name = p_last, birth_date = p_dob,
         id_number = p_id_number,
         photo_url = COALESCE(p_photo_url, photo_url),
         id_document_url = COALESCE(p_id_doc_url, id_document_url),
         verification_status = 'verified', verified_source = 'reception',
         verified_by = v_uid, verified_at = now(), updated_at = now()
   WHERE id = p_player_id;

  INSERT INTO public.kyc_reviews(player_id, casino_id, source, status, am_user_id, am_decision_at, ai_result)
  VALUES (p_player_id, v_player.casino_id, 'reception', 'approved', v_uid, now(),
          jsonb_build_object('verified_by_reception', true));

  RETURN jsonb_build_object('ok', true, 'player_id', p_player_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_player_category(_player_id uuid, _category text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF _category NOT IN ('normal','gold','platinum','diamond') THEN
    RAISE EXCEPTION 'Invalid category: %', _category;
  END IF;
  IF NOT (
    public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'manager')
    OR public.has_role(auth.uid(), 'shift_manager')
    OR public.has_role(auth.uid(), 'finance_manager')
  ) THEN
    RAISE EXCEPTION 'Not authorized to change player category';
  END IF;
  UPDATE public.players SET category = _category::player_category WHERE id = _player_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.cancel_transaction(p_transaction_id uuid, p_reason text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_tx public.transactions;
  v_shift_closed timestamptz;
  v_uid uuid := auth.uid();
  v_allowed boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'Reason is required (min 3 chars)' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_tx FROM public.transactions WHERE id = p_transaction_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaction not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_tx.cancelled_at IS NOT NULL THEN
    RAISE EXCEPTION 'Transaction already cancelled' USING ERRCODE = '22023';
  END IF;

  v_allowed := public.has_role(v_uid, 'cashier'::app_role)
            OR public.has_role(v_uid, 'manager'::app_role)
            OR public.has_role(v_uid, 'shift_manager'::app_role)
            OR public.has_role(v_uid, 'super_admin'::app_role);
  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Your role cannot cancel transactions (cashier / manager / shift_manager / super_admin required)'
      USING ERRCODE = '42501';
  END IF;

  IF v_tx.shift_id IS NOT NULL THEN
    SELECT closed_at INTO v_shift_closed FROM public.shifts WHERE id = v_tx.shift_id;
    IF v_shift_closed IS NOT NULL
       AND NOT (public.has_role(v_uid, 'manager'::app_role)
                OR public.has_role(v_uid, 'super_admin'::app_role)) THEN
      RAISE EXCEPTION 'Cannot cancel: shift already closed (manager override required)'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  UPDATE public.transactions
    SET cancelled_at = now(), cancelled_by = v_uid, cancel_reason = btrim(p_reason)
    WHERE id = p_transaction_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.manager_set_player_blacklist(_player_id uuid, _manager_id uuid, _status text, _reason text DEFAULT NULL::text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_casino uuid;
  v_player_name text;
BEGIN
  IF _status NOT IN ('active','blacklist') THEN
    RAISE EXCEPTION 'Invalid status: %', _status;
  END IF;
  IF NOT (
    public.has_role(_manager_id, 'manager'::app_role) OR
    public.has_role(_manager_id, 'shift_manager'::app_role) OR
    public.has_role(_manager_id, 'super_admin'::app_role)
  ) THEN
    RAISE EXCEPTION 'User % is not authorized to change blacklist status', _manager_id;
  END IF;

  SELECT casino_id, (first_name || ' ' || last_name)
    INTO v_casino, v_player_name
  FROM public.players WHERE id = _player_id;

  IF v_casino IS NULL THEN RAISE EXCEPTION 'Player not found'; END IF;

  UPDATE public.players SET status = _status::player_status WHERE id = _player_id;

  INSERT INTO public.player_notes (player_id, casino_id, content, note_type, created_by)
  VALUES (
    _player_id, v_casino,
    CASE WHEN _status = 'blacklist'
      THEN 'Added to blacklist by manager. Reason: ' || COALESCE(_reason, '(none)')
      ELSE 'Reactivated by manager. Reason: ' || COALESCE(_reason, '(none)') END,
    CASE WHEN _status = 'blacklist' THEN 'blacklist' ELSE 'general' END,
    _manager_id
  );

  INSERT INTO public.activity_logs (casino_id, action, category, details, operator_id)
  VALUES (
    v_casino,
    CASE WHEN _status = 'blacklist' THEN 'PLAYER_BLACKLISTED' ELSE 'PLAYER_REACTIVATED' END,
    'player',
    jsonb_build_object('player_id', _player_id, 'player_name', v_player_name,
      'reason', _reason, 'manager_id', _manager_id, 'via', 'manager_override'),
    _manager_id
  );
END;
$function$;
