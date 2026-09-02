ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid;

CREATE INDEX IF NOT EXISTS idx_employees_deleted_at ON public.employees (casino_id, deleted_at);

CREATE OR REPLACE FUNCTION public.hr_delete_employee(_employee_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '180s'
AS $$
DECLARE
  _casino uuid;
  _today date := (now() AT TIME ZONE 'Africa/Dar_es_Salaam')::date;
BEGIN
  SELECT casino_id INTO _casino FROM public.employees WHERE id = _employee_id;
  IF _casino IS NULL THEN
    RAISE EXCEPTION 'Employee not found';
  END IF;

  IF NOT (
    has_role(auth.uid(), 'super_admin'::app_role)
    OR ((has_role(auth.uid(), 'hr'::app_role)
         OR can_manage(auth.uid())
         OR has_role(auth.uid(), 'shift_manager'::app_role))
        AND public.has_casino_scope(auth.uid(), _casino))
  ) THEN
    RAISE EXCEPTION 'Not allowed to delete this employee';
  END IF;

  PERFORM set_config('app.skip_rota_lock', '1', true);
  PERFORM set_config('app.hr_unlink_employee', '1', true);

  -- remove only future planning entries; all history is preserved
  DELETE FROM public.staff_rota WHERE casino_id = _casino AND employee_id = _employee_id AND date >= _today;
  DELETE FROM public.pit_rota   WHERE casino_id = _casino AND employee_id = _employee_id AND date >= _today;
  DELETE FROM public.breaklist  WHERE employee_id = _employee_id AND date >= _today;

  UPDATE public.employees
     SET deleted_at = now(),
         deleted_by = auth.uid(),
         termination_date = COALESCE(termination_date, _today),
         updated_at = now()
   WHERE id = _employee_id;

  PERFORM set_config('app.hr_unlink_employee', '0', true);
  PERFORM set_config('app.skip_rota_lock', '0', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.hr_restore_employee(_employee_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _casino uuid;
BEGIN
  SELECT casino_id INTO _casino FROM public.employees WHERE id = _employee_id;
  IF _casino IS NULL THEN
    RAISE EXCEPTION 'Employee not found';
  END IF;

  IF NOT (
    has_role(auth.uid(), 'super_admin'::app_role)
    OR ((has_role(auth.uid(), 'hr'::app_role)
         OR can_manage(auth.uid())
         OR has_role(auth.uid(), 'shift_manager'::app_role))
        AND public.has_casino_scope(auth.uid(), _casino))
  ) THEN
    RAISE EXCEPTION 'Not allowed to restore this employee';
  END IF;

  UPDATE public.employees
     SET deleted_at = NULL,
         deleted_by = NULL,
         termination_date = NULL,
         updated_at = now()
   WHERE id = _employee_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.hr_restore_employee(uuid) TO authenticated;