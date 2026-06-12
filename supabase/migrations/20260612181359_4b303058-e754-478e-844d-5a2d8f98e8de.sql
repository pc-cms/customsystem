DROP POLICY IF EXISTS "Casino users see chip colors" ON public.chip_color_settings;
DROP POLICY IF EXISTS "Super admins see all chip colors" ON public.chip_color_settings;
DROP POLICY IF EXISTS "Admins/managers insert chip colors" ON public.chip_color_settings;
DROP POLICY IF EXISTS "Admins/managers update chip colors" ON public.chip_color_settings;

CREATE POLICY "Authenticated read chip colors"
  ON public.chip_color_settings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins/managers insert chip colors"
  ON public.chip_color_settings FOR INSERT
  TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'super_admin'::app_role)
    OR (
      (
        has_role(auth.uid(), 'manager'::app_role)
        OR has_role(auth.uid(), 'finance_manager'::app_role)
      )
      AND (
        casino_id = get_user_casino_id(auth.uid())
        OR casino_id IN (SELECT uca.casino_id FROM public.user_casino_access uca WHERE uca.user_id = auth.uid())
      )
    )
  );

CREATE POLICY "Admins/managers update chip colors"
  ON public.chip_color_settings FOR UPDATE
  TO authenticated
  USING (
    has_role(auth.uid(), 'super_admin'::app_role)
    OR (
      (
        has_role(auth.uid(), 'manager'::app_role)
        OR has_role(auth.uid(), 'finance_manager'::app_role)
      )
      AND (
        casino_id = get_user_casino_id(auth.uid())
        OR casino_id IN (SELECT uca.casino_id FROM public.user_casino_access uca WHERE uca.user_id = auth.uid())
      )
    )
  )
  WITH CHECK (
    has_role(auth.uid(), 'super_admin'::app_role)
    OR (
      (
        has_role(auth.uid(), 'manager'::app_role)
        OR has_role(auth.uid(), 'finance_manager'::app_role)
      )
      AND (
        casino_id = get_user_casino_id(auth.uid())
        OR casino_id IN (SELECT uca.casino_id FROM public.user_casino_access uca WHERE uca.user_id = auth.uid())
      )
    )
  );
