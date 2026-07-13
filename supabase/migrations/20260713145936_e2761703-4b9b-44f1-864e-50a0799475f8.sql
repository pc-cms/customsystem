DROP POLICY IF EXISTS "Super admins see all casinos" ON public.casinos;
CREATE POLICY "Super admins see all casinos"
  ON public.casinos FOR SELECT
  USING (
    has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'finance_manager'::app_role)
    OR has_role(auth.uid(), 'boss'::app_role)
  );