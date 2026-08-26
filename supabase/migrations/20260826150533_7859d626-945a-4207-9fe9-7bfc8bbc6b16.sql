INSERT INTO public.user_module_permissions (user_id, module_key, can_view, can_write, day_horizon, granted_by)
VALUES ('cf76860e-1ffd-4bbc-b5e0-3a8a21925c7d', 'staff_master', true, true, 'all', 'cf76860e-1ffd-4bbc-b5e0-3a8a21925c7d')
ON CONFLICT (user_id, module_key) DO UPDATE SET can_view = true, can_write = true, day_horizon = 'all';

UPDATE public.user_module_permissions
SET can_write = true
WHERE user_id = 'cf76860e-1ffd-4bbc-b5e0-3a8a21925c7d'
  AND module_key IN ('staff_employees', 'staff_rota', 'staff_attendance');