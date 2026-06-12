
DROP POLICY IF EXISTS "Admins/managers insert chip colors" ON public.chip_color_settings;
DROP POLICY IF EXISTS "Admins/managers update chip colors" ON public.chip_color_settings;

CREATE POLICY "Admins/managers insert chip colors"
ON public.chip_color_settings FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'super_admin'::app_role)
  OR (casino_id = get_user_casino_id(auth.uid())
      AND has_role(auth.uid(), 'manager'::app_role))
);

CREATE POLICY "Admins/managers update chip colors"
ON public.chip_color_settings FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'super_admin'::app_role)
  OR (casino_id = get_user_casino_id(auth.uid())
      AND has_role(auth.uid(), 'manager'::app_role))
)
WITH CHECK (
  has_role(auth.uid(), 'super_admin'::app_role)
  OR (casino_id = get_user_casino_id(auth.uid())
      AND has_role(auth.uid(), 'manager'::app_role))
);

UPDATE public.chip_color_settings SET id = id WHERE false;
