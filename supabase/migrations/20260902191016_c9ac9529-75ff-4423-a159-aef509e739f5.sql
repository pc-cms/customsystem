CREATE INDEX IF NOT EXISTS idx_breaklist_logs_dealer ON public.breaklist_logs (dealer_id);
CREATE INDEX IF NOT EXISTS idx_breaklist_employee_only ON public.breaklist (employee_id);
CREATE INDEX IF NOT EXISTS idx_transactions_tips_recipient_all ON public.transactions (tips_recipient_employee_id) WHERE tips_recipient_employee_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.hr_delete_employee(_employee_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '180s'
AS $function$
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
    RAISE EXCEPTION 'Not allowed to delete this employee';
  END IF;

  PERFORM set_config('app.skip_rota_lock', '1', true);
  PERFORM set_config('app.hr_unlink_employee', '1', true);

  DELETE FROM public.breaklist_logs WHERE dealer_id = _employee_id;
  DELETE FROM public.staff_rota WHERE casino_id = _casino AND employee_id = _employee_id;
  DELETE FROM public.pit_rota WHERE casino_id = _casino AND employee_id = _employee_id;
  DELETE FROM public.breaklist WHERE employee_id = _employee_id;
  DELETE FROM public.staff_attendance WHERE casino_id = _casino AND employee_id = _employee_id;
  DELETE FROM public.dealer_attendance WHERE casino_id = _casino AND employee_id = _employee_id;
  DELETE FROM public.staff_warnings WHERE casino_id = _casino AND employee_id = _employee_id;
  DELETE FROM public.weekly_bonus_entries WHERE casino_id = _casino AND employee_id = _employee_id;
  DELETE FROM public.monthly_tips_entries WHERE casino_id = _casino AND employee_id = _employee_id;

  UPDATE public.transactions SET tips_recipient_employee_id = NULL
    WHERE tips_recipient_employee_id = _employee_id;
  UPDATE public.payroll_entries SET employee_id = NULL
    WHERE employee_id = _employee_id;

  DELETE FROM public.employees WHERE id = _employee_id;

  PERFORM set_config('app.hr_unlink_employee', '0', true);
  PERFORM set_config('app.skip_rota_lock', '0', true);
END;
$function$;