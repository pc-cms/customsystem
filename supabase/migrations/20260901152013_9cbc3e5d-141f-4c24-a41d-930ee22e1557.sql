DROP POLICY IF EXISTS fmo_read ON public.fin_month_opening;
CREATE POLICY fmo_read ON public.fin_month_opening
  FOR SELECT
  USING (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.can_finance(auth.uid())
    OR public.has_casino_scope(auth.uid(), casino_id)
  );
GRANT SELECT ON public.fin_month_opening TO authenticated;
GRANT ALL ON public.fin_month_opening TO service_role;