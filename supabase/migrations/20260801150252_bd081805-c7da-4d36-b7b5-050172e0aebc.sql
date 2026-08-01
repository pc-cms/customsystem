CREATE POLICY fmc_update ON public.fin_month_closures
FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role) AND closed_by = auth.uid());

CREATE POLICY fmc_delete ON public.fin_month_closures
FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'super_admin'::app_role));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fin_month_closures TO authenticated;
GRANT ALL ON public.fin_month_closures TO service_role;