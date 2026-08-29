CREATE OR REPLACE FUNCTION public.prevent_transaction_modify()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  -- Seed mode bypass (used by initial seed import).
  IF current_setting('app.seed_mode', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- HR employee deletion: allow cleanup of breaklist audit rows that cascade
  -- from the employee's breaklist entries.
  IF current_setting('app.hr_unlink_employee', true) = '1'
     AND TG_TABLE_NAME = 'breaklist_logs' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- DELETE is always forbidden.
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Transactions are immutable and cannot be modified or deleted';
  END IF;

  -- HR employee deletion: allow ONLY unlinking the tips recipient (set to NULL).
  IF TG_OP = 'UPDATE'
     AND current_setting('app.hr_unlink_employee', true) = '1'
     AND TG_TABLE_NAME = 'transactions'
     AND NEW.tips_recipient_employee_id IS NULL
     AND OLD.tips_recipient_employee_id IS NOT NULL
     AND (to_jsonb(NEW) - ARRAY['tips_recipient_employee_id'])
         IS NOT DISTINCT FROM
         (to_jsonb(OLD) - ARRAY['tips_recipient_employee_id'])
  THEN
    RETURN NEW;
  END IF;

  -- Allow ONLY a cancellation transition.
  IF TG_OP = 'UPDATE'
     AND OLD.cancelled_at IS NULL
     AND NEW.cancelled_at IS NOT NULL
     AND (to_jsonb(NEW) - ARRAY['cancelled_at', 'cancelled_by', 'cancel_reason'])
         IS NOT DISTINCT FROM
         (to_jsonb(OLD) - ARRAY['cancelled_at', 'cancelled_by', 'cancel_reason'])
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Transactions are immutable and cannot be modified or deleted';
END;
$function$;

CREATE OR REPLACE FUNCTION public.hr_delete_employee(_employee_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
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
        AND public.has_casino_scope(auth.uid(), _casino))
  ) THEN
    RAISE EXCEPTION 'Not allowed to delete this employee';
  END IF;

  PERFORM set_config('app.skip_rota_lock', '1', true);
  PERFORM set_config('app.hr_unlink_employee', '1', true);

  DELETE FROM public.breaklist_logs WHERE dealer_id = _employee_id;
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

  PERFORM set_config('app.hr_unlink_employee', '0', true);
  PERFORM set_config('app.skip_rota_lock', '0', true);
END;
$function$;