DROP POLICY IF EXISTS entries_select ON payroll_entries;

CREATE POLICY entries_select
  ON payroll_entries
  FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(), 'super_admin'::app_role)
    OR (
      has_role(auth.uid(), 'finance_manager'::app_role)
      AND casino_id = get_user_casino_id(auth.uid())
    )
    OR (
      has_role(auth.uid(), 'hr'::app_role)
      AND casino_id = get_user_casino_id(auth.uid())
    )
  );