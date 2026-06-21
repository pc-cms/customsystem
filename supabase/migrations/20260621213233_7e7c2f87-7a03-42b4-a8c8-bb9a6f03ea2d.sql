
CREATE OR REPLACE FUNCTION public.pos_player_status(_player_id uuid, _casino_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_open_count int := 0;
  v_budget     jsonb;
  v_is_over    boolean;
  v_pct        numeric;
BEGIN
  IF _player_id IS NULL OR _casino_id IS NULL THEN
    RETURN 'allowed';
  END IF;

  SELECT COUNT(*) INTO v_open_count
    FROM public.pos_player_charges
   WHERE player_id = _player_id
     AND casino_id = _casino_id
     AND status = 'open';

  BEGIN
    v_budget := public.pos_comp_budget_status(_casino_id, NULL::date);
  EXCEPTION WHEN OTHERS THEN
    v_budget := '{}'::jsonb;
  END;

  v_is_over := NULLIF(v_budget->>'is_over','')::boolean;
  v_pct     := NULLIF(v_budget->>'percent_used','')::numeric;

  IF v_is_over IS TRUE                  THEN RETURN 'approval'; END IF;
  IF v_open_count >= 3                  THEN RETURN 'warning';  END IF;
  IF v_pct IS NOT NULL AND v_pct >= 80  THEN RETURN 'warning';  END IF;
  IF v_open_count > 0                   THEN RETURN 'warning';  END IF;

  RETURN 'allowed';
END $function$;

GRANT EXECUTE ON FUNCTION public.pos_player_status(uuid, uuid) TO authenticated;
