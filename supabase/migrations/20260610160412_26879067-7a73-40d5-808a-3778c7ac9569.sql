REVOKE EXECUTE ON FUNCTION public.user_can_subscribe_casino_realtime(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.user_can_subscribe_casino_realtime(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.user_can_subscribe_casino_realtime(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_can_subscribe_casino_realtime(uuid, uuid) TO service_role;