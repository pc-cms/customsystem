
CREATE POLICY "Super admins insert chip baseline"
  ON public.chip_baseline FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Super admins update chip baseline"
  ON public.chip_baseline FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Super admins delete chip baseline"
  ON public.chip_baseline FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role));
