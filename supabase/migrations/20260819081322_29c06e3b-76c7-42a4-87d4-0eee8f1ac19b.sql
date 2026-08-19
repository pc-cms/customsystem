
-- 1) Общая функция автозакрытия одного казино за конкретный бизнес-день
CREATE OR REPLACE FUNCTION public.close_casino_business_day_auto(
  _casino_id uuid, _business_date date, _method text DEFAULT 'auto_11am'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_now timestamptz := now();
  v_cage int := 0; v_shift int := 0; v_sessions int := 0; v_visits int := 0;
  v_day jsonb;
BEGIN
  IF EXISTS (SELECT 1 FROM public.business_day_closures b
              WHERE b.casino_id = _casino_id AND b.business_date = _business_date) THEN
    RETURN jsonb_build_object('status','already_closed','business_date',_business_date);
  END IF;

  PERFORM set_config('app.force_close_shift', 'on', true);

  WITH upd AS (
    UPDATE public.cage_slots_shifts
       SET status = 'closed', closed_at = COALESCE(closed_at, v_now), updated_at = v_now
     WHERE casino_id = _casino_id AND business_date = _business_date
       AND status NOT IN ('closed','reversed')
    RETURNING id
  ) SELECT count(*) INTO v_cage FROM upd;

  WITH upd AS (
    UPDATE public.shifts
       SET status = 'closed', closed_at = v_now,
           notes = COALESCE(NULLIF(notes,''),'') ||
                   CASE WHEN COALESCE(notes,'') = '' THEN '' ELSE E'\n' END ||
                   '[FORCED AUTO-CLOSE — no manual Close Day]'
     WHERE casino_id = _casino_id AND status = 'open'
    RETURNING id
  ) SELECT count(*) INTO v_shift FROM upd;

  WITH upd AS (
    UPDATE public.client_sessions
       SET stopped_at = v_now,
           duration_minutes = GREATEST(0, EXTRACT(EPOCH FROM (v_now - started_at))::int / 60)
     WHERE casino_id = _casino_id AND stopped_at IS NULL
    RETURNING id
  ) SELECT count(*) INTO v_sessions FROM upd;

  WITH upd AS (
    UPDATE public.casino_visits
       SET checked_out_at = v_now
     WHERE casino_id = _casino_id AND checked_out_at IS NULL
    RETURNING id
  ) SELECT count(*) INTO v_visits FROM upd;

  v_day := public.close_business_day(_casino_id, _method, true);

  PERFORM set_config('app.force_close_shift', 'off', true);

  RETURN jsonb_build_object(
    'status','closed', 'business_date', _business_date, 'method', _method,
    'cage_shifts_closed', v_cage, 'table_shifts_closed', v_shift,
    'sessions_closed', v_sessions, 'visits_closed', v_visits, 'day', v_day
  );
END;
$function$;

-- 2) Единый дедлайн 11:00 EAT (grace 07:00-10:59)
CREATE OR REPLACE FUNCTION public.force_close_business_day_0800()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_hour int := EXTRACT(HOUR FROM (now() AT TIME ZONE 'Africa/Dar_es_Salaam'))::int;
  v_yesterday date := (now() AT TIME ZONE 'Africa/Dar_es_Salaam')::date - 1;
  v_grace boolean;
  v_c record;
  v_res jsonb := '[]'::jsonb;
  v_err text;
  v_waiting int := 0;
