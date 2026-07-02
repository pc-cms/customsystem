
-- ============================================================================
-- Box License + Boxed-Server Config foundation
-- ============================================================================

-- 1. box_config: single-row per node (mode, first-boot state, branding)
CREATE TABLE IF NOT EXISTS public.box_config (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id       text NOT NULL UNIQUE,
  is_setup_complete boolean NOT NULL DEFAULT false,
  casino_slug   text,
  casino_name   text,
  branding      jsonb NOT NULL DEFAULT '{}'::jsonb,
  network       jsonb NOT NULL DEFAULT '{}'::jsonb,   -- {mode:'dhcp'|'static', ip, gateway, dns}
  tailscale     jsonb NOT NULL DEFAULT '{}'::jsonb,   -- {enabled, hostname, tag}
  cloud_link    jsonb NOT NULL DEFAULT '{}'::jsonb,   -- {url, pairing_code, paired_at}
  peer_mode     text NOT NULL DEFAULT 'standalone' CHECK (peer_mode IN ('standalone','peer','hub','satellite')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.box_config TO anon;                       -- wizard needs unauth read to know "not set up"
GRANT SELECT, INSERT, UPDATE ON public.box_config TO authenticated;
GRANT ALL ON public.box_config TO service_role;

ALTER TABLE public.box_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "box_config anon read setup flag"
  ON public.box_config FOR SELECT TO anon USING (true);

CREATE POLICY "box_config authenticated read"
  ON public.box_config FOR SELECT TO authenticated USING (true);

CREATE POLICY "box_config super_admin write"
  ON public.box_config FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE TRIGGER trg_box_config_updated_at
  BEFORE UPDATE ON public.box_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. box_licenses: grace-period state (60 full → 30 restricted → stop)
CREATE TABLE IF NOT EXISTS public.box_licenses (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id             text NOT NULL UNIQUE,
  activated_at        timestamptz NOT NULL DEFAULT now(),
  last_heartbeat_at   timestamptz NOT NULL DEFAULT now(),
  full_days           integer NOT NULL DEFAULT 60,
  restricted_days     integer NOT NULL DEFAULT 30,
  license_key         text,                       -- current activation code (nullable = default 60/30)
  license_expires_at  timestamptz,                -- if set, resets the counters
  challenge_nonce     text,                       -- last shown challenge for support
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.box_licenses TO anon;
GRANT SELECT, UPDATE ON public.box_licenses TO authenticated;
GRANT ALL ON public.box_licenses TO service_role;

ALTER TABLE public.box_licenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "box_licenses anon read"
  ON public.box_licenses FOR SELECT TO anon USING (true);

CREATE POLICY "box_licenses authenticated read"
  ON public.box_licenses FOR SELECT TO authenticated USING (true);

CREATE POLICY "box_licenses super_admin update"
  ON public.box_licenses FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE TRIGGER trg_box_licenses_updated_at
  BEFORE UPDATE ON public.box_licenses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Helper: compute current license mode ('full' | 'restricted' | 'stopped')
CREATE OR REPLACE FUNCTION public.box_license_mode()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  lic public.box_licenses%ROWTYPE;
  days_since integer;
BEGIN
  SELECT * INTO lic FROM public.box_licenses ORDER BY activated_at ASC LIMIT 1;
  IF NOT FOUND THEN
    RETURN 'full';  -- Cloud (no box license row) always full
  END IF;

  -- Explicit license key extends the horizon
  IF lic.license_expires_at IS NOT NULL AND lic.license_expires_at > now() THEN
    RETURN 'full';
  END IF;

  days_since := GREATEST(0, EXTRACT(EPOCH FROM (now() - lic.activated_at))::int / 86400);

  IF days_since < lic.full_days THEN
    RETURN 'full';
  ELSIF days_since < (lic.full_days + lic.restricted_days) THEN
    RETURN 'restricted';
  ELSE
    RETURN 'stopped';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.box_license_mode() TO anon, authenticated;
