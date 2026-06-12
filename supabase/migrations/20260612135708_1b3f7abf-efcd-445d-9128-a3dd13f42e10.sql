ALTER TABLE public.chip_color_settings
  ADD COLUMN IF NOT EXISTS is_visible boolean NOT NULL DEFAULT true;