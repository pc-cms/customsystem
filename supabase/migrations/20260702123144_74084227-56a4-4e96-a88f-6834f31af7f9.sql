
CREATE POLICY "Super admins insert pit rota" ON public.pit_rota FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY "Super admins update pit rota" ON public.pit_rota FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY "Super admins delete pit rota" ON public.pit_rota FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role));
