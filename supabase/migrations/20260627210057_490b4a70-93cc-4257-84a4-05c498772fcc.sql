ALTER TABLE public.table_day_drop_cache REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.table_day_drop_cache;