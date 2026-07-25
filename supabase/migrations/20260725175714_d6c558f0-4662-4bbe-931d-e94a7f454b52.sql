-- Fix RLS on dealer_attendance, chip_snapshots, table_tracker so managers/pit
-- users who switch active casino (multi-casino access) can save. The old
-- policies compared casino_id to profile.casino_id via get_user_casino_id,
-- which fails when the user is writing to a different casino they legitimately
-- have access to via user_casino_access.

-- dealer_attendance
DROP POLICY IF EXISTS "Pit managers insert attendance" ON public.dealer_attendance;
DROP POLICY IF EXISTS "Pit managers update attendance" ON public.dealer_attendance;
CREATE POLICY "Pit managers insert attendance" ON public.dealer_attendance
  FOR INSERT TO authenticated
  WITH CHECK (public.user_has_casino_access(auth.uid(), casino_id)
    AND (public.has_role(auth.uid(), 'pit'::app_role) OR public.is_manager_op(auth.uid())));
CREATE POLICY "Pit managers update attendance" ON public.dealer_attendance
  FOR UPDATE TO authenticated
  USING (public.user_has_casino_access(auth.uid(), casino_id)
    AND (public.has_role(auth.uid(), 'pit'::app_role) OR public.is_manager_op(auth.uid())));

DROP POLICY IF EXISTS "HR insert dealer attendance" ON public.dealer_attendance;
DROP POLICY IF EXISTS "HR update dealer attendance" ON public.dealer_attendance;
CREATE POLICY "HR insert dealer attendance" ON public.dealer_attendance
  FOR INSERT TO authenticated
  WITH CHECK (public.user_has_casino_access(auth.uid(), casino_id) AND public.has_role(auth.uid(), 'hr'::app_role));
CREATE POLICY "HR update dealer attendance" ON public.dealer_attendance
  FOR UPDATE TO authenticated
  USING (public.user_has_casino_access(auth.uid(), casino_id) AND public.has_role(auth.uid(), 'hr'::app_role));

-- chip_snapshots
DROP POLICY IF EXISTS "Users create snapshots" ON public.chip_snapshots;
CREATE POLICY "Users create snapshots" ON public.chip_snapshots
  FOR INSERT TO authenticated
  WITH CHECK (public.user_has_casino_access(auth.uid(), casino_id) AND recorded_by = auth.uid());

-- table_tracker
DROP POLICY IF EXISTS "Pit managers insert tracker" ON public.table_tracker;
DROP POLICY IF EXISTS "Pit managers update tracker" ON public.table_tracker;
CREATE POLICY "Pit managers insert tracker" ON public.table_tracker
  FOR INSERT TO authenticated
  WITH CHECK (public.user_has_casino_access(auth.uid(), casino_id)
    AND (public.has_role(auth.uid(), 'pit'::app_role) OR public.is_manager_op(auth.uid())));
CREATE POLICY "Pit managers update tracker" ON public.table_tracker
  FOR UPDATE TO authenticated
  USING (public.user_has_casino_access(auth.uid(), casino_id)
    AND (public.has_role(auth.uid(), 'pit'::app_role) OR public.is_manager_op(auth.uid())));
