DROP POLICY IF EXISTS "Managers insert chip colors" ON public.chip_color_settings;
DROP POLICY IF EXISTS "Managers update chip colors" ON public.chip_color_settings;

CREATE POLICY "Admins/managers insert chip colors"
  ON public.chip_color_settings FOR INSERT
  WITH CHECK (
    casino_id = get_user_casino_id(auth.uid())
    AND (
      has_role(auth.uid(), 'manager'::app_role)
      OR has_role(auth.uid(), 'super_admin'::app_role)
    )
  );

CREATE POLICY "Admins/managers update chip colors"
  ON public.chip_color_settings FOR UPDATE
  USING (
    casino_id = get_user_casino_id(auth.uid())
    AND (
      has_role(auth.uid(), 'manager'::app_role)
      OR has_role(auth.uid(), 'super_admin'::app_role)
    )
  );