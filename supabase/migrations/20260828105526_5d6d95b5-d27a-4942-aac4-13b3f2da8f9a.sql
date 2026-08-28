DROP POLICY IF EXISTS "payroll_settings_write_super" ON public.payroll_settings;
CREATE POLICY "payroll_settings_write_hr_finance" ON public.payroll_settings
FOR ALL TO authenticated
USING (
  has_role(auth.uid(),'super_admin'::app_role)
  OR ((has_role(auth.uid(),'hr'::app_role) OR can_finance(auth.uid())) AND has_casino_scope(auth.uid(), casino_id))
)
WITH CHECK (
  has_role(auth.uid(),'super_admin'::app_role)
  OR ((has_role(auth.uid(),'hr'::app_role) OR can_finance(auth.uid())) AND has_casino_scope(auth.uid(), casino_id))
);

DROP POLICY IF EXISTS "paye_brackets_write_super" ON public.payroll_paye_brackets;
CREATE POLICY "paye_brackets_write_hr_finance" ON public.payroll_paye_brackets
FOR ALL TO authenticated
USING (
  has_role(auth.uid(),'super_admin'::app_role)
  OR ((has_role(auth.uid(),'hr'::app_role) OR can_finance(auth.uid())) AND has_casino_scope(auth.uid(), casino_id))
)
WITH CHECK (
  has_role(auth.uid(),'super_admin'::app_role)
  OR ((has_role(auth.uid(),'hr'::app_role) OR can_finance(auth.uid())) AND has_casino_scope(auth.uid(), casino_id))
);