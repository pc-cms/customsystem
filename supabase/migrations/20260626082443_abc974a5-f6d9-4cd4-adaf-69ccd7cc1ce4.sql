DO $$
DECLARE
  rec record;
  local_id uuid := '00000000-0000-0000-0000-0000000000ca';
BEGIN
  -- Delete from all public tables with a casino_id column
  FOR rec IN
    SELECT table_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name = 'casino_id'
      AND table_name NOT IN ('payroll_bank_export_v','v_pos_item_availability','sync_outbox_pending','sessions_total_bet_sum','chip_conservation_status','player_economy','player_session_drops','player_session_stats')
  LOOP
    EXECUTE format('DELETE FROM public.%I WHERE casino_id = $1', rec.table_name) USING local_id;
  END LOOP;

  -- Special: pending_server_registrations uses approved_casino_id
  DELETE FROM public.pending_server_registrations WHERE approved_casino_id = local_id;

  -- node_identity uses owned_casino_ids array
  DELETE FROM public.node_identity WHERE local_id = ANY(owned_casino_ids);

  -- Finally remove the casino row itself
  DELETE FROM public.casinos WHERE id = local_id;
END $$;