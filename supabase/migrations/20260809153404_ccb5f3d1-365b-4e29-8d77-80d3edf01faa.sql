ALTER TABLE public.fin_day_closing
  ADD COLUMN IF NOT EXISTS drop_slots numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_win numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cashdesk_win numeric NOT NULL DEFAULT 0;

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

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',cs.id,'player_id',cs.player_id,'table_id',cs.table_id,'started_at',cs.started_at)),'[]'::jsonb)
    INTO v_active_sessions
    FROM public.client_sessions cs WHERE cs.casino_id = _casino_id AND cs.stopped_at IS NULL;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',cv.id,'player_id',cv.player_id,'checked_in_at',cv.checked_in_at)),'[]'::jsonb)
    INTO v_open_visits
    FROM public.casino_visits cv WHERE cv.casino_id = _casino_id AND cv.checked_out_at IS NULL;

  RETURN jsonb_build_object(
    'open_cage_shifts',  v_open_shifts,
    'open_slots_shifts', v_open_slots,
    'open_tables',       v_open_tables,
    'active_sessions',   v_active_sessions,
    'open_visits',       v_open_visits
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.close_business_day_with_figures(
  _casino_id uuid,
  _drop_slots numeric,
  _net_win numeric,
  _cashdesk_win numeric,
  _client_balance numeric,
  _notes text DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_today date;
  v_open jsonb;
  v_res jsonb;
BEGIN
  IF NOT (public.is_manager_op(v_user) OR public.has_role(v_user,'pit'::app_role)) THEN
    RAISE EXCEPTION 'Insufficient privileges to close business day';
  END IF;

  IF _drop_slots IS NULL OR _net_win IS NULL OR _cashdesk_win IS NULL OR _client_balance IS NULL THEN
    RETURN jsonb_build_object('status','figures_required');
  END IF;

  v_today := public.get_current_business_date(_casino_id);

  IF EXISTS (SELECT 1 FROM public.business_day_closures
             WHERE casino_id = _casino_id AND business_date = v_today) THEN
    RETURN jsonb_build_object('status','already_closed','business_date',v_today);
  END IF;

  v_open := public.list_open_cycles_for_day(_casino_id);
  IF jsonb_array_length(COALESCE(v_open->'open_cage_shifts','[]'::jsonb)) > 0
     OR jsonb_array_length(COALESCE(v_open->'open_slots_shifts','[]'::jsonb)) > 0
     OR jsonb_array_length(COALESCE(v_open->'open_tables','[]'::jsonb)) > 0
     OR jsonb_array_length(COALESCE(v_open->'active_sessions','[]'::jsonb)) > 0
     OR jsonb_array_length(COALESCE(v_open->'open_visits','[]'::jsonb)) > 0 THEN
    RETURN jsonb_build_object('status','has_open_cycles','business_date',v_today,'open',v_open);
  END IF;

  INSERT INTO public.fin_day_closing AS d (
    casino_id, business_date, drop_slots, net_win, cashdesk_win,
    tables_result, players_card_balance, notes, closed_by
  ) VALUES (
    _casino_id, v_today, _drop_slots, _net_win, _cashdesk_win,
    _net_win, _client_balance, _notes, v_user
  )
  ON CONFLICT (casino_id, business_date) DO UPDATE SET
    drop_slots = EXCLUDED.drop_slots,
    net_win = EXCLUDED.net_win,
    cashdesk_win = EXCLUDED.cashdesk_win,
    tables_result = EXCLUDED.tables_result,
    players_card_balance = EXCLUDED.players_card_balance,
    notes = COALESCE(EXCLUDED.notes, d.notes),
    closed_by = EXCLUDED.closed_by,
    updated_at = now();

  v_res := public.close_business_day(_casino_id, 'manual', false);
  RETURN v_res || jsonb_build_object('figures_saved', true);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.close_business_day_with_figures(uuid,numeric,numeric,numeric,numeric,text) TO authenticated;