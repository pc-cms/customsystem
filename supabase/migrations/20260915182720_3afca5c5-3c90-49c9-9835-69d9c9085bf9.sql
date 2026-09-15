CREATE OR REPLACE FUNCTION public.payroll_apply_advances(_period_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_period RECORD;
BEGIN
  SELECT * INTO v_period FROM public.payroll_periods WHERE id = _period_id;
  IF NOT FOUND OR v_period.status = 'locked' THEN RETURN; END IF;

  WITH adv AS (
    SELECT a.employee_id, SUM(a.amount)::BIGINT AS total
    FROM public.staff_advances a
    WHERE a.casino_id = v_period.casino_id
      AND a.year = v_period.year AND a.month = v_period.month
    GROUP BY a.employee_id
  )
  UPDATE public.payroll_entries pe
  SET salary_advances = adv.total, updated_at = now()
  FROM adv
  WHERE pe.period_id = v_period.id AND pe.employee_id = adv.employee_id
    AND pe.salary_advances IS DISTINCT FROM adv.total;

  -- employees whose advances were removed this month fall back to zero
  UPDATE public.payroll_entries pe
  SET salary_advances = 0, updated_at = now()
  WHERE pe.period_id = v_period.id
    AND pe.salary_advances > 0
    AND EXISTS (
      SELECT 1 FROM public.payroll_audit_log l
      WHERE l.period_id = v_period.id AND l.action = 'advances_applied'
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.staff_advances a
      WHERE a.casino_id = v_period.casino_id AND a.year = v_period.year
        AND a.month = v_period.month AND a.employee_id = pe.employee_id
    );

  INSERT INTO public.payroll_audit_log(period_id, casino_id, action, actor_id, details)
  VALUES (v_period.id, v_period.casino_id, 'advances_applied', auth.uid(), '{}'::jsonb);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.payroll_apply_advances(uuid) FROM anon;