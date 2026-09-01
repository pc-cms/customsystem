ALTER TABLE public.ace_history_backfill_log ADD COLUMN IF NOT EXISTS status text;

CREATE OR REPLACE FUNCTION public.ace_backfill_history_day(
  _casino_id uuid,
  _business_date date,
  _drop_slots numeric,
  _net_win numeric,
  _cashdesk_win numeric,
  _client_balance numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r public.fin_day_closing%ROWTYPE;
  filled text[] := '{}';
  created boolean := false;
  has_shift boolean := false;
  has_closing boolean := false;
  status text;
BEGIN
  IF _casino_id IS NULL OR _business_date IS NULL THEN
    RAISE EXCEPTION 'casino_id and business_date are required';
  END IF;

  -- Hard window: historical ACE backfill is only allowed for Jan..Jul 2026.
  IF _business_date < DATE '2026-01-01' OR _business_date > DATE '2026-07-31' THEN
    RAISE EXCEPTION 'business_date % is outside the allowed historical window 2026-01-01..2026-07-31', _business_date;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.cage_slots_shifts s
     WHERE s.casino_id = _casino_id
       AND s.business_date = _business_date
       AND s.status IN ('closed','approved')
  ) INTO has_shift;

  SELECT * INTO r FROM public.fin_day_closing
   WHERE casino_id = _casino_id AND business_date = _business_date
   FOR UPDATE;
  has_closing := FOUND;

  IF has_shift OR has_closing THEN
    -- Existing Statistics day: ONLY drop_slots may be filled from ACE.
    IF has_closing THEN
      IF COALESCE(r.drop_slots, 0) = 0 AND COALESCE(_drop_slots, 0) <> 0 THEN
        UPDATE public.fin_day_closing SET drop_slots = _drop_slots WHERE id = r.id;
        filled := filled || 'drop_slots';
      END IF;
    ELSE
      -- Shift exists but no day-closing row: create a row holding ONLY drop.
      IF COALESCE(_drop_slots, 0) <> 0 THEN
        INSERT INTO public.fin_day_closing (casino_id, business_date, drop_slots)
        VALUES (_casino_id, _business_date, _drop_slots);
        created := true;
        filled := filled || 'drop_slots';
      END IF;
    END IF;

    status := CASE WHEN array_length(filled, 1) > 0
                   THEN 'existing_day_drop_filled'
                   ELSE 'existing_day_unchanged' END;

    RETURN jsonb_build_object(
      'status', status, 'created', created,
      'existing_shift', has_shift, 'existing_closing', has_closing,
      'fields_filled', to_jsonb(filled)
    );
  END IF;

  -- Completely absent day: create Statistics row from ACE (5 fields only).
  INSERT INTO public.fin_day_closing (
    casino_id, business_date, drop_slots, net_win, cashdesk_win,
    players_card_balance, slots_result
  ) VALUES (
    _casino_id, _business_date,
    COALESCE(_drop_slots, 0), COALESCE(_net_win, 0), COALESCE(_cashdesk_win, 0),
    COALESCE(_client_balance, 0), COALESCE(_net_win, 0)
  );
  created := true;
  filled := ARRAY['drop_slots','net_win','slots_result','cashdesk_win','players_card_balance'];

  RETURN jsonb_build_object(
    'status', 'new_statistics_day_created', 'created', true,
    'existing_shift', false, 'existing_closing', false,
    'fields_filled', to_jsonb(filled)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.ace_backfill_history_day(uuid, date, numeric, numeric, numeric, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ace_backfill_history_day(uuid, date, numeric, numeric, numeric, numeric) TO service_role;