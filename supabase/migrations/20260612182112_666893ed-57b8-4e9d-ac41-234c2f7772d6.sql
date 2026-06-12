WITH mwanza AS (SELECT id FROM public.casinos WHERE slug='mwanza')
INSERT INTO public.chip_color_settings (casino_id, denomination, bg_color, edge_color, text_color, is_visible)
VALUES
  ((SELECT id FROM mwanza), 1000000, '#9e671a', '#f2d307', '#000000', true),
  ((SELECT id FROM mwanza),  500000, '#f372f3', '#7c017e', '#FFFFFF', true),
  ((SELECT id FROM mwanza),  100000, '#050505', '#FFFFFF', '#000000', true),
  ((SELECT id FROM mwanza),   50000, '#18abdc', '#FFFFFF', '#000000', true),
  ((SELECT id FROM mwanza),   25000, '#4dd33c', '#dbf5a8', '#000000', true),
  ((SELECT id FROM mwanza),   10000, '#dd643c', '#98c02a', '#000000', true),
  ((SELECT id FROM mwanza),    5000, '#ea502a', '#b1f53d', '#000000', true),
  ((SELECT id FROM mwanza),    2000, '#dc18cc', '#b1f53d', '#000000', true),
  ((SELECT id FROM mwanza),    1000, '#2044b1', '#4bcde7', '#000000', true),
  ((SELECT id FROM mwanza),     500, '#e2de79', '#FFFFFF', '#000000', true)
ON CONFLICT (casino_id, denomination)
DO UPDATE SET
  bg_color   = EXCLUDED.bg_color,
  edge_color = EXCLUDED.edge_color,
  text_color = EXCLUDED.text_color,
  is_visible = EXCLUDED.is_visible,
  updated_at = now();
