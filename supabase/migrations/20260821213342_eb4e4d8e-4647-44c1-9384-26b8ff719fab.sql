-- Remove the network-wide PII leak for blacklisted players
DROP POLICY IF EXISTS "Players readable within casino scope" ON public.players;
CREATE POLICY "Players readable within casino scope"
ON public.players FOR SELECT TO authenticated
USING (
  public.has_casino_scope(auth.uid(), casino_id)
  OR EXISTS (
    SELECT 1 FROM public.casino_visits v
    WHERE v.player_id = players.id
      AND public.has_casino_scope(auth.uid(), v.casino_id)
  )
);

-- Network-wide blacklist safety list, minimal fields only (no phone/id/birth date/documents)
CREATE OR REPLACE FUNCTION public.blacklist_network_players()
RETURNS TABLE (
  id uuid,
  casino_id uuid,
  first_name text,
  last_name text,
  nickname text,
  full_name text,
  photo_url text,
  status text,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.casino_id, p.first_name, p.last_name, p.nickname, p.full_name,
         p.photo_url, p.status::text, p.updated_at
  FROM public.players p
  WHERE p.status = 'blacklist'::player_status
    AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid())
  ORDER BY p.updated_at DESC;
$$;

REVOKE ALL ON FUNCTION public.blacklist_network_players() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.blacklist_network_players() TO authenticated;