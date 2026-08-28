DROP POLICY IF EXISTS "HR cannot write user_roles" ON public.user_roles;

CREATE POLICY "HR cannot insert user_roles"
ON public.user_roles AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (
  (NOT has_role(auth.uid(), 'hr'::app_role))
  OR has_role(auth.uid(), 'super_admin'::app_role)
  OR can_manage(auth.uid())
  OR has_role(auth.uid(), 'shift_manager'::app_role)
);

CREATE POLICY "HR cannot update user_roles"
ON public.user_roles AS RESTRICTIVE FOR UPDATE TO authenticated
USING (
  (NOT has_role(auth.uid(), 'hr'::app_role))
  OR has_role(auth.uid(), 'super_admin'::app_role)
  OR can_manage(auth.uid())
  OR has_role(auth.uid(), 'shift_manager'::app_role)
);

CREATE POLICY "HR cannot delete user_roles"
ON public.user_roles AS RESTRICTIVE FOR DELETE TO authenticated
USING (
  (NOT has_role(auth.uid(), 'hr'::app_role))
  OR has_role(auth.uid(), 'super_admin'::app_role)
  OR can_manage(auth.uid())
  OR has_role(auth.uid(), 'shift_manager'::app_role)
);