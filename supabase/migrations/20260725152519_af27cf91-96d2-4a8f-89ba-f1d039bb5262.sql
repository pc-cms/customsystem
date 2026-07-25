
-- expenses: add boss (multi-casino via user_casino_access)
DROP POLICY IF EXISTS "Boss sees assigned casino expenses" ON public.expenses;
CREATE POLICY "Boss sees assigned casino expenses" ON public.expenses
  FOR SELECT USING (has_role(auth.uid(),'boss'::app_role) AND user_has_casino_access(auth.uid(), casino_id));

-- fin_budget
DROP POLICY IF EXISTS "fb_read_boss" ON public.fin_budget;
CREATE POLICY "fb_read_boss" ON public.fin_budget
  FOR SELECT USING (has_role(auth.uid(),'boss'::app_role) AND user_has_casino_access(auth.uid(), casino_id));

-- fin_other_incomes
DROP POLICY IF EXISTS "foi_read_boss" ON public.fin_other_incomes;
CREATE POLICY "foi_read_boss" ON public.fin_other_incomes
  FOR SELECT USING (has_role(auth.uid(),'boss'::app_role) AND user_has_casino_access(auth.uid(), casino_id));

-- fin_wallet_tx
DROP POLICY IF EXISTS "fwtx_read_boss" ON public.fin_wallet_tx;
CREATE POLICY "fwtx_read_boss" ON public.fin_wallet_tx
  FOR SELECT USING (has_role(auth.uid(),'boss'::app_role) AND user_has_casino_access(auth.uid(), casino_id));
