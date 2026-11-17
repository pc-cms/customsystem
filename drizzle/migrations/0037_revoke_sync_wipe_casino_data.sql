REVOKE EXECUTE ON FUNCTION public.sync_wipe_casino_data(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_wipe_casino_data(uuid, text) TO service_role;