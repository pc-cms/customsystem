
CREATE TABLE public.casino_license (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  casino_id uuid NOT NULL REFERENCES public.casinos(id) ON DELETE CASCADE,
  license_id uuid NOT NULL,
  package_code text NOT NULL REFERENCES public.casino_packages(code),
  features jsonb NOT NULL DEFAULT '[]'::jsonb,
  payload jsonb NOT NULL,
  signature text NOT NULL,
  issued_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  activated_at timestamptz NOT NULL DEFAULT now(),
  activated_by uuid REFERENCES auth.users(id),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT casino_license_one_per_casino UNIQUE (casino_id)
);

GRANT SELECT ON public.casino_license TO authenticated;
GRANT ALL ON public.casino_license TO service_role;

ALTER TABLE public.casino_license ENABLE ROW LEVEL SECURITY;

-- Anyone signed in reads the license row (needed by useLicense on every page).
CREATE POLICY "Authenticated can read license"
  ON public.casino_license FOR SELECT
  TO authenticated
  USING (true);

-- No direct INSERT/UPDATE/DELETE from the client. All writes must go through
-- the verify-license edge function, which uses service_role after Ed25519
-- signature verification. This prevents forged licenses from being stored
-- even if RLS were misconfigured elsewhere.
-- (super_admin manages via the edge function, not direct SQL.)

CREATE INDEX idx_casino_license_casino ON public.casino_license(casino_id);
CREATE INDEX idx_casino_license_expires ON public.casino_license(expires_at);

CREATE TRIGGER update_casino_license_updated_at
  BEFORE UPDATE ON public.casino_license
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
