DELETE FROM public.role_module_defaults
WHERE role = 'surveillance'
  AND module_key IN ('cage_slots','reports','tips_and_bonuses','groups');

UPDATE public.user_module_permissions
SET can_view = false, can_write = false
WHERE module_key IN ('cage_slots','reports','tips_and_bonuses','groups')
  AND user_id IN (SELECT user_id FROM public.user_roles WHERE role = 'surveillance');