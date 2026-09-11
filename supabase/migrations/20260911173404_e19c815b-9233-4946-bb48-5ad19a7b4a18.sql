-- 1. Remove peer-sync capture triggers from all tables
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.relname
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_proc p ON p.oid = t.tgfoid
    WHERE p.proname = 'sync_capture_change' AND NOT t.tgisinternal
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_sync_capture ON public.%I', r.relname);
  END LOOP;
END $$;

-- 2. Clear the sync journals
TRUNCATE TABLE public.sync_outbox;
TRUNCATE TABLE public.sync_exchange_logs;

-- 3. Stop the hourly outbox garbage collection
DO $$
BEGIN
  PERFORM cron.unschedule('cms-sync-outbox-gc');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 4. Retention: 61 days for logs, 3 days for request metrics
CREATE OR REPLACE FUNCTION public.cleanup_old_data()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cutoff       timestamptz := now() - INTERVAL '61 days';
  v_logs_arch    bigint := 0; v_logs_del    bigint := 0;
  v_brk_arch     bigint := 0; v_brk_del     bigint := 0;
  v_sess_arch    bigint := 0; v_sess_del    bigint := 0;
  v_vis_arch     bigint := 0; v_vis_del     bigint := 0;
  v_metrics_del  bigint := 0;
  v_started_at   timestamptz := clock_timestamp();
BEGIN
  WITH src AS (
    SELECT * FROM public.activity_logs WHERE created_at < v_cutoff
  ),
  ins AS (
    INSERT INTO public.activity_logs_archive
    SELECT * FROM src
    ON CONFLICT DO NOTHING
    RETURNING id
  )
  SELECT count(*) INTO v_logs_arch FROM ins;

  DELETE FROM public.activity_logs
   WHERE created_at < v_cutoff
     AND id IN (SELECT id FROM public.activity_logs_archive WHERE created_at < v_cutoff);
  GET DIAGNOSTICS v_logs_del = ROW_COUNT;

  WITH src AS (
    SELECT * FROM public.breaklist_logs WHERE created_at < v_cutoff
  ),
  ins AS (
    INSERT INTO public.breaklist_logs_archive
    SELECT * FROM src
    ON CONFLICT DO NOTHING
    RETURNING id
  )
  SELECT count(*) INTO v_brk_arch FROM ins;

  DELETE FROM public.breaklist_logs
   WHERE created_at < v_cutoff
     AND id IN (SELECT id FROM public.breaklist_logs_archive WHERE created_at < v_cutoff);
  GET DIAGNOSTICS v_brk_del = ROW_COUNT;

  WITH src AS (
    SELECT * FROM public.client_sessions
     WHERE stopped_at IS NOT NULL AND stopped_at < v_cutoff
  ),
  ins AS (
    INSERT INTO public.client_sessions_archive
    SELECT * FROM src
    ON CONFLICT DO NOTHING
    RETURNING id
  )
  SELECT count(*) INTO v_sess_arch FROM ins;

  DELETE FROM public.client_sessions
   WHERE stopped_at IS NOT NULL AND stopped_at < v_cutoff
     AND id IN (SELECT id FROM public.client_sessions_archive);
  GET DIAGNOSTICS v_sess_del = ROW_COUNT;

  WITH src AS (
    SELECT * FROM public.casino_visits
     WHERE checked_out_at IS NOT NULL AND checked_out_at < v_cutoff
  ),
  ins AS (
    INSERT INTO public.casino_visits_archive
    SELECT * FROM src
    ON CONFLICT DO NOTHING
    RETURNING id
  )
  SELECT count(*) INTO v_vis_arch FROM ins;

  DELETE FROM public.casino_visits
   WHERE checked_out_at IS NOT NULL AND checked_out_at < v_cutoff
     AND id IN (SELECT id FROM public.casino_visits_archive);
  GET DIAGNOSTICS v_vis_del = ROW_COUNT;

  DELETE FROM public.request_metrics WHERE bucket_at < now() - INTERVAL '3 days';
  GET DIAGNOSTICS v_metrics_del = ROW_COUNT;

  INSERT INTO public.cron_run_log (job_name, status, duration_ms, details)
  VALUES (
    'cleanup_old_data', 'ok',
    EXTRACT(MILLISECONDS FROM clock_timestamp() - v_started_at)::int,
    jsonb_build_object(
      'cutoff', v_cutoff,
      'activity_logs', jsonb_build_object('archived', v_logs_arch, 'deleted', v_logs_del),
      'breaklist_logs', jsonb_build_object('archived', v_brk_arch, 'deleted', v_brk_del),
      'sessions', jsonb_build_object('archived', v_sess_arch, 'deleted', v_sess_del),
      'visits', jsonb_build_object('archived', v_vis_arch, 'deleted', v_vis_del),
      'request_metrics_deleted', v_metrics_del
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'cutoff', v_cutoff,
    'activity_logs', jsonb_build_object('archived', v_logs_arch, 'deleted', v_logs_del),
    'breaklist_logs', jsonb_build_object('archived', v_brk_arch, 'deleted', v_brk_del),
    'sessions', jsonb_build_object('archived', v_sess_arch, 'deleted', v_sess_del),
    'visits', jsonb_build_object('archived', v_vis_arch, 'deleted', v_vis_del),
    'request_metrics_deleted', v_metrics_del
  );
EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.cron_run_log (job_name, status, duration_ms, details)
  VALUES (
    'cleanup_old_data', 'error',
    EXTRACT(MILLISECONDS FROM clock_timestamp() - v_started_at)::int,
    jsonb_build_object('error', SQLERRM, 'sqlstate', SQLSTATE)
  );
  RAISE;
END;
$function$;