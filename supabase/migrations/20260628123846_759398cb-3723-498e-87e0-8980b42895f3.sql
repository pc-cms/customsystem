ALTER TABLE public.player_day_drop_cache REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.player_day_drop_cache;