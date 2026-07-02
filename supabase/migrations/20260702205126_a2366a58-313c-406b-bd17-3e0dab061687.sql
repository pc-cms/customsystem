
ALTER TABLE public.fleet_heartbeats
  ADD COLUMN IF NOT EXISTS auto_rollback_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS auto_rollback_reason TEXT;

CREATE OR REPLACE FUNCTION public.tg_cloud_clone_auto_rollback()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  regressions INTEGER;
  last_rb TIMESTAMPTZ;
BEGIN
  IF NEW.status <> 'regression' THEN RETURN NEW; END IF;

  -- Only trigger when the last 3 reports for this node are all regressions
  SELECT count(*) INTO regressions
  FROM (
    SELECT status
    FROM public.cloud_clone_reports
    WHERE node_id = NEW.node_id
    ORDER BY created_at DESC
    LIMIT 3
  ) t
  WHERE status = 'regression';

  IF regressions < 3 THEN RETURN NEW; END IF;

  -- Debounce: no auto-rollback if one was already queued in the last 12 hours
  SELECT MAX(created_at) INTO last_rb
  FROM public.fleet_commands
  WHERE node_id = NEW.node_id AND kind = 'rollback'
    AND created_at > now() - interval '12 hours';
  IF last_rb IS NOT NULL THEN RETURN NEW; END IF;

  INSERT INTO public.fleet_commands (node_id, kind, payload)
  VALUES (NEW.node_id, 'rollback',
    jsonb_build_object('reason', '3 consecutive smoke-test regressions',
                       'triggered_by_report', NEW.id));

  INSERT INTO public.fleet_incident_forwards (node_id, severity, category, title, body, metadata)
  VALUES (NEW.node_id, 'critical', 'ota',
    'Auto-rollback triggered',
    'Three consecutive smoke-test regressions. A rollback command has been queued automatically.',
    jsonb_build_object('report_id', NEW.id));

  UPDATE public.fleet_heartbeats
    SET auto_rollback_at = now(),
        auto_rollback_reason = '3 consecutive smoke-test regressions'
    WHERE node_id = NEW.node_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_cloud_clone_auto_rollback ON public.cloud_clone_reports;
CREATE TRIGGER tg_cloud_clone_auto_rollback
  AFTER INSERT ON public.cloud_clone_reports
  FOR EACH ROW EXECUTE FUNCTION public.tg_cloud_clone_auto_rollback();
