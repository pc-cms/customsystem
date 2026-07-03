
ALTER TABLE public.casinos
  ADD COLUMN IF NOT EXISTS shift_matrix jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS og_image_url text;

-- Seed default matrix (Day/Night/Middle) for casinos that still have empty matrix,
-- using existing d_shift_start/n_shift_start when present.
UPDATE public.casinos
SET shift_matrix = jsonb_build_array(
  jsonb_build_object('key','D','label','Day',    'start', COALESCE(d_shift_start::text,'06:00'), 'end', COALESCE(n_shift_start::text,'18:00'), 'applies_to', ARRAY['rota','breaklist','cage']),
  jsonb_build_object('key','N','label','Night',  'start', COALESCE(n_shift_start::text,'18:00'), 'end', COALESCE(shift_end::text,'05:00'),     'applies_to', ARRAY['rota','breaklist','cage']),
  jsonb_build_object('key','M','label','Middle', 'start', '12:00', 'end', '00:00', 'applies_to', ARRAY['rota'])
)
WHERE shift_matrix = '[]'::jsonb OR shift_matrix IS NULL;
