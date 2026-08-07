CREATE OR REPLACE FUNCTION public.guard_staff_rota_lock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _date date; _casino uuid; _emp uuid; _scope text;
BEGIN
  IF current_setting('app.skip_rota_lock', true) = '1' THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  IF TG_OP = 'DELETE' THEN _date := OLD.date; _casino := OLD.casino_id; _emp := OLD.employee_id;
  ELSE _date := NEW.date; _casino := NEW.casino_id; _emp := NEW.employee_id; END IF;
  _scope := COALESCE(public.staff_rota_scope(_emp), 'floor');
  IF EXISTS (SELECT 1 FROM public.rota_locks
             WHERE casino_id = _casino AND scope = _scope
               AND month = date_trunc('month', _date)::date) THEN
    RAISE EXCEPTION 'Rota is locked for this month' USING ERRCODE = 'check_violation';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $function$;

CREATE OR REPLACE FUNCTION public.guard_pit_rota_lock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _date date; _casino uuid;
BEGIN
  IF current_setting('app.skip_rota_lock', true) = '1' THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  IF TG_OP = 'DELETE' THEN _date := OLD.date; _casino := OLD.casino_id;
  ELSE _date := NEW.date; _casino := NEW.casino_id; END IF;
  IF EXISTS (SELECT 1 FROM public.rota_locks
             WHERE casino_id = _casino AND scope = 'pit'
               AND month = date_trunc('month', _date)::date) THEN
    RAISE EXCEPTION 'Rota is locked for this month' USING ERRCODE = 'check_violation';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $function$;

CREATE OR REPLACE FUNCTION public.hr_delete_employee(_employee_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
    OR ((has_role(auth.uid(), 'hr'::app_role) OR can_manage(auth.uid()))
        AND _casino = get_user_casino_id(auth.uid()))
  ) THEN
    RAISE EXCEPTION 'Not allowed to delete this employee';
  END IF;

  -- Administrative deletion bypasses monthly rota locks for this transaction only.
  PERFORM set_config('app.skip_rota_lock', '1', true);

  DELETE FROM public.staff_rota WHERE employee_id = _employee_id;
  DELETE FROM public.pit_rota WHERE employee_id = _employee_id;
  DELETE FROM public.breaklist WHERE employee_id = _employee_id;
  DELETE FROM public.staff_attendance WHERE employee_id = _employee_id;
  DELETE FROM public.dealer_attendance WHERE employee_id = _employee_id;
  DELETE FROM public.staff_warnings WHERE employee_id = _employee_id;
  DELETE FROM public.weekly_bonus_entries WHERE employee_id = _employee_id;
  DELETE FROM public.monthly_tips_entries WHERE employee_id = _employee_id;

  UPDATE public.transactions SET tips_recipient_employee_id = NULL
    WHERE tips_recipient_employee_id = _employee_id;
  UPDATE public.payroll_entries SET employee_id = NULL
    WHERE employee_id = _employee_id;

  DELETE FROM public.employees WHERE id = _employee_id;

  PERFORM set_config('app.skip_rota_lock', '0', true);
END;
$function$;