BEGIN
  IF v_hour < 7 THEN
    RETURN jsonb_build_object('status','skipped','hour',v_hour);
  END IF;
  v_grace := (v_hour BETWEEN 7 AND 10);

  FOR v_c IN
    SELECT c.id AS casino_id, c.name
    FROM public.casinos c
    WHERE NOT EXISTS (
      SELECT 1 FROM public.business_day_closures b
      WHERE b.casino_id = c.id AND b.business_date = v_yesterday
    )
  LOOP
    IF v_grace
       AND EXISTS (SELECT 1 FROM public.ace_ingest_keys k
                    WHERE k.casino_id = v_c.casino_id AND k.is_active)
       AND NOT EXISTS (SELECT 1 FROM public.ace_finance_snapshots s
                        WHERE s.casino_id = v_c.casino_id
                          AND s.period_id <> 0
                          AND s.business_date = v_yesterday)
    THEN
      v_waiting := v_waiting + 1;
      CONTINUE;
    END IF;

    BEGIN
      v_res := v_res || public.close_casino_business_day_auto(
        v_c.casino_id, v_yesterday, 'auto_11am'
      ) || jsonb_build_object('casino', v_c.name, 'grace', v_grace);
    EXCEPTION WHEN OTHERS THEN
      v_err := SQLERRM;
      v_res := v_res || jsonb_build_object('casino', v_c.name, 'error', v_err);
      INSERT INTO public.cron_run_log(job_name, status, details)
      VALUES ('force_close_business_day_0800','error',
              jsonb_build_object('casino', v_c.name, 'business_date', v_yesterday, 'error', v_err));
    END;
  END LOOP;

  IF jsonb_array_length(v_res) > 0 OR NOT v_grace THEN
    INSERT INTO public.cron_run_log(job_name, status, details)
    VALUES ('force_close_business_day_0800','ok',
            jsonb_build_object('business_date', v_yesterday, 'grace', v_grace,
                               'waiting_for_ace', v_waiting, 'results', v_res));
  END IF;

  RETURN jsonb_build_object('status','ok','business_date',v_yesterday,
                            'grace',v_grace,'waiting_for_ace',v_waiting,'results',v_res);
END;
$function$;

-- 3) Забытые дни: порог 11:00 EAT и корректный метод/дата
CREATE OR REPLACE FUNCTION public.auto_close_forgotten_business_days()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _eat timestamp := (now() AT TIME ZONE 'Africa/Dar_es_Salaam');
  _eat_hour int := EXTRACT(HOUR FROM _eat)::int;
  _yesterday date := _eat::date - 1;
  _r record;
  _closed int := 0;
  _failed int := 0;
  _err text;
BEGIN
  IF _eat_hour < 11 THEN
    RETURN;
  END IF;

  FOR _r IN
    SELECT c.id AS casino_id, c.name
    FROM public.casinos c
    WHERE NOT EXISTS (
      SELECT 1 FROM public.business_day_closures b
      WHERE b.casino_id = c.id AND b.business_date = _yesterday
    )
  LOOP
    BEGIN
      PERFORM public.close_business_day(_r.casino_id, 'auto_11am'::text, false);
      _closed := _closed + 1;
    EXCEPTION WHEN OTHERS THEN
      _failed := _failed + 1;
      _err := SQLERRM;
      INSERT INTO public.cron_run_log(job_name, status, details)
      VALUES ('auto_close_forgotten_business_days', 'error',
              jsonb_build_object('casino_id', _r.casino_id, 'casino', _r.name,
                                 'business_date', _yesterday, 'error', _err));
    END;
  END LOOP;

  INSERT INTO public.cron_run_log(job_name, status, details)
  VALUES ('auto_close_forgotten_business_days',
          CASE WHEN _failed > 0 THEN 'warning' ELSE 'ok' END,
          jsonb_build_object('business_date', _yesterday, 'closed', _closed, 'failed', _failed));
END;
$function$;

