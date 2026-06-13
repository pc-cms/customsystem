DROP POLICY IF EXISTS "Cashier/manager insert cashless" ON public.cashless_transactions;
CREATE POLICY "Cashier/manager insert cashless" ON public.cashless_transactions
FOR INSERT TO authenticated
WITH CHECK (
  casino_id = get_user_casino_id(auth.uid())
  AND operator_id = auth.uid()
  AND (
    has_role(auth.uid(), 'cashier'::app_role)
    OR has_role(auth.uid(), 'cashier_slots'::app_role)
    OR is_manager_op(auth.uid())
  )
);

DROP POLICY IF EXISTS "Casino cash/manager see cashless" ON public.cashless_transactions;
CREATE POLICY "Casino cash/manager see cashless" ON public.cashless_transactions
FOR SELECT TO authenticated
USING (
  casino_id = get_user_casino_id(auth.uid())
  AND (
    has_role(auth.uid(), 'cashier'::app_role)
    OR has_role(auth.uid(), 'cashier_slots'::app_role)
    OR is_manager_op(auth.uid())
    OR has_role(auth.uid(), 'finance_manager'::app_role)
  )
);