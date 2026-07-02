
CREATE TABLE IF NOT EXISTS public.fleet_heartbeats (
  node_id text PRIMARY KEY,
  casino_id uuid REFERENCES public.casinos(id) ON DELETE SET NULL,
  hostname text,
  cms_version text,
  license_mode text,
  license_expires_at timestamptz,
  public_ip inet,
  local_ip inet,
  tailscale_ip inet,
  uptime_seconds bigint,
  cpu_load numeric,
  disk_used_pct numeric,
  ram_used_pct numeric,
  notes jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  first_seen_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.fleet_heartbeats TO authenticated;
GRANT ALL ON public.fleet_heartbeats TO service_role;

ALTER TABLE public.fleet_heartbeats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super_admin reads fleet" ON public.fleet_heartbeats;
CREATE POLICY "super_admin reads fleet" ON public.fleet_heartbeats
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role));

DROP POLICY IF EXISTS "service manages fleet" ON public.fleet_heartbeats;
CREATE POLICY "service manages fleet" ON public.fleet_heartbeats
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_fleet_heartbeats_last_seen
  ON public.fleet_heartbeats (last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_fleet_heartbeats_casino
  ON public.fleet_heartbeats (casino_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.fleet_heartbeats;
