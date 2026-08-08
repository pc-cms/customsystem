ALTER TABLE public.cage_slots_shifts
  ADD COLUMN IF NOT EXISTS manual_slots_result numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS manual_slots_deposits numeric NOT NULL DEFAULT 0;