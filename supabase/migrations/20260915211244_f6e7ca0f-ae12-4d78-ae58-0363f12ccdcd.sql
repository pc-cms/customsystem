REVOKE EXECUTE ON FUNCTION public.ace_attach_identity(uuid, uuid, text, boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.ace_unlink_identity(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.ace_merge_auto_player(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.ace_player_stats(date, date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ace_attach_identity(uuid, uuid, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ace_unlink_identity(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ace_merge_auto_player(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ace_player_stats(date, date, uuid) TO authenticated;