
-- Add missing operational tables to realtime publication
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['chip_snapshots','shifts','casino_visits','bank_checks','cage_transfers','cashless_transactions','cage_slots_shifts','cage_slots_transfers','player_chip_adjustments','chip_baseline','chip_inventory','player_daily_zones','player_daily_avg_bets','rota_locks','business_day_closures']
  LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    EXCEPTION WHEN duplicate_object THEN NULL;
             WHEN undefined_table THEN NULL;
    END;
  END LOOP;
END$$;

-- Set REPLICA IDENTITY FULL so realtime filters on non-PK columns (like casino_id)
-- evaluate correctly on UPDATE/DELETE events. Without this, an UPDATE that doesn't
-- touch casino_id arrives without it in the payload and the filter drops the event,
-- so subscribers (Pit screen) never see manager edits until manual refresh.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'breaklist','pit_rota','staff_rota','dealer_attendance','staff_attendance',
    'chip_snapshots','table_tracker','transactions','shifts','gaming_tables',
    'casino_visits','expenses','bank_checks','cage_transfers','cashless_transactions',
    'cage_slots_shifts','cage_slots_transfers','player_chip_adjustments',
    'chip_baseline','chip_inventory','rota_locks','business_day_closures',
    'player_daily_zones','player_daily_avg_bets','players','player_tags','player_cards',
    'activity_logs'
  ]
  LOOP
    BEGIN
      EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);
    EXCEPTION WHEN undefined_table THEN NULL;
    END;
  END LOOP;
END$$;
