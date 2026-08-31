CREATE UNIQUE INDEX IF NOT EXISTS ace_finance_snapshots_casino_day_uidx
  ON public.ace_finance_snapshots (casino_id, business_date);