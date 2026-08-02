CREATE OR REPLACE FUNCTION public.client_session_autoclose_prior()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_closed RECORD;
  v_operator uuid := COALESCE(auth.uid(), NEW.created_by);
  v_inherited_total numeric := 0;
BEGIN
  FOR v_closed IN
    UPDATE public.client_sessions
       SET stopped_at = now()
     WHERE player_id  = NEW.player_id
       AND stopped_at IS NULL
       AND id <> NEW.id
    RETURNING id, casino_id, table_id, started_at, stopped_at,
              avg_bet, total_bet, duration_minutes
  LOOP
    -- Inherit total_bet when the closed session belongs to the same business day
    -- (Africa/Dar_es_Salaam, unified 07:00 rollover).
    IF public.business_date_of(v_closed.started_at) = public.business_date_of(NEW.started_at) THEN
      v_inherited_total := v_inherited_total + COALESCE(v_closed.total_bet, 0);
    END IF;

    INSERT INTO public.activity_logs (
      casino_id, operator_id, category, action, details
    ) VALUES (
      v_closed.casino_id,
      v_operator,
      'pit'::log_category,
      'session_auto_closed',
      jsonb_build_object(
        'reason',            'reseat_to_other_table',
        'closed_session_id', v_closed.id,
        'closed_table_id',   v_closed.table_id,
        'new_session_id',    NEW.id,
        'new_table_id',      NEW.table_id,
        'started_at',        v_closed.started_at,
        'stopped_at',        v_closed.stopped_at,
        'avg_bet',           v_closed.avg_bet,
        'total_bet',         v_closed.total_bet,
        'duration_minutes',  v_closed.duration_minutes
      )
    );
  END LOOP;

  IF v_inherited_total > 0 THEN
    NEW.total_bet := COALESCE(NEW.total_bet, 0) + v_inherited_total;
  END IF;

  RETURN NEW;
END;
$function$;