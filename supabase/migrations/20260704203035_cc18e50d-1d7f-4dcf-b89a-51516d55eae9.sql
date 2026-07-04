CREATE OR REPLACE FUNCTION public.manager_edit_blacklist_reason(_player_id uuid, _reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_casino uuid;
  v_player_name text;
  v_note_id uuid;
  v_new_content text;
  v_version int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT (
    public.has_role(v_uid, 'manager'::app_role) OR
    public.has_role(v_uid, 'shift_manager'::app_role) OR
    public.has_role(v_uid, 'super_admin'::app_role)
  ) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF _reason IS NULL OR length(btrim(_reason)) = 0 THEN
    RAISE EXCEPTION 'reason_required';
  END IF;

  SELECT casino_id, (first_name || ' ' || last_name)
    INTO v_casino, v_player_name
  FROM public.players WHERE id = _player_id;
  IF v_casino IS NULL THEN RAISE EXCEPTION 'player_not_found'; END IF;

  SELECT id INTO v_note_id
  FROM public.player_notes
  WHERE player_id = _player_id AND note_type = 'blacklist'
  ORDER BY created_at DESC
  LIMIT 1;

  v_new_content := 'Added to blacklist by manager. Reason: ' || btrim(_reason);

  IF v_note_id IS NULL THEN
    v_version := 1;
    INSERT INTO public.player_notes (player_id, casino_id, content, note_type, created_by)
    VALUES (_player_id, v_casino, v_new_content, 'blacklist', v_uid)
    RETURNING id INTO v_note_id;
  ELSE
    SELECT COALESCE(
      (regexp_match(content, '\(v(\d+)\)\s*$'))[1]::int,
      1
    ) INTO v_version
    FROM public.player_notes WHERE id = v_note_id;
    v_version := v_version + 1;
    UPDATE public.player_notes
       SET content = v_new_content || ' (v' || v_version || ')'
     WHERE id = v_note_id;
    v_new_content := v_new_content || ' (v' || v_version || ')';
  END IF;

  INSERT INTO public.activity_logs (casino_id, action, category, details, operator_id)
  VALUES (
    v_casino,
    'PLAYER_BLACKLIST_REASON_EDITED',
    'player',
    jsonb_build_object(
      'player_id', _player_id,
      'player_name', v_player_name,
      'reason', btrim(_reason),
      'version', v_version
    ),
    v_uid
  );

  RETURN jsonb_build_object('ok', true, 'version', v_version, 'note_id', v_note_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.manager_edit_blacklist_reason(uuid, text) TO authenticated;