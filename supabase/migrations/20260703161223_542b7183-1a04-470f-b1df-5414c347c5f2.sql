
-- Seed branding fields from static public/manifest-*.json into casinos rows,
-- so casino-manifest edge function returns identical PWA payload as static files.
UPDATE public.casinos SET
  short_name       = COALESCE(short_name, 'Arusha'),
  name             = COALESCE(NULLIF(name, ''), 'Premier Arusha'),
  meta_title       = COALESCE(meta_title, 'Premier Arusha — Casino System'),
  meta_description = COALESCE(meta_description, 'Premier Arusha — Casino Management System.'),
  theme_color      = COALESCE(theme_color, '#000000'),
  background_color = COALESCE(background_color, '#000000'),
  pwa_display      = COALESCE(pwa_display, 'standalone')
WHERE slug = 'arusha';

UPDATE public.casinos SET
  short_name       = COALESCE(short_name, 'Mwanza'),
  name             = COALESCE(NULLIF(name, ''), 'Premier Mwanza'),
  meta_title       = COALESCE(meta_title, 'Premier Mwanza — Casino System'),
  meta_description = COALESCE(meta_description, 'Premier Mwanza — Casino Management System.'),
  theme_color      = COALESCE(theme_color, '#000000'),
  background_color = COALESCE(background_color, '#000000'),
  pwa_display      = COALESCE(pwa_display, 'standalone')
WHERE slug = 'mwanza';

UPDATE public.casinos SET
  short_name       = COALESCE(short_name, 'Dodoma'),
  name             = COALESCE(NULLIF(name, ''), 'Premier Dodoma'),
  meta_title       = COALESCE(meta_title, 'Premier Dodoma — Casino System'),
  meta_description = COALESCE(meta_description, 'Premier Dodoma — Casino Management System.'),
  theme_color      = COALESCE(theme_color, '#000000'),
  background_color = COALESCE(background_color, '#000000'),
  pwa_display      = COALESCE(pwa_display, 'standalone')
WHERE slug = 'dodoma';

UPDATE public.casinos SET
  short_name       = COALESCE(short_name, 'Mbeya'),
  name             = COALESCE(NULLIF(name, ''), 'Premier Mbeya'),
  meta_title       = COALESCE(meta_title, 'Premier Mbeya — Casino System'),
  meta_description = COALESCE(meta_description, 'Premier Mbeya — Casino Management System.'),
  theme_color      = COALESCE(theme_color, '#000000'),
  background_color = COALESCE(background_color, '#000000'),
  pwa_display      = COALESCE(pwa_display, 'standalone')
WHERE slug = 'mbeya';
