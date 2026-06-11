-- Fix 2 critical security findings on public-schema tables

-- === FIX 1: employee_bank_accounts SELECT policy ===
DROP POLICY IF EXISTS "bank_accounts_select" ON public.employee_bank_accounts;

CREATE POLICY "bank_accounts_select"
  ON public.employee_bank_accounts
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM employees e
      WHERE e.id = employee_bank_accounts.employee_id
        AND (
          has_role(auth.uid(), 'super_admin')
          OR (
            has_role(auth.uid(), 'finance_manager')
            AND e.casino_id = get_user_casino_id(auth.uid())
          )
          OR (
            has_role(auth.uid(), 'hr')
            AND e.casino_id = get_user_casino_id(auth.uid())
          )
        )
    )
  );

-- === FIX 2: user_roles manager insert policy ===
DROP POLICY IF EXISTS "Managers insert roles for same casino" ON public.user_roles;

CREATE POLICY "Managers insert roles for same casino"
  ON public.user_roles
  FOR INSERT
  TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'manager')
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.user_id = user_roles.user_id
        AND p.casino_id = get_user_casino_id(auth.uid())
    )
    AND role IN (
      'cashier',
      'pit',
      'manager',
      'reception',
      'surveillance',
      'floor_manager',
      'cashier_slots',
      'pos_waiter',
      'pos_bartender',
      'pos_manager'
    )
  );
