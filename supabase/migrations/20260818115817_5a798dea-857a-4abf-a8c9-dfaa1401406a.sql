DROP POLICY IF EXISTS "ace snapshots readable by management" ON public.ace_finance_snapshots;
CREATE POLICY "ace snapshots readable by scoped management"
ON public.ace_finance_snapshots FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'super_admin'::app_role)
  OR (
    (has_role(auth.uid(), 'finance_manager'::app_role)
      OR has_role(auth.uid(), 'general_manager'::app_role)
      OR has_role(auth.uid(), 'boss'::app_role)
      OR has_role(auth.uid(), 'manager'::app_role)
      OR has_role(auth.uid(), 'shift_manager'::app_role))
    AND casino_id IS NOT NULL
    AND has_casino_scope(auth.uid(), casino_id)
  )
);

DROP POLICY IF EXISTS "box_config authenticated read" ON public.box_config;
CREATE POLICY "box_config super_admin read"
ON public.box_config FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'super_admin'::app_role));