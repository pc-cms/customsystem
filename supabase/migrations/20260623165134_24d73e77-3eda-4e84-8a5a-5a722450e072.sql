CREATE INDEX IF NOT EXISTS idx_chip_snapshots_latest_lookup
ON public.chip_snapshots (
  casino_id,
  date,
  location_type,
  location_id,
  denomination,
  created_at DESC,
  id DESC
);

CREATE INDEX IF NOT EXISTS idx_chip_snapshots_history_lookup
ON public.chip_snapshots (casino_id, date, created_at DESC, id ASC);

CREATE INDEX IF NOT EXISTS idx_breaklist_casino_date_slot_employee
ON public.breaklist (casino_id, date, time_slot, employee_id);