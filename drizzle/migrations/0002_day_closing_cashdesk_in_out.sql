ALTER TABLE public.fin_day_closing
  ADD COLUMN IF NOT EXISTS cashdesk_in numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cashdesk_out numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cashdesk_win_base numeric;

UPDATE public.fin_day_closing
   SET cashdesk_win_base = COALESCE(cashdesk_win, 0)
 WHERE cashdesk_win_base IS NULL;