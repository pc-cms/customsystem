
INSERT INTO public.role_module_defaults (role, module_key, can_view, can_write, day_horizon)
VALUES
  ('super_admin', 'daily_expenses', true, true, 'all'),
  ('super_admin', 'pit_book', true, true, 'all')
ON CONFLICT (role, module_key) DO UPDATE
  SET can_view = EXCLUDED.can_view,
      can_write = EXCLUDED.can_write,
      day_horizon = EXCLUDED.day_horizon;
