CREATE OR REPLACE FUNCTION public.payroll_refresh_period(_period_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_period RECORD;
  v_start DATE;
  v_end DATE;
  v_days_in_month INT;
  v_working_days INT;
  v_added INT := 0;
  v_updated INT := 0;
  v_removed INT := 0;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

  SELECT * INTO v_period FROM public.payroll_periods WHERE id = _period_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Period not found'; END IF;
  IF v_period.status = 'locked' THEN RAISE EXCEPTION 'Period is locked'; END IF;

  IF NOT (public.has_role(auth.uid(),'hr'::app_role)
          OR public.has_role(auth.uid(),'finance_manager'::app_role)
          OR public.has_role(auth.uid(),'super_admin'::app_role)
          OR public.has_role(auth.uid(),'manager'::app_role)) THEN
    RAISE EXCEPTION 'HR, Manager, Finance Manager or Super Admin role required';
  END IF;

  v_start := make_date(v_period.year, v_period.month, 1);
  v_end := (v_start + INTERVAL '1 month - 1 day')::DATE;
  v_days_in_month := EXTRACT(DAY FROM v_end)::INT;

  SELECT COALESCE(s.working_days, 26) INTO v_working_days
  FROM public.payroll_settings s
  WHERE s.casino_id = v_period.casino_id AND s.effective_from <= v_start
  ORDER BY s.effective_from DESC LIMIT 1;
  v_working_days := COALESCE(v_working_days, 26);

  WITH del AS (
    DELETE FROM public.payroll_entries pe
    USING public.employees e
    WHERE pe.period_id = v_period.id
      AND e.id = pe.employee_id
      AND e.deleted_at IS NOT NULL
    RETURNING 1
  )
  SELECT count(*) INTO v_removed FROM del;

  WITH inserted AS (
    INSERT INTO public.payroll_entries (
      period_id, employee_id, casino_id,
      snapshot_full_name, snapshot_position, snapshot_basic_salary,
      snapshot_account_number, snapshot_bank_code, snapshot_branch_code
    )
    SELECT v_period.id, e.id, e.casino_id,
           e.full_name, e.position, e.basic_salary,
           COALESCE(b.account_number,''), COALESCE(b.bank_code,''), COALESCE(b.branch_code,'')
    FROM public.employees e
    LEFT JOIN public.employee_bank_accounts b ON b.employee_id = e.id AND b.is_primary
    WHERE e.casino_id = v_period.casino_id
      AND e.deleted_at IS NULL
      AND (e.payroll_status = 'active' OR (e.termination_date IS NOT NULL AND e.termination_date BETWEEN v_start AND v_end))
      AND (e.termination_date IS NULL OR e.termination_date >= v_start)
      AND (e.employment_date IS NULL OR e.employment_date <= v_end)
      AND NOT EXISTS (
        SELECT 1 FROM public.payroll_entries pe
        WHERE pe.period_id = v_period.id AND pe.employee_id = e.id
      )
    RETURNING 1
  )
  SELECT count(*) INTO v_added FROM inserted;

  WITH pr AS (
    SELECT e.id AS employee_id,
           GREATEST(0,
             (LEAST(COALESCE(e.termination_date, v_end), v_end)
              - GREATEST(COALESCE(e.employment_date, v_start), v_start) + 1))::INT AS days
    FROM public.employees e
    WHERE e.casino_id = v_period.casino_id
  )
  UPDATE public.payroll_entries pe
  SET prorata_days = LEAST(pr.days, v_days_in_month),
      prorata_factor = ROUND(LEAST(pr.days, v_days_in_month)::NUMERIC / v_days_in_month, 4)
  FROM pr
  WHERE pe.period_id = v_period.id AND pe.employee_id = pr.employee_id;

  WITH att AS (
    SELECT * FROM public.get_monthly_attendance(v_period.casino_id, v_start)
  ),
  rota AS (
    SELECT employee_id, date FROM public.pit_rota
    WHERE casino_id = v_period.casino_id AND date BETWEEN v_start AND v_end
      AND UPPER(COALESCE(shift::text,'')) IN ('N','EN')
    UNION
    SELECT employee_id, date FROM public.staff_rota
    WHERE casino_id = v_period.casino_id AND date BETWEEN v_start AND v_end
      AND UPPER(COALESCE(shift::text,'')) IN ('N','EN')
  ),
  daily AS (
    SELECT a.employee_id, a.d, a.effective_hours, a.is_holiday, a.raw_value,
           (r.employee_id IS NOT NULL) AS is_night,
           ROW_NUMBER() OVER (PARTITION BY a.employee_id
                              ORDER BY CASE WHEN a.effective_hours > 0 THEN 0 ELSE 1 END, a.d) AS worked_rank
    FROM att a
    LEFT JOIN rota r ON r.employee_id = a.employee_id AND r.date = a.d
  ),
  agg AS (
    SELECT d.employee_id,
           SUM(CASE WHEN d.is_holiday THEN d.effective_hours ELSE 0 END)::INT AS holiday_hours,
           SUM(CASE WHEN d.is_holiday AND d.effective_hours > 0 THEN 1 ELSE 0 END)::INT AS holiday_days,
           SUM(CASE WHEN UPPER(COALESCE(d.raw_value,'')) = 'A' THEN 1 ELSE 0 END)::INT AS missing_days,
           SUM(CASE WHEN d.effective_hours > 0 THEN 1 ELSE 0 END)::INT AS worked_days,
           COALESCE(SUM(d.effective_hours), 0)::NUMERIC AS worked_hours,
           SUM(CASE WHEN d.is_night AND d.effective_hours > 0 THEN 1 ELSE 0 END)::INT AS night_days,
           COALESCE(SUM(CASE WHEN d.is_night THEN d.effective_hours ELSE 0 END), 0)::NUMERIC AS night_hours,
           SUM(CASE WHEN d.effective_hours > 0 AND d.worked_rank > v_working_days THEN 1 ELSE 0 END)::INT AS off_days,
           COALESCE(SUM(CASE WHEN d.effective_hours > 0 AND d.worked_rank > v_working_days
                             THEN d.effective_hours ELSE 0 END), 0)::NUMERIC AS off_days_hours
    FROM daily d
    GROUP BY d.employee_id
  ),
  upd AS (
    UPDATE public.payroll_entries pe
    SET hrs_worked_on_holiday = COALESCE(agg.holiday_hours, 0),
        public_holiday_worked = COALESCE(agg.holiday_days, 0),
        missing_days = COALESCE(agg.missing_days, 0),
        worked_days = COALESCE(agg.worked_days, 0),
        worked_hours = COALESCE(agg.worked_hours, 0),
        night_days = COALESCE(agg.night_days, 0),
        night_allowance_hours = COALESCE(agg.night_hours, 0),
        off_days = COALESCE(agg.off_days, 0),
        off_days_hours = COALESCE(agg.off_days_hours, 0),
        updated_at = now()
    FROM agg
    WHERE pe.period_id = v_period.id AND pe.employee_id = agg.employee_id
    RETURNING 1
  )
  SELECT count(*) INTO v_updated FROM upd;

  DELETE FROM public.staff_loan_payments WHERE period_id = v_period.id;

  WITH due AS (
    SELECT l.id AS loan_id, l.employee_id,
           LEAST(
             l.monthly_installment,
             GREATEST(l.principal - COALESCE((
               SELECT SUM(p.amount) FROM public.staff_loan_payments p WHERE p.loan_id = l.id
             ), 0), 0)
           ) AS amount
    FROM public.staff_loans l
    WHERE l.casino_id = v_period.casino_id
      AND l.status = 'active'
      AND make_date(l.start_year, l.start_month, 1) <= v_start
  ),
  ins AS (
    INSERT INTO public.staff_loan_payments (loan_id, period_id, amount)
    SELECT due.loan_id, v_period.id, due.amount FROM due WHERE due.amount > 0
    RETURNING loan_id, amount
  ),
  per_emp AS (
    SELECT d.employee_id, SUM(i.amount) AS total
    FROM ins i JOIN due d ON d.loan_id = i.loan_id
    GROUP BY d.employee_id
  )
  UPDATE public.payroll_entries pe
  SET loan_installment = COALESCE(per_emp.total, 0)
  FROM per_emp
  WHERE pe.period_id = v_period.id AND pe.employee_id = per_emp.employee_id;

  UPDATE public.payroll_entries pe
  SET loan_installment = 0
  WHERE pe.period_id = v_period.id
    AND pe.loan_installment > 0
    AND NOT EXISTS (
      SELECT 1 FROM public.staff_loan_payments p
      JOIN public.staff_loans l ON l.id = p.loan_id
      WHERE p.period_id = v_period.id AND l.employee_id = pe.employee_id
    );

  INSERT INTO public.payroll_audit_log(period_id, casino_id, action, actor_id, details)
  VALUES (v_period.id, v_period.casino_id, 'refresh_period', auth.uid(),
          jsonb_build_object('added', v_added, 'updated', v_updated, 'removed', v_removed));

  RETURN jsonb_build_object('added', v_added, 'updated', v_updated, 'removed', v_removed);
END;
$function$;