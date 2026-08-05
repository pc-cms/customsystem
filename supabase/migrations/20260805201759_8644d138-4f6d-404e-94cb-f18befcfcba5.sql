-- 1) staff_attendance: allow multi-casino access (granted casinos), not just home casino
DROP POLICY IF EXISTS "HR insert staff attendance" ON public.staff_attendance;
DROP POLICY IF EXISTS "HR update staff attendance" ON public.staff_attendance;
DROP POLICY IF EXISTS "Managers insert staff attendance" ON public.staff_attendance;
DROP POLICY IF EXISTS "Managers update staff attendance" ON public.staff_attendance;
DROP POLICY IF EXISTS "Pit insert staff attendance" ON public.staff_attendance;
DROP POLICY IF EXISTS "Pit update staff attendance" ON public.staff_attendance;

CREATE POLICY "Attendance writers insert" ON public.staff_attendance
FOR INSERT TO authenticated
WITH CHECK (
  (
    casino_id = public.get_user_casino_id(auth.uid())
    OR public.user_has_casino_access(auth.uid(), casino_id)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  )
  AND (
    public.is_manager_op(auth.uid())
    OR public.has_role(auth.uid(), 'hr'::app_role)
    OR public.has_role(auth.uid(), 'pit'::app_role)
    OR public.has_role(auth.uid(), 'general_manager'::app_role)
  )
);

CREATE POLICY "Attendance writers update" ON public.staff_attendance
FOR UPDATE TO authenticated
USING (
  (
    casino_id = public.get_user_casino_id(auth.uid())
    OR public.user_has_casino_access(auth.uid(), casino_id)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  )
  AND (
    public.is_manager_op(auth.uid())
    OR public.has_role(auth.uid(), 'hr'::app_role)
    OR public.has_role(auth.uid(), 'pit'::app_role)
    OR public.has_role(auth.uid(), 'general_manager'::app_role)
  )
);

-- 2) fin_audit_log: managers / GM / boss may append audit entries
DROP POLICY IF EXISTS "fal_ins" ON public.fin_audit_log;
CREATE POLICY "fal_ins" ON public.fin_audit_log
FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'super_admin'::app_role)
  OR public.can_finance(auth.uid())
  OR public.can_manage(auth.uid())
  OR public.has_role(auth.uid(), 'general_manager'::app_role)
  OR public.has_role(auth.uid(), 'boss'::app_role)
);
