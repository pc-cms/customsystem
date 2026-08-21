DROP POLICY IF EXISTS "Authenticated can read license" ON public.casino_license;
CREATE POLICY "License readable within casino scope"
ON public.casino_license FOR SELECT TO authenticated
USING (public.has_casino_scope(auth.uid(), casino_id));

DROP POLICY IF EXISTS "zones_select_authenticated" ON public.player_daily_zones;
CREATE POLICY "zones_select_casino_scope"
ON public.player_daily_zones FOR SELECT TO authenticated
USING (public.has_casino_scope(auth.uid(), casino_id));

DROP POLICY IF EXISTS "mgmt_rota_read" ON public.management_rota;
CREATE POLICY "mgmt_rota_read"
ON public.management_rota FOR SELECT TO authenticated
USING (public.has_casino_scope(auth.uid(), city_casino_id));

DROP POLICY IF EXISTS "mgmt_slots_read" ON public.management_slots;
CREATE POLICY "mgmt_slots_read"
ON public.management_slots FOR SELECT TO authenticated
USING (public.has_casino_scope(auth.uid(), casino_id));

DROP POLICY IF EXISTS "mgmt_att_read" ON public.management_attendance;
CREATE POLICY "mgmt_att_read"
ON public.management_attendance FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.management_slots s
    WHERE s.id = management_attendance.slot_id
      AND public.has_casino_scope(auth.uid(), s.casino_id)
  )
);