-- 1) onprem_channels: hide hmac_secret_hash + pairing_code from authenticated UI
REVOKE SELECT ON public.onprem_channels FROM authenticated;
GRANT SELECT (
  id, casino_id, slug, tunnel_hostname, cf_tunnel_id,
  pairing_expires_at, paired_at, paired_by, last_seen_at,
  version, outbox_lag, status, created_at, updated_at
) ON public.onprem_channels TO authenticated;
-- service_role keeps full access via existing GRANT ALL

-- 2) user_roles: restrict manager DELETE to the same allowlist as INSERT
DROP POLICY IF EXISTS "Managers delete roles for same casino" ON public.user_roles;
CREATE POLICY "Managers delete roles for same casino"
ON public.user_roles
FOR DELETE
TO authenticated
USING (
  has_role(auth.uid(), 'manager'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = user_roles.user_id
      AND p.casino_id = get_user_casino_id(auth.uid())
  )
  AND role = ANY (ARRAY[
    'cashier'::app_role,
    'pit'::app_role,
    'manager'::app_role,
    'reception'::app_role,
    'surveillance'::app_role,
    'floor_manager'::app_role,
    'cashier_slots'::app_role,
    'pos_waiter'::app_role,
    'pos_bartender'::app_role,
    'pos_manager'::app_role
  ])
);