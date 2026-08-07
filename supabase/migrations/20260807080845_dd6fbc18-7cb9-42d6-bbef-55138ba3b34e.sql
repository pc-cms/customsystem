CREATE OR REPLACE FUNCTION public.hr_delete_employee(_employee_id uuid)
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
    OR ((has_role(auth.uid(), 'hr'::app_role) OR can_manage(auth.uid()))
        AND _casino = get_user_casino_id(auth.uid()))
  ) THEN
    RAISE EXCEPTION 'Not allowed to delete this employee';
  END IF;

  DELETE FROM public.staff_rota WHERE employee_id = _employee_id;
  DELETE FROM public.pit_rota WHERE employee_id = _employee_id;
  DELETE FROM public.breaklist WHERE employee_id = _employee_id;
  DELETE FROM public.staff_attendance WHERE employee_id = _employee_id;
  DELETE FROM public.dealer_attendance WHERE employee_id = _employee_id;
  DELETE FROM public.staff_warnings WHERE employee_id = _employee_id;
  DELETE FROM public.weekly_bonus_entries WHERE employee_id = _employee_id;
  DELETE FROM public.monthly_tips_entries WHERE employee_id = _employee_id;

  DELETE FROM public.employees WHERE id = _employee_id;
END;
$$;

REVOKE ALL ON FUNCTION public.hr_delete_employee(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_delete_employee(uuid) TO authenticated;