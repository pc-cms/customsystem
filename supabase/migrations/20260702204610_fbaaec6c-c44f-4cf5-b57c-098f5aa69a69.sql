
-- Extend fleet_commands with bulk + runbook linkage and payload
ALTER TABLE public.fleet_commands
  ADD COLUMN IF NOT EXISTS bulk_op_id UUID,
  ADD COLUMN IF NOT EXISTS runbook_id UUID,
  ADD COLUMN IF NOT EXISTS payload JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Runbooks: pre-approved SQL snippets
CREATE TABLE IF NOT EXISTS public.fleet_runbooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  sql_text TEXT NOT NULL,
  is_destructive BOOLEAN NOT NULL DEFAULT false,
  requires_confirmation BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fleet_runbooks TO authenticated;
GRANT ALL ON public.fleet_runbooks TO service_role;
ALTER TABLE public.fleet_runbooks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "super_admin manages runbooks"
  ON public.fleet_runbooks FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- Bulk operations
CREATE TABLE IF NOT EXISTS public.fleet_bulk_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL,
  runbook_id UUID REFERENCES public.fleet_runbooks(id),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  target_node_ids UUID[] NOT NULL DEFAULT '{}',
  total_count INTEGER NOT NULL DEFAULT 0,
  done_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'queued',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
GRANT SELECT, INSERT, UPDATE ON public.fleet_bulk_operations TO authenticated;
GRANT ALL ON public.fleet_bulk_operations TO service_role;
ALTER TABLE public.fleet_bulk_operations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "super_admin manages bulk ops"
  ON public.fleet_bulk_operations FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- Incident forwards from boxes
CREATE TABLE IF NOT EXISTS public.fleet_incident_forwards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id UUID NOT NULL,
  local_incident_id UUID,
  severity TEXT NOT NULL DEFAULT 'info',
  category TEXT,
  title TEXT NOT NULL,
  body TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by UUID REFERENCES auth.users(id),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);
GRANT SELECT, UPDATE ON public.fleet_incident_forwards TO authenticated;
GRANT ALL ON public.fleet_incident_forwards TO service_role;
ALTER TABLE public.fleet_incident_forwards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "super_admin reads incident forwards"
  ON public.fleet_incident_forwards FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "super_admin acks incident forwards"
  ON public.fleet_incident_forwards FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE INDEX IF NOT EXISTS idx_fleet_incident_forwards_node ON public.fleet_incident_forwards(node_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_fleet_commands_bulk ON public.fleet_commands(bulk_op_id) WHERE bulk_op_id IS NOT NULL;

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.fleet_runbooks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.fleet_bulk_operations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.fleet_incident_forwards;

-- Helper: dispatch bulk op → insert fleet_commands rows for each target node
CREATE OR REPLACE FUNCTION public.fleet_dispatch_bulk(_bulk_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b RECORD;
  n UUID;
  inserted INTEGER := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin') THEN
    RAISE EXCEPTION 'insufficient privileges';
  END IF;
  SELECT * INTO b FROM public.fleet_bulk_operations WHERE id = _bulk_id;
  IF b IS NULL THEN RAISE EXCEPTION 'bulk op not found'; END IF;

  FOREACH n IN ARRAY b.target_node_ids LOOP
    INSERT INTO public.fleet_commands (node_id, kind, bulk_op_id, runbook_id, payload)
    VALUES (n, b.kind, b.id, b.runbook_id, b.payload);
    inserted := inserted + 1;
  END LOOP;

  UPDATE public.fleet_bulk_operations
    SET total_count = inserted, status = 'dispatched'
    WHERE id = _bulk_id;
  RETURN inserted;
END;
$$;
GRANT EXECUTE ON FUNCTION public.fleet_dispatch_bulk(UUID) TO authenticated;

-- Progress tracker: recompute bulk op progress when child command status changes
CREATE OR REPLACE FUNCTION public.tg_fleet_bulk_progress()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d INTEGER;
  e INTEGER;
  t INTEGER;
BEGIN
  IF NEW.bulk_op_id IS NULL THEN RETURN NEW; END IF;
  SELECT
    count(*) FILTER (WHERE status = 'done'),
    count(*) FILTER (WHERE status = 'error'),
    count(*)
  INTO d, e, t
  FROM public.fleet_commands WHERE bulk_op_id = NEW.bulk_op_id;

  UPDATE public.fleet_bulk_operations
    SET done_count = d, error_count = e,
        status = CASE WHEN d + e >= t THEN 'completed' ELSE 'running' END,
        completed_at = CASE WHEN d + e >= t THEN now() ELSE NULL END
    WHERE id = NEW.bulk_op_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_fleet_bulk_progress ON public.fleet_commands;
CREATE TRIGGER tg_fleet_bulk_progress
  AFTER UPDATE OF status ON public.fleet_commands
  FOR EACH ROW EXECUTE FUNCTION public.tg_fleet_bulk_progress();
