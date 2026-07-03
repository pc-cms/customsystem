-- Extend casinos with branding + extended time settings
ALTER TABLE public.casinos
  ADD COLUMN IF NOT EXISTS short_name text,
  ADD COLUMN IF NOT EXISTS tagline text,
  ADD COLUMN IF NOT EXISTS meta_title text,
  ADD COLUMN IF NOT EXISTS meta_description text,
  ADD COLUMN IF NOT EXISTS theme_color text,
  ADD COLUMN IF NOT EXISTS background_color text,
  ADD COLUMN IF NOT EXISTS pwa_display text DEFAULT 'standalone',
  ADD COLUMN IF NOT EXISTS favicon_url text,
  ADD COLUMN IF NOT EXISTS apple_touch_icon_url text,
  ADD COLUMN IF NOT EXISTS pwa_icon_192_url text,
  ADD COLUMN IF NOT EXISTS pwa_icon_512_url text,
  ADD COLUMN IF NOT EXISTS og_image_url text,
  ADD COLUMN IF NOT EXISTS n_shift_start time,
  ADD COLUMN IF NOT EXISTS d_shift_start time,
  ADD COLUMN IF NOT EXISTS cage_close_deadline_min integer,
  ADD COLUMN IF NOT EXISTS manager_override_window_min integer;

-- Per-user history horizon override (nullable — falls back to role default)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'history_horizon') THEN
    CREATE TYPE public.history_horizon AS ENUM ('today', '7d', '30d', 'all');
  END IF;
END $$;

ALTER TABLE public.user_module_permissions
  ADD COLUMN IF NOT EXISTS history_horizon public.history_horizon;

-- Storage bucket for casino branding assets (created via storage tool, not SQL,
-- but we ensure a public read policy is present when it exists).
