-- Add player_notes + a few additional tables to realtime publication for instant cross-client updates.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'player_notes','player_position_history','client_sessions',
    'monthly_tips_entries','monthly_tips_pools','staff_warnings'
  ]
  LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    EXCEPTION WHEN duplicate_object THEN NULL;
             WHEN undefined_table THEN NULL;
    END;
    BEGIN
      EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);
    EXCEPTION WHEN undefined_table THEN NULL;
    END;
  END LOOP;
END$$;