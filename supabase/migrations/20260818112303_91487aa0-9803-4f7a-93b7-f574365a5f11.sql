-- 1. ACE finance snapshots: restrict reads to management/finance roles
DROP POLICY IF EXISTS "ace snapshots readable by authenticated" ON public.ace_finance_snapshots;

CREATE POLICY "ace snapshots readable by management"
ON public.ace_finance_snapshots
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin')
  OR public.has_role(auth.uid(), 'finance_manager')
  OR public.has_role(auth.uid(), 'general_manager')
  OR public.has_role(auth.uid(), 'boss')
  OR public.has_role(auth.uid(), 'manager')
  OR public.has_role(auth.uid(), 'shift_manager')
);

-- 2. Box licenses: secrets (license_key, challenge_nonce) only for super_admin.
DROP POLICY IF EXISTS "box_licenses authenticated read" ON public.box_licenses;

CREATE POLICY "box_licenses super_admin read"
ON public.box_licenses
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'));

-- Non-secret license state for gating the UI for every signed-in user.
CREATE OR REPLACE FUNCTION public.box_license_state()
RETURNS TABLE (
  id uuid,
  node_id text,
  activated_at timestamptz,
  last_heartbeat_at timestamptz,
  full_days integer,
  restricted_days integer,
  license_expires_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT l.id, l.node_id, l.activated_at, l.last_heartbeat_at,
         l.full_days, l.restricted_days, l.license_expires_at
  FROM public.box_licenses l
  ORDER BY l.activated_at ASC
  LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION public.box_license_state() TO authenticated;