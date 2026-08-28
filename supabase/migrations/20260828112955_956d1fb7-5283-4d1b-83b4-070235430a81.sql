CREATE OR REPLACE FUNCTION public.payroll_update_period_meta(
  _period_id uuid,
  _payment_description text DEFAULT NULL,
  _branch_label text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_p public.payroll_periods%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

  SELECT * INTO v_p FROM public.payroll_periods WHERE id = _period_id;
  IF v_p.id IS NULL THEN RAISE EXCEPTION 'Period not found'; END IF;

  IF NOT (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR ((public.has_role(auth.uid(), 'hr'::app_role)
         OR public.can_finance(auth.uid())
         OR public.can_manage(auth.uid()))
        AND public.has_casino_scope(auth.uid(), v_p.casino_id))
  ) THEN
    RAISE EXCEPTION 'Not allowed to edit this period';
  END IF;

  IF v_p.status IN ('locked','paid') AND NOT public.has_role(auth.uid(), 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'Period is locked';
  END IF;

  UPDATE public.payroll_periods
     SET payment_description = COALESCE(_payment_description, payment_description),
         branch_label        = COALESCE(_branch_label, branch_label)
   WHERE id = _period_id;
END;
$function$;

DROP POLICY IF EXISTS mgmt_rota_write ON public.management_rota;
CREATE POLICY mgmt_rota_write ON public.management_rota
FOR ALL
USING (
  is_manager_op(auth.uid())
  OR has_role(auth.uid(), 'general_manager'::app_role)
  OR has_role(auth.uid(), 'hr'::app_role)
  OR is_super_admin(auth.uid())
  OR (has_role(auth.uid(), 'surveillance'::app_role) AND EXISTS (
        SELECT 1 FROM management_slots s WHERE s.id = management_rota.slot_id AND s.block = 'cctv'))
)
WITH CHECK (
  is_manager_op(auth.uid())
  OR has_role(auth.uid(), 'general_manager'::app_role)
  OR has_role(auth.uid(), 'hr'::app_role)
  OR is_super_admin(auth.uid())
  OR (has_role(auth.uid(), 'surveillance'::app_role) AND EXISTS (
        SELECT 1 FROM management_slots s WHERE s.id = management_rota.slot_id AND s.block = 'cctv'))
);

DROP POLICY IF EXISTS mgmt_att_write ON public.management_attendance;
CREATE POLICY mgmt_att_write ON public.management_attendance
FOR ALL
USING (
  is_manager_op(auth.uid())
  OR has_role(auth.uid(), 'general_manager'::app_role)
  OR has_role(auth.uid(), 'hr'::app_role)
  OR is_super_admin(auth.uid())
  OR (has_role(auth.uid(), 'surveillance'::app_role) AND EXISTS (
        SELECT 1 FROM management_slots s WHERE s.id = management_attendance.slot_id AND s.block = 'cctv'))
)
WITH CHECK (
  is_manager_op(auth.uid())
  OR has_role(auth.uid(), 'general_manager'::app_role)
  OR has_role(auth.uid(), 'hr'::app_role)
  OR is_super_admin(auth.uid())
  OR (has_role(auth.uid(), 'surveillance'::app_role) AND EXISTS (
        SELECT 1 FROM management_slots s WHERE s.id = management_attendance.slot_id AND s.block = 'cctv'))
);

DROP POLICY IF EXISTS mgmt_slots_write ON public.management_slots;
CREATE POLICY mgmt_slots_write ON public.management_slots
FOR ALL
USING (
  is_manager_op(auth.uid())
  OR has_role(auth.uid(), 'general_manager'::app_role)
  OR has_role(auth.uid(), 'hr'::app_role)
  OR is_super_admin(auth.uid())
  OR (block = 'cctv' AND has_role(auth.uid(), 'surveillance'::app_role))
)
WITH CHECK (
  is_manager_op(auth.uid())
  OR has_role(auth.uid(), 'general_manager'::app_role)
  OR has_role(auth.uid(), 'hr'::app_role)
  OR is_super_admin(auth.uid())
  OR (block = 'cctv' AND has_role(auth.uid(), 'surveillance'::app_role))
);