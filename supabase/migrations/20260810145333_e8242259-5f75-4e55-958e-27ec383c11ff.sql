-- Graphics: same audience as Statistics (reports)
INSERT INTO public.role_module_defaults (role, module_key)
SELECT role, 'report_graphics' FROM public.role_module_defaults WHERE module_key = 'reports'
ON CONFLICT DO NOTHING;

-- Blank Forms: same audience as Statistics, plus cashier roles
INSERT INTO public.role_module_defaults (role, module_key)
SELECT role, 'blank_forms' FROM public.role_module_defaults WHERE module_key = 'reports'
ON CONFLICT DO NOTHING;

INSERT INTO public.role_module_defaults (role, module_key)
SELECT r, 'blank_forms' FROM unnest(ARRAY['cashier','cashier_slots']::app_role[]) AS r
ON CONFLICT DO NOTHING;

-- General Manager: no HR warnings, no Blank Forms
DELETE FROM public.role_module_defaults
WHERE role = 'general_manager' AND module_key IN ('hr_warnings', 'blank_forms');