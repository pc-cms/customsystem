ALTER POLICY fdc_write ON public.fin_day_closing USING (
  has_role(auth.uid(), 'super_admin'::app_role)
  OR (has_role(auth.uid(), 'manager'::app_role) AND casino_id = get_user_casino_id(auth.uid()))
  OR (has_role(auth.uid(), 'finance_manager'::app_role) AND casino_id = get_user_casino_id(auth.uid()))
) WITH CHECK (
  has_role(auth.uid(), 'super_admin'::app_role)
  OR (has_role(auth.uid(), 'manager'::app_role) AND casino_id = get_user_casino_id(auth.uid()))
  OR (has_role(auth.uid(), 'finance_manager'::app_role) AND casino_id = get_user_casino_id(auth.uid()))
);

ALTER POLICY fwtx_write ON public.fin_wallet_tx USING (
  has_role(auth.uid(), 'super_admin'::app_role)
  OR (has_role(auth.uid(), 'manager'::app_role) AND casino_id = get_user_casino_id(auth.uid()))
  OR (has_role(auth.uid(), 'finance_manager'::app_role) AND casino_id = get_user_casino_id(auth.uid()))
) WITH CHECK (
  has_role(auth.uid(), 'super_admin'::app_role)
  OR (has_role(auth.uid(), 'manager'::app_role) AND casino_id = get_user_casino_id(auth.uid()))
  OR (has_role(auth.uid(), 'finance_manager'::app_role) AND casino_id = get_user_casino_id(auth.uid()))
);

ALTER POLICY fmc_write ON public.fin_money_change USING (
  has_role(auth.uid(), 'super_admin'::app_role)
  OR (has_role(auth.uid(), 'manager'::app_role) AND casino_id = get_user_casino_id(auth.uid()))
  OR (has_role(auth.uid(), 'finance_manager'::app_role) AND casino_id = get_user_casino_id(auth.uid()))
) WITH CHECK (
  has_role(auth.uid(), 'super_admin'::app_role)
  OR (has_role(auth.uid(), 'manager'::app_role) AND casino_id = get_user_casino_id(auth.uid()))
  OR (has_role(auth.uid(), 'finance_manager'::app_role) AND casino_id = get_user_casino_id(auth.uid()))
);