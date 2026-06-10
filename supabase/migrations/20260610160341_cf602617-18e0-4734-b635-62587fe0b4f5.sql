CREATE OR REPLACE FUNCTION public.user_can_subscribe_casino_realtime(_user_id uuid, _casino_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.user_id = _user_id
      AND p.casino_id = _casino_id
  )
  OR EXISTS (
    SELECT 1
    FROM public.user_casino_access uca
    WHERE uca.user_id = _user_id
      AND uca.casino_id = _casino_id
  )
$$;

GRANT EXECUTE ON FUNCTION public.user_can_subscribe_casino_realtime(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS "Users can subscribe to casino realtime channels" ON realtime.messages;

CREATE POLICY "Users can subscribe to casino realtime channels"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  realtime.topic() ~ '^casino:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:'
  AND public.user_can_subscribe_casino_realtime(
    auth.uid(),
    (substring(realtime.topic() from '^casino:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):'))::uuid
  )
);