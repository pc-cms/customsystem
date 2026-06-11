
CREATE POLICY "club_account_secrets deny select"
  ON public.club_account_secrets FOR SELECT
  TO anon, authenticated
  USING (false);

CREATE POLICY "user_credentials deny select"
  ON public.user_credentials FOR SELECT
  TO anon, authenticated
  USING (false);

CREATE POLICY "pending_server_registrations super_admin delete"
  ON public.pending_server_registrations FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role));

DROP POLICY IF EXISTS "lotteries_anon_read" ON public.lotteries;
DROP POLICY IF EXISTS "shop_items_anon_read" ON public.shop_items;
REVOKE SELECT ON public.lotteries FROM anon;
REVOKE SELECT ON public.shop_items FROM anon;

REVOKE SELECT ON public.cloud_connection FROM authenticated;
GRANT SELECT (
  id, cloud_url, status, pairing_id, pairing_expires_at, casino_id,
  connected_at, last_polled_at, last_error, updated_at
) ON public.cloud_connection TO authenticated;

REVOKE SELECT ON public.peer_links FROM authenticated;
GRANT SELECT (
  id, peer_url, peer_node_id, display_name, status, schema_version,
  last_seen_at, last_push_cursor, last_pull_cursor,
  last_push_error, last_pull_error, created_at, updated_at, peer_node_kind
) ON public.peer_links TO authenticated;

REVOKE SELECT ON public.onprem_channels FROM authenticated;
GRANT SELECT (
  id, casino_id, slug, tunnel_hostname, cf_tunnel_id,
  pairing_expires_at, paired_at, paired_by, last_seen_at,
  version, outbox_lag, status, created_at, updated_at
) ON public.onprem_channels TO authenticated;

ALTER TABLE public.peer_links ADD COLUMN IF NOT EXISTS casino_id uuid;

UPDATE public.peer_links pl
SET casino_id = psr.approved_casino_id
FROM public.pending_server_registrations psr
WHERE pl.sync_secret = psr.sync_secret
  AND psr.approved_casino_id IS NOT NULL
  AND pl.casino_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_peer_links_casino_id ON public.peer_links(casino_id);
GRANT SELECT (casino_id) ON public.peer_links TO authenticated;

DROP POLICY IF EXISTS "HR cannot write user_roles" ON public.user_roles;
CREATE POLICY "HR cannot write user_roles"
  ON public.user_roles AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (
    NOT public.has_role(auth.uid(), 'hr'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR public.has_role(auth.uid(), 'floor_manager'::app_role)
  )
  WITH CHECK (
    NOT public.has_role(auth.uid(), 'hr'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR public.has_role(auth.uid(), 'floor_manager'::app_role)
  );
