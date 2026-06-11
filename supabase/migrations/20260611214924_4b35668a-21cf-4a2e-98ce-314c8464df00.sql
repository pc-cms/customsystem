DROP POLICY IF EXISTS "Managers insert roles for same casino" ON public.user_roles;
DROP POLICY IF EXISTS "Managers delete roles for same casino" ON public.user_roles;

CREATE POLICY "Managers insert roles for same casino"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'manager'::app_role)
  AND EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.user_id = user_roles.user_id
      AND p.casino_id = get_user_casino_id(auth.uid())
  )
  AND role = ANY (ARRAY[
    'cashier'::app_role, 'pit'::app_role, 'reception'::app_role,
    'surveillance'::app_role, 'floor_manager'::app_role,
    'cashier_slots'::app_role, 'pos_waiter'::app_role,
    'pos_bartender'::app_role, 'pos_manager'::app_role
  ])
);

CREATE POLICY "Managers delete roles for same casino"
ON public.user_roles
FOR DELETE
TO authenticated
USING (
  has_role(auth.uid(), 'manager'::app_role)
  AND EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.user_id = user_roles.user_id
      AND p.casino_id = get_user_casino_id(auth.uid())
  )
  AND role = ANY (ARRAY[
    'cashier'::app_role, 'pit'::app_role, 'reception'::app_role,
    'surveillance'::app_role, 'floor_manager'::app_role,
    'cashier_slots'::app_role, 'pos_waiter'::app_role,
    'pos_bartender'::app_role, 'pos_manager'::app_role
  ])
);