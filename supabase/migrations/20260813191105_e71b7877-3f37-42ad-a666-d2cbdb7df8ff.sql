CREATE OR REPLACE FUNCTION public.admin_active_sessions()
RETURNS TABLE (
  session_id uuid,
  user_id uuid,
  created_at timestamptz,
  updated_at timestamptz,
  refreshed_at timestamptz,
  not_after timestamptz,
  user_agent text,
  ip text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = auth, public
AS $$
  SELECT s.id, s.user_id, s.created_at, s.updated_at, s.refreshed_at, s.not_after,
         s.user_agent, host(s.ip)
  FROM auth.sessions s
  WHERE s.not_after IS NULL OR s.not_after > now()
  ORDER BY COALESCE(s.refreshed_at, s.updated_at, s.created_at) DESC
$$;

REVOKE ALL ON FUNCTION public.admin_active_sessions() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_active_sessions() TO service_role;