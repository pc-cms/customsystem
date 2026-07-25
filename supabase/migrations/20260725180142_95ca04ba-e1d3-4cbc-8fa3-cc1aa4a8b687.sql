DROP POLICY IF EXISTS "Multi-casino users see dealer attendance" ON public.dealer_attendance;
CREATE POLICY "Multi-casino users see dealer attendance" ON public.dealer_attendance
  FOR SELECT TO authenticated
  USING (public.user_has_casino_access(auth.uid(), casino_id));
