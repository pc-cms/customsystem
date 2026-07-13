
-- Copy all manager module defaults to boss (idempotent)
INSERT INTO public.role_module_defaults (role, module_key, can_view, can_write, day_horizon)
SELECT 'boss'::public.app_role, module_key, can_view, can_write, day_horizon
FROM public.role_module_defaults
WHERE role = 'manager'
ON CONFLICT (role, module_key) DO NOTHING;

-- Boss extras
INSERT INTO public.role_module_defaults (role, module_key, can_view, can_write, day_horizon) VALUES
  ('boss'::public.app_role, 'finance_summary', true, false, 'all'::public.day_horizon),
  ('boss'::public.app_role, 'finance_budget',  true, true,  'all'::public.day_horizon),
  ('boss'::public.app_role, 'boss_dashboard',  true, true,  'today'::public.day_horizon)
ON CONFLICT (role, module_key) DO UPDATE SET can_view = EXCLUDED.can_view;

-- Super Admin also gets boss_dashboard
INSERT INTO public.role_module_defaults (role, module_key, can_view, can_write, day_horizon) VALUES
  ('super_admin'::public.app_role, 'boss_dashboard', true, true, 'today'::public.day_horizon)
ON CONFLICT (role, module_key) DO NOTHING;
