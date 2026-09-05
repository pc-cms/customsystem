ALTER TABLE public.cage_slots_shifts
  ADD COLUMN IF NOT EXISTS taxable_winnings numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS jackpot_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS adjustment_ref text;

ALTER TABLE public.shifts
  ADD COLUMN IF NOT EXISTS adjustment_ref text;

ALTER TABLE public.casinos
  ADD COLUMN IF NOT EXISTS winnings_tax_rate numeric NOT NULL DEFAULT 0.15,
  ADD COLUMN IF NOT EXISTS report_layout text NOT NULL DEFAULT 'legacy';