-- 4) ACE: не затирать tables_result нулём, заполнять slots_result
CREATE OR REPLACE FUNCTION public.ace_apply_closed_report(_casino_id uuid, _business_date date, _drop_slots numeric, _net_win numeric, _cashdesk_win numeric, _client_balance numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tables_result numeric := 0;
BEGIN
  IF _casino_id IS NULL OR _business_date IS NULL THEN
    RAISE EXCEPTION 'casino_id and business_date are required';
  END IF;

  SELECT COALESCE(SUM(COALESCE(s.tables_result,0)),0)
    INTO v_tables_result
    FROM public.shifts s
   WHERE s.casino_id = _casino_id
     AND public.business_date_of(s.opened_at) = _business_date;

  INSERT INTO public.fin_day_closing AS d (
    casino_id, business_date, drop_slots, net_win, cashdesk_win,
    tables_result, slots_result, players_card_balance
  ) VALUES (
    _casino_id, _business_date, _drop_slots, _net_win, _cashdesk_win,
    v_tables_result, _cashdesk_win, _client_balance
  )
  ON CONFLICT (casino_id, business_date) DO UPDATE SET
    drop_slots = EXCLUDED.drop_slots,
    net_win = EXCLUDED.net_win,
    cashdesk_win = EXCLUDED.cashdesk_win,
    tables_result = CASE WHEN v_tables_result <> 0 THEN v_tables_result
                         ELSE COALESCE(NULLIF(d.tables_result, 0), v_tables_result) END,
    slots_result = COALESCE(NULLIF(EXCLUDED.slots_result, 0), d.slots_result),
    players_card_balance = EXCLUDED.players_card_balance,
    updated_at = now();

  RETURN jsonb_build_object('ok', true, 'business_date', _business_date, 'tables_result', v_tables_result);
END;
$function$;

-- 5) Мгновенное закрытие дня по приходу закрытого отчёта ACE
CREATE OR REPLACE FUNCTION public.tg_ace_close_day_on_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_eat timestamp := (now() AT TIME ZONE 'Africa/Dar_es_Salaam');
  v_yesterday date := v_eat::date - 1;
  v_res jsonb;
BEGIN
  IF NEW.period_id = 0 OR NEW.business_date IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.business_date <> v_yesterday OR EXTRACT(HOUR FROM v_eat)::int < 7 THEN
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM public.business_day_closures b
              WHERE b.casino_id = NEW.casino_id AND b.business_date = v_yesterday) THEN
    RETURN NEW;
  END IF;

  BEGIN
    v_res := public.close_casino_business_day_auto(NEW.casino_id, v_yesterday, 'auto_11am');
    INSERT INTO public.cron_run_log(job_name, status, details)
    VALUES ('ace_close_day_on_snapshot','ok', v_res);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.cron_run_log(job_name, status, details)
    VALUES ('ace_close_day_on_snapshot','error',
            jsonb_build_object('casino_id', NEW.casino_id,
                               'business_date', v_yesterday, 'error', SQLERRM));
  END;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_ace_close_day_on_snapshot ON public.ace_finance_snapshots;
CREATE TRIGGER trg_ace_close_day_on_snapshot
AFTER INSERT OR UPDATE ON public.ace_finance_snapshots
FOR EACH ROW EXECUTE FUNCTION public.tg_ace_close_day_on_snapshot();

-- 6) Освежение tables_result в Day Closings при закрытии смены столов
CREATE OR REPLACE FUNCTION public.tg_refresh_day_closing_tables_result()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_bd date;
  v_total numeric;
BEGIN
  IF NEW.status <> 'closed' THEN
    RETURN NEW;
  END IF;
  v_bd := public.business_date_of(NEW.opened_at);

  SELECT COALESCE(SUM(COALESCE(s.tables_result,0)),0) INTO v_total
    FROM public.shifts s
   WHERE s.casino_id = NEW.casino_id
     AND public.business_date_of(s.opened_at) = v_bd;

  UPDATE public.fin_day_closing
     SET tables_result = v_total, updated_at = now()
   WHERE casino_id = NEW.casino_id AND business_date = v_bd;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_refresh_day_closing_tables_result ON public.shifts;
CREATE TRIGGER trg_refresh_day_closing_tables_result
AFTER UPDATE OF status, tables_result ON public.shifts
FOR EACH ROW EXECUTE FUNCTION public.tg_refresh_day_closing_tables_result();

-- 7) Cron: единый дедлайн 11:00 EAT (08:00 UTC), grace каждые 5 минут 07:00-10:55 EAT
SELECT cron.unschedule('force_close_business_day_0800');
SELECT cron.unschedule('force-close-business-day-0700-grace');
SELECT cron.schedule('force_close_business_day_1100', '0 8 * * *', $$select public.force_close_business_day_0800();$$);
SELECT cron.schedule('force-close-business-day-grace', '*/5 4-7 * * *', $$select public.force_close_business_day_0800();$$);
