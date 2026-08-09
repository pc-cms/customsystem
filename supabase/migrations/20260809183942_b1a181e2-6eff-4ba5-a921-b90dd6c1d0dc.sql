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
  v_tables_result numeric := 0;
  v_slots_shift uuid;
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

  -- Table Result is always derived from the closed cage shifts of the day.
  SELECT COALESCE(SUM(COALESCE(s.tables_result,0)),0)
    INTO v_tables_result
    FROM public.shifts s
   WHERE s.casino_id = _casino_id
     AND public.business_date_of(s.opened_at) = v_today;

  -- Slots figures land on the day's closed slots shift (Close Day wins over manual entry).
  SELECT cs.id INTO v_slots_shift
    FROM public.cage_slots_shifts cs
   WHERE cs.casino_id = _casino_id
     AND cs.business_date = v_today
     AND cs.status::text IN ('closed','approved','reversed')
   ORDER BY cs.updated_at DESC NULLS LAST, cs.created_at DESC
   LIMIT 1;

  IF v_slots_shift IS NOT NULL THEN
    UPDATE public.cage_slots_shifts
       SET manual_drop_slots   = _drop_slots,
           manual_slots_result = _net_win,
           cash_desk_result    = _cashdesk_win,
           manual_slots_deposits = _client_balance,
           updated_at = now()
     WHERE id = v_slots_shift;
  END IF;

  INSERT INTO public.fin_day_closing AS d (
    casino_id, business_date, drop_slots, net_win, cashdesk_win,
    tables_result, players_card_balance, notes, closed_by
  ) VALUES (
    _casino_id, v_today, _drop_slots, _net_win, _cashdesk_win,
    v_tables_result, _client_balance, _notes, v_user
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
  RETURN v_res || jsonb_build_object(
    'figures_saved', true,
    'tables_result', v_tables_result,
    'slots_shift_updated', v_slots_shift
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.close_business_day_with_figures(uuid,numeric,numeric,numeric,numeric,text) TO authenticated;