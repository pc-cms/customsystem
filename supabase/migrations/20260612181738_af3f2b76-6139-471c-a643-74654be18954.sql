DELETE FROM public.chip_color_settings
WHERE casino_id = (SELECT id FROM public.casinos WHERE slug = 'arusha');
