ALTER TABLE public.weekly_bonus_entries
  ADD COLUMN IF NOT EXISTS coefficient numeric(4,2) NOT NULL DEFAULT 1.00;

ALTER TABLE public.weekly_bonus_entries
  DROP CONSTRAINT IF EXISTS weekly_bonus_entries_coefficient_range;

ALTER TABLE public.weekly_bonus_entries
  ADD CONSTRAINT weekly_bonus_entries_coefficient_range
  CHECK (coefficient >= 1.00 AND coefficient <= 2.00);