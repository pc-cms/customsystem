-- 1. Shift/business-date unification
CREATE OR REPLACE FUNCTION public.compute_shift_table_results(p_shift_id uuid)
 RETURNS TABLE(table_id uuid, result numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_casino_id uuid;
  v_business_date date;
BEGIN
  SELECT s.casino_id,
         public.business_date_of(s.opened_at)
  INTO v_casino_id, v_business_date
  FROM shifts s WHERE s.id = p_shift_id;

  IF v_casino_id IS NULL THEN RETURN; END IF;

  RETURN QUERY
  WITH
  imported AS (
    SELECT tdr.table_id AS tid, tdr.result AS res
    FROM table_daily_results tdr
    WHERE tdr.casino_id = v_casino_id
      AND tdr.date = v_business_date
      AND tdr.source = 'import'
  ),
  closed_tables AS (
    SELECT gt.id AS tid, gt.closing_result::numeric AS res
    FROM gaming_tables gt
    WHERE gt.casino_id = v_casino_id
      AND gt.is_archived = false
      AND gt.closing_result IS NOT NULL
  ),
  derived AS (
    SELECT tdr.table_id AS tid, tdr.result AS res
    FROM table_daily_results tdr
    WHERE tdr.casino_id = v_casino_id
      AND tdr.date = v_business_date
      AND COALESCE(tdr.source, 'shift') <> 'import'
  ),
  fc AS (
    SELECT ct.table_id AS tid,
           COALESCE(SUM(CASE WHEN ct.transfer_type = 'fill'   THEN ct.amount ELSE 0 END), 0)::numeric AS fill,
           COALESCE(SUM(CASE WHEN ct.transfer_type = 'credit' THEN ct.amount ELSE 0 END), 0)::numeric AS credit
    FROM cage_transfers ct
    WHERE ct.shift_id = p_shift_id
      AND ct.table_id IS NOT NULL
      AND ct.transfer_type IN ('fill','credit')
    GROUP BY ct.table_id
  ),
  ids AS (
    SELECT tid FROM imported
    UNION SELECT tid FROM closed_tables
    UNION SELECT tid FROM derived
    UNION SELECT tid FROM fc
  )
  SELECT i.tid AS table_id,
         CASE
           WHEN imp.res IS NOT NULL THEN imp.res
           WHEN ct.res IS NOT NULL
             THEN ct.res - COALESCE(fc.fill, 0) + COALESCE(fc.credit, 0)
           ELSE COALESCE(dv.res, 0)
         END::numeric AS result
  FROM ids i
  LEFT JOIN imported      imp ON imp.tid = i.tid
  LEFT JOIN closed_tables ct  ON ct.tid  = i.tid
  LEFT JOIN derived       dv  ON dv.tid  = i.tid
  LEFT JOIN fc                ON fc.tid  = i.tid;
END;
$function$;

CREATE OR REPLACE FUNCTION public.populate_table_daily_results_for_day(_casino_id uuid, _business_date date, _user uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_from timestamptz;
  v_to   timestamptz;
  v_count integer := 0;
BEGIN
  v_from := (_business_date::timestamp + interval '13 hours') AT TIME ZONE 'Africa/Dar_es_Salaam';
  v_to   := ((_business_date + 1)::timestamp + interval '13 hours') AT TIME ZONE 'Africa/Dar_es_Salaam';

  WITH
  drops AS (
    SELECT t.table_id,
           COALESCE(SUM(t.amount), 0)::numeric AS drop_amount
    FROM transactions t
    WHERE t.casino_id = _casino_id
      AND t.table_id IS NOT NULL
      AND t.cancelled_at IS NULL
      AND t.type IN ('buy'::transaction_type, 'in'::transaction_type)
      AND t.created_at >= v_from
      AND t.created_at <  v_to
    GROUP BY t.table_id
  ),
  day_shifts AS (
    SELECT s.id
    FROM shifts s
    WHERE s.casino_id = _casino_id
      AND public.business_date_of(s.opened_at) = _business_date
  ),
  latest AS (
    SELECT cs.location_id AS tid, MAX(cs.created_at) AS ts
    FROM chip_snapshots cs
    WHERE cs.casino_id = _casino_id
      AND cs.date = _business_date
      AND cs.location_type = 'table'
      AND cs.location_id IS NOT NULL
    GROUP BY cs.location_id
  ),
  snap_result AS (
    SELECT cs.location_id AS tid,
           SUM((cs.actual_quantity - COALESCE(b.expected_quantity, 0)) * cs.denomination) AS res
    FROM chip_snapshots cs
    JOIN latest l
      ON l.tid = cs.location_id
     AND l.ts  = cs.created_at
    LEFT JOIN chip_baseline b
      ON b.casino_id      = cs.casino_id
     AND b.location_type  = 'table'
     AND b.location_id    = cs.location_id
     AND b.denomination   = cs.denomination
    WHERE cs.casino_id = _casino_id
      AND cs.date = _business_date
      AND cs.location_type = 'table'
    GROUP BY cs.location_id
  ),
  closed_tables AS (
    SELECT gt.id AS tid, gt.closing_result::numeric AS res
    FROM gaming_tables gt
    WHERE gt.casino_id = _casino_id
      AND gt.is_archived = false
      AND gt.closing_result IS NOT NULL
  ),
  fc AS (
    SELECT ct.table_id AS tid,
           COALESCE(SUM(CASE WHEN ct.transfer_type = 'fill'   THEN ct.amount ELSE 0 END), 0)::numeric AS fill,
           COALESCE(SUM(CASE WHEN ct.transfer_type = 'credit' THEN ct.amount ELSE 0 END), 0)::numeric AS credit
    FROM cage_transfers ct
    WHERE ct.shift_id IN (SELECT id FROM day_shifts)
      AND ct.table_id IS NOT NULL
      AND ct.transfer_type IN ('fill','credit')
    GROUP BY ct.table_id
  ),
  ids AS (
    SELECT table_id AS tid FROM drops
    UNION
    SELECT tid FROM snap_result
    UNION
    SELECT tid FROM closed_tables
    UNION
    SELECT tid FROM fc
  ),
  combined AS (
    SELECT i.tid AS table_id,
           COALESCE(d.drop_amount, 0)::numeric AS drop_amount,
           (COALESCE(cl.res, sr.res, 0) - COALESCE(fc.fill, 0) + COALESCE(fc.credit, 0))::numeric AS result
    FROM ids i
    LEFT JOIN drops         d  ON d.table_id = i.tid
    LEFT JOIN snap_result   sr ON sr.tid     = i.tid
    LEFT JOIN closed_tables cl ON cl.tid     = i.tid
    LEFT JOIN fc               ON fc.tid     = i.tid
  ),
  upsert AS (
    INSERT INTO public.table_daily_results
      (casino_id, table_id, date, drop_amount, result, created_by, source)
    SELECT _casino_id, c.table_id, _business_date,
           c.drop_amount, c.result, _user, 'shift'
    FROM combined c
    ON CONFLICT (casino_id, date, table_id)
    DO UPDATE
      SET drop_amount = EXCLUDED.drop_amount,
          result      = CASE
                          WHEN public.table_daily_results.source = 'import'
                          THEN public.table_daily_results.result
                          ELSE EXCLUDED.result
                        END,
          updated_at  = now()
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_count FROM upsert;

  RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_recalc_shift_tables_on_snapshot()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_date date;
  v_casino uuid;
  r record;
BEGIN
  v_date   := COALESCE(NEW.date, OLD.date);
  v_casino := COALESCE(NEW.casino_id, OLD.casino_id);
  IF v_date IS NULL OR v_casino IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  FOR r IN
    SELECT s.id
      FROM public.shifts s
     WHERE s.casino_id = v_casino
       AND s.status = 'closed'
       AND public.business_date_of(s.opened_at) = v_date
  LOOP
    PERFORM public.recalc_shift_tables_result(r.id);
  END LOOP;
  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- 2. Auto-close guarded to the 07:00 rollover
CREATE OR REPLACE FUNCTION public.auto_close_business_day()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_now timestamptz := now();
  v_hour int := EXTRACT(HOUR FROM (v_now AT TIME ZONE 'Africa/Dar_es_Salaam'))::int;
  v_sessions_closed int := 0;
  v_visits_closed int := 0;
BEGIN
  -- Shifts run until 06:00 EAT; never auto-close before the 07:00 rollover.
  IF v_hour < 7 THEN
    INSERT INTO public.cron_run_log(job_name, status, details)
    VALUES ('auto_close_business_day', 'ok',
            jsonb_build_object('skipped', true, 'hour', v_hour));
    RETURN jsonb_build_object('status', 'skipped', 'hour', v_hour);
  END IF;

  WITH updated AS (
    UPDATE public.client_sessions
       SET stopped_at = v_now,
           duration_minutes = GREATEST(0, EXTRACT(EPOCH FROM (v_now - started_at))::int / 60)
     WHERE stopped_at IS NULL
    RETURNING id
  )
  SELECT count(*) INTO v_sessions_closed FROM updated;

  WITH updated AS (
    UPDATE public.casino_visits
       SET checked_out_at = v_now
     WHERE checked_out_at IS NULL
    RETURNING id
  )
  SELECT count(*) INTO v_visits_closed FROM updated;

  INSERT INTO public.cron_run_log(job_name, status, details)
  VALUES ('auto_close_business_day', 'ok',
          jsonb_build_object('sessions_closed', v_sessions_closed,
                             'visits_closed', v_visits_closed,
                             'ran_at', v_now));

  RETURN jsonb_build_object(
    'sessions_closed', v_sessions_closed,
    'visits_closed', v_visits_closed
  );
END;
$function$;

-- 3. Visit triggers on the unified business date
CREATE OR REPLACE FUNCTION public.ensure_visit_on_transaction()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_today date;
  v_existing uuid;
BEGIN
  IF NEW.player_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_today := public.business_date_of(now());

  -- Close any stale open visit from a previous business day / other casino
  UPDATE public.casino_visits
     SET checked_out_at = now()
   WHERE player_id = NEW.player_id
     AND checked_out_at IS NULL
     AND (date <> v_today OR casino_id <> NEW.casino_id);

  SELECT id INTO v_existing
    FROM public.casino_visits
   WHERE casino_id = NEW.casino_id
     AND player_id = NEW.player_id
     AND date = v_today
   LIMIT 1;

  IF v_existing IS NULL THEN
    INSERT INTO public.casino_visits (casino_id, player_id, date, checked_in_by, checked_in_at, position)
    VALUES (NEW.casino_id, NEW.player_id, v_today, NEW.operator_id, now(), 'hall');
  ELSE
    UPDATE public.casino_visits
       SET checked_out_at = NULL
     WHERE id = v_existing
       AND checked_out_at IS NOT NULL;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.ensure_visit_on_chip_transfer()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_today date;
BEGIN
  v_today := public.business_date_of(now());

  UPDATE public.casino_visits
     SET checked_out_at = now()
   WHERE player_id = NEW.player_id
     AND checked_out_at IS NULL
     AND (date <> v_today OR casino_id <> NEW.casino_id);

  INSERT INTO public.casino_visits (casino_id, player_id, date, checked_in_by, checked_in_at, position)
  SELECT NEW.casino_id, NEW.player_id, v_today, NEW.operator_id, now(), 'hall'
  WHERE NOT EXISTS (
    SELECT 1 FROM public.casino_visits
     WHERE casino_id = NEW.casino_id AND player_id = NEW.player_id AND date = v_today
  );

  UPDATE public.casino_visits
     SET checked_out_at = NULL
   WHERE casino_id = NEW.casino_id
     AND player_id = NEW.player_id
     AND date = v_today
     AND checked_out_at IS NOT NULL;

  RETURN NEW;
END;
$function$;

-- 4. Move the cron job from 05:00 EAT to 07:05 EAT (04:05 UTC)
DO $do$
DECLARE
  v_jobid bigint;
BEGIN
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'auto_close_business_day' LIMIT 1;
  IF v_jobid IS NOT NULL THEN
    PERFORM cron.alter_job(v_jobid, schedule => '5 4 * * *');
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'cron reschedule skipped: %', SQLERRM;
END
$do$;

-- 5. One-off cleanup of stale open visits / sessions from previous business days
UPDATE public.casino_visits
   SET checked_out_at = now()
 WHERE checked_out_at IS NULL
   AND date < public.business_date_of(now());

UPDATE public.client_sessions
   SET stopped_at = now(),
       duration_minutes = GREATEST(0, EXTRACT(EPOCH FROM (now() - started_at))::int / 60)
 WHERE stopped_at IS NULL
   AND public.business_date_of(started_at) < public.business_date_of(now());