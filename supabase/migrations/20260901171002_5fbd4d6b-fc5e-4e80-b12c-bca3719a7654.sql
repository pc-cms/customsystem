DROP POLICY IF EXISTS employees_write_hr ON public.employees;

CREATE POLICY employees_write_hr ON public.employees
FOR ALL
USING (
  has_role(auth.uid(), 'super_admin'::app_role)
  OR (
    (
      has_role(auth.uid(), 'hr'::app_role)
      OR can_manage(auth.uid())
      OR has_role(auth.uid(), 'shift_manager'::app_role)
    )
    AND has_casino_scope(auth.uid(), casino_id)
  )
)
WITH CHECK (
  has_role(auth.uid(), 'super_admin'::app_role)
  OR (
    (
      has_role(auth.uid(), 'hr'::app_role)
      OR can_manage(auth.uid())
      OR has_role(auth.uid(), 'shift_manager'::app_role)
    )
    AND has_casino_scope(auth.uid(), casino_id)
  )
);