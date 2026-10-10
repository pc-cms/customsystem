CREATE OR REPLACE FUNCTION public.manager_set_player_blacklist(_player_id uuid, _manager_id uuid, _status text, _reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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
    public.has_role(_manager_id, 'pit'::app_role) OR
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