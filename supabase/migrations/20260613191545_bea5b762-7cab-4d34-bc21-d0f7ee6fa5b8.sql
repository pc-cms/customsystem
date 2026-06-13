DROP POLICY IF EXISTS "Authorized roles update players" ON public.players;

CREATE POLICY "Authorized roles update players"
ON public.players
FOR UPDATE
USING (
  has_role(auth.uid(), 'reception'::app_role)
  OR has_role(auth.uid(), 'pit'::app_role)
  OR has_role(auth.uid(), 'floor_manager'::app_role)
  OR has_role(auth.uid(), 'cashier'::app_role)
  OR has_role(auth.uid(), 'cashier_slots'::app_role)
  OR has_role(auth.uid(), 'manager'::app_role)
  OR has_role(auth.uid(), 'super_admin'::app_role)
  OR has_role(auth.uid(), 'finance_manager'::app_role)
  OR has_role(auth.uid(), 'account_manager'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), 'reception'::app_role)
  OR has_role(auth.uid(), 'pit'::app_role)
  OR has_role(auth.uid(), 'floor_manager'::app_role)
  OR has_role(auth.uid(), 'cashier'::app_role)
  OR has_role(auth.uid(), 'cashier_slots'::app_role)
  OR has_role(auth.uid(), 'manager'::app_role)
  OR has_role(auth.uid(), 'super_admin'::app_role)
  OR has_role(auth.uid(), 'finance_manager'::app_role)
  OR has_role(auth.uid(), 'account_manager'::app_role)
);