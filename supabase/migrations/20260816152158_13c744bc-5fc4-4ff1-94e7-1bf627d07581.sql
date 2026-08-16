CREATE OR REPLACE FUNCTION public.list_open_cycles_for_day(_casino_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_open_shifts jsonb; v_active_sessions jsonb; v_open_visits jsonb;
  v_open_slots jsonb; v_open_tables jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',s.id,'opened_at',s.opened_at,'opened_by',s.opened_by)),'[]'::jsonb)
    INTO v_open_shifts
    FROM public.shifts s WHERE s.casino_id = _casino_id AND s.status = 'open';

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',cs.id,'status',cs.status)),'[]'::jsonb)
    INTO v_open_slots
    FROM public.cage_slots_shifts cs
    WHERE cs.casino_id = _casino_id
      AND cs.status::text IN ('draft','open','ready_for_review');

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',t.id,'name',t.name)),'[]'::jsonb)
    INTO v_open_tables
    FROM public.gaming_tables t
    WHERE t.casino_id = _casino_id
      AND COALESCE(t.is_archived,false) = false
      AND t.closing_result IS NULL;

  -- Virtual TIPS bots (category = 'casino') never check out; they must never block the day close.
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',cs.id,'player_id',cs.player_id,'table_id',cs.table_id,'started_at',cs.started_at)),'[]'::jsonb)
    INTO v_active_sessions
    FROM public.client_sessions cs
    JOIN public.players p ON p.id = cs.player_id
   WHERE cs.casino_id = _casino_id
     AND cs.stopped_at IS NULL
     AND p.category <> 'casino'::player_category;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',cv.id,'player_id',cv.player_id,'checked_in_at',cv.checked_in_at)),'[]'::jsonb)
    INTO v_open_visits
    FROM public.casino_visits cv
    JOIN public.players p ON p.id = cv.player_id
   WHERE cv.casino_id = _casino_id
     AND cv.checked_out_at IS NULL
     AND p.category <> 'casino'::player_category;

  RETURN jsonb_build_object(
    'open_cage_shifts',  v_open_shifts,
    'open_slots_shifts', v_open_slots,
    'open_tables',       v_open_tables,
    'active_sessions',   v_active_sessions,
    'open_visits',       v_open_visits
  );
END;
$function$;