
CREATE TABLE IF NOT EXISTS public.fleet_commands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('reboot','update','license_refresh','custom')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','done','error')),
  issued_by uuid REFERENCES auth.users(id),
  issued_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  result_text text
);

GRANT SELECT, INSERT ON public.fleet_commands TO authenticated;
GRANT ALL ON public.fleet_commands TO service_role;

ALTER TABLE public.fleet_commands ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super_admin reads fleet cmds" ON public.fleet_commands;
CREATE POLICY "super_admin reads fleet cmds" ON public.fleet_commands
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role));

DROP POLICY IF EXISTS "super_admin queues fleet cmds" ON public.fleet_commands;
CREATE POLICY "super_admin queues fleet cmds" ON public.fleet_commands
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

DROP POLICY IF EXISTS "service manages fleet cmds" ON public.fleet_commands;
CREATE POLICY "service manages fleet cmds" ON public.fleet_commands
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_fleet_commands_pending
  ON public.fleet_commands (node_id, issued_at) WHERE status = 'pending';

ALTER PUBLICATION supabase_realtime ADD TABLE public.fleet_commands;
