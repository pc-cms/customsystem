SELECT public.snapshot_policies(gen_random_uuid(), ARRAY['employees','employee_bank_accounts','payroll_entries','payroll_periods','payroll_settings','payroll_paye_brackets']);

DROP POLICY IF EXISTS "employees_write_hr" ON public.employees;
CREATE POLICY "employees_write_hr" ON public.employees FOR ALL TO authenticated
USING (has_role(auth.uid(), 'super_admin'::app_role) OR ((has_role(auth.uid(), 'hr'::app_role) OR can_manage(auth.uid())) AND casino_id = get_user_casino_id(auth.uid())))
WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role) OR ((has_role(auth.uid(), 'hr'::app_role) OR can_manage(auth.uid())) AND casino_id = get_user_casino_id(auth.uid())));

DROP POLICY IF EXISTS "employees_select_payroll_roles" ON public.employees;
CREATE POLICY "employees_select_payroll_roles" ON public.employees FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'super_admin'::app_role) OR ((can_finance(auth.uid()) OR has_role(auth.uid(), 'hr'::app_role) OR can_manage(auth.uid())) AND casino_id = get_user_casino_id(auth.uid())));

DROP POLICY IF EXISTS "bank_accounts_write_hr" ON public.employee_bank_accounts;
CREATE POLICY "bank_accounts_write_hr" ON public.employee_bank_accounts FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM employees e WHERE e.id = employee_bank_accounts.employee_id AND (has_role(auth.uid(), 'super_admin'::app_role) OR ((has_role(auth.uid(), 'hr'::app_role) OR can_manage(auth.uid())) AND e.casino_id = get_user_casino_id(auth.uid())))))
WITH CHECK (EXISTS (SELECT 1 FROM employees e WHERE e.id = employee_bank_accounts.employee_id AND (has_role(auth.uid(), 'super_admin'::app_role) OR ((has_role(auth.uid(), 'hr'::app_role) OR can_manage(auth.uid())) AND e.casino_id = get_user_casino_id(auth.uid())))));

DROP POLICY IF EXISTS "bank_accounts_select" ON public.employee_bank_accounts;
CREATE POLICY "bank_accounts_select" ON public.employee_bank_accounts FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM employees e WHERE e.id = employee_bank_accounts.employee_id AND (has_role(auth.uid(), 'super_admin'::app_role) OR ((can_finance(auth.uid()) OR has_role(auth.uid(), 'hr'::app_role) OR can_manage(auth.uid())) AND e.casino_id = get_user_casino_id(auth.uid())))));

DROP POLICY IF EXISTS "entries_select" ON public.payroll_entries;
CREATE POLICY "entries_select" ON public.payroll_entries FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'super_admin'::app_role) OR ((can_finance(auth.uid()) OR has_role(auth.uid(), 'hr'::app_role) OR can_manage(auth.uid())) AND casino_id = get_user_casino_id(auth.uid())));

DROP POLICY IF EXISTS "entries_write_hr_draft" ON public.payroll_entries;
CREATE POLICY "entries_write_hr_draft" ON public.payroll_entries FOR ALL TO authenticated
USING (has_role(auth.uid(), 'super_admin'::app_role) OR ((has_role(auth.uid(), 'hr'::app_role) OR can_manage(auth.uid())) AND casino_id = get_user_casino_id(auth.uid()) AND EXISTS (SELECT 1 FROM payroll_periods p WHERE p.id = payroll_entries.period_id AND p.status = 'draft')))
WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role) OR ((has_role(auth.uid(), 'hr'::app_role) OR can_manage(auth.uid())) AND casino_id = get_user_casino_id(auth.uid()) AND EXISTS (SELECT 1 FROM payroll_periods p WHERE p.id = payroll_entries.period_id AND p.status = 'draft')));

DROP POLICY IF EXISTS "periods_select" ON public.payroll_periods;
CREATE POLICY "periods_select" ON public.payroll_periods FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'super_admin'::app_role) OR can_finance(auth.uid()) OR ((has_role(auth.uid(), 'hr'::app_role) OR can_manage(auth.uid())) AND casino_id = get_user_casino_id(auth.uid())));

DROP POLICY IF EXISTS "payroll_settings_select" ON public.payroll_settings;
CREATE POLICY "payroll_settings_select" ON public.payroll_settings FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'super_admin'::app_role) OR can_finance(auth.uid()) OR ((has_role(auth.uid(), 'hr'::app_role) OR can_manage(auth.uid())) AND casino_id = get_user_casino_id(auth.uid())));

DROP POLICY IF EXISTS "paye_brackets_select" ON public.payroll_paye_brackets;
CREATE POLICY "paye_brackets_select" ON public.payroll_paye_brackets FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'super_admin'::app_role) OR can_finance(auth.uid()) OR ((has_role(auth.uid(), 'hr'::app_role) OR can_manage(auth.uid())) AND casino_id = get_user_casino_id(auth.uid())));