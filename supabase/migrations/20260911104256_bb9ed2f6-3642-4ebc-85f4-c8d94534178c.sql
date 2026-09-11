CREATE INDEX IF NOT EXISTS idx_fin_money_change_casino_bd
  ON public.fin_money_change (casino_id, business_date DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_shifts_casino_opened
  ON public.shifts (casino_id, opened_at DESC);

CREATE INDEX IF NOT EXISTS idx_transactions_casino_created_active
  ON public.transactions (casino_id, created_at DESC)
  WHERE cancelled_at IS NULL;