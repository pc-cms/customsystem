ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS termination_date date;

ALTER TABLE public.payroll_settings
  ADD COLUMN IF NOT EXISTS overtime_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS overtime_multiplier numeric(5,2) NOT NULL DEFAULT 1.50,
  ADD COLUMN IF NOT EXISTS prorata_enabled boolean NOT NULL DEFAULT true;

ALTER TABLE public.payroll_entries
  ADD COLUMN IF NOT EXISTS overtime_hours numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS overtime_amount bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS prorata_factor numeric(6,4) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS prorata_days integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS loan_installment bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_clamped boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.staff_loans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  casino_id uuid NOT NULL REFERENCES public.casinos(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'loan',
  principal bigint NOT NULL DEFAULT 0,
  monthly_installment bigint NOT NULL DEFAULT 0,
  start_year integer NOT NULL,
  start_month integer NOT NULL CHECK (start_month BETWEEN 1 AND 12),
  status text NOT NULL DEFAULT 'active',
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_loans TO authenticated;
GRANT ALL ON public.staff_loans TO service_role;
ALTER TABLE public.staff_loans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_loans_select" ON public.staff_loans FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(),'super_admin'::app_role)
  OR public.can_finance(auth.uid())
  OR ((public.has_role(auth.uid(),'hr'::app_role) OR public.can_manage(auth.uid())) AND public.has_casino_scope(auth.uid(), casino_id))
);

CREATE POLICY "staff_loans_write" ON public.staff_loans FOR ALL TO authenticated
USING (
  public.has_role(auth.uid(),'super_admin'::app_role)
  OR ((public.has_role(auth.uid(),'hr'::app_role) OR public.can_finance(auth.uid()) OR public.can_manage(auth.uid())) AND public.has_casino_scope(auth.uid(), casino_id))
)
WITH CHECK (
  public.has_role(auth.uid(),'super_admin'::app_role)
  OR ((public.has_role(auth.uid(),'hr'::app_role) OR public.can_finance(auth.uid()) OR public.can_manage(auth.uid())) AND public.has_casino_scope(auth.uid(), casino_id))
);

CREATE TRIGGER trg_staff_loans_updated_at BEFORE UPDATE ON public.staff_loans
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.staff_loan_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id uuid NOT NULL REFERENCES public.staff_loans(id) ON DELETE CASCADE,
  period_id uuid NOT NULL REFERENCES public.payroll_periods(id) ON DELETE CASCADE,
  amount bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (loan_id, period_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_loan_payments TO authenticated;
GRANT ALL ON public.staff_loan_payments TO service_role;
ALTER TABLE public.staff_loan_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_loan_payments_select" ON public.staff_loan_payments FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.staff_loans l WHERE l.id = loan_id AND (
  public.has_role(auth.uid(),'super_admin'::app_role)
  OR public.can_finance(auth.uid())
  OR ((public.has_role(auth.uid(),'hr'::app_role) OR public.can_manage(auth.uid())) AND public.has_casino_scope(auth.uid(), l.casino_id))
)));

CREATE POLICY "staff_loan_payments_write" ON public.staff_loan_payments FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.staff_loans l WHERE l.id = loan_id AND (
  public.has_role(auth.uid(),'super_admin'::app_role)
  OR ((public.has_role(auth.uid(),'hr'::app_role) OR public.can_finance(auth.uid()) OR public.can_manage(auth.uid())) AND public.has_casino_scope(auth.uid(), l.casino_id))
)))
WITH CHECK (EXISTS (SELECT 1 FROM public.staff_loans l WHERE l.id = loan_id AND (
  public.has_role(auth.uid(),'super_admin'::app_role)
  OR ((public.has_role(auth.uid(),'hr'::app_role) OR public.can_finance(auth.uid()) OR public.can_manage(auth.uid())) AND public.has_casino_scope(auth.uid(), l.casino_id))
)));

CREATE OR REPLACE FUNCTION public.compute_payroll_entry()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_settings public.payroll_settings%ROWTYPE;
  v_period   public.payroll_periods%ROWTYPE;
  v_period_date DATE;
  v_basic NUMERIC;
  v_basic_eff NUMERIC;
  v_factor NUMERIC;
  v_hourly NUMERIC;
  v_holiday NUMERIC;
  v_off NUMERIC;
  v_ot_hours NUMERIC := 0;
  v_ot NUMERIC := 0;
  v_gross NUMERIC;
  v_gepf NUMERIC;
  v_nssf_e NUMERIC;
  v_taxable NUMERIC;
  v_paye BIGINT;
  v_miss NUMERIC;
  v_loan NUMERIC;
  v_net NUMERIC;
BEGIN
  SELECT * INTO v_period FROM public.payroll_periods WHERE id = NEW.period_id;
  v_period_date := make_date(v_period.year, v_period.month, 1);

  SELECT * INTO v_settings
  FROM public.payroll_settings
  WHERE casino_id = NEW.casino_id AND effective_from <= v_period_date
  ORDER BY effective_from DESC LIMIT 1;

  IF v_settings.id IS NULL THEN
    v_settings.hours_per_month := 195;
    v_settings.gepf_pct := 10.00;
    v_settings.nssf_employee_pct := 10.00;
    v_settings.nssf_employer_pct := 10.00;
    v_settings.wcf_pct := 1.00;
    v_settings.sdl_pct := 3.50;
    v_settings.working_days := 26;
    v_settings.overtime_enabled := false;
    v_settings.overtime_multiplier := 1.50;
    v_settings.prorata_enabled := true;
  END IF;

  v_basic  := COALESCE(NEW.snapshot_basic_salary, 0);
  v_factor := LEAST(GREATEST(COALESCE(NEW.prorata_factor, 1), 0), 1);
  IF NOT COALESCE(v_settings.prorata_enabled, true) THEN
    v_factor := 1;
    NEW.prorata_factor := 1;
  END IF;
  v_basic_eff := v_basic * v_factor;

  v_hourly := CASE WHEN v_settings.hours_per_month > 0
                   THEN v_basic / v_settings.hours_per_month
                   ELSE 0 END;

  v_holiday := v_hourly * COALESCE(NEW.public_holiday_worked,0) * COALESCE(NEW.hrs_worked_on_holiday,0);
  v_off := v_hourly * COALESCE(NEW.off_days_hours,0);

  IF COALESCE(v_settings.overtime_enabled, false) THEN
    v_ot_hours := GREATEST(
      COALESCE(NEW.worked_hours,0) - COALESCE(NEW.off_days_hours,0)
        - (COALESCE(v_settings.hours_per_month,195) * v_factor), 0);
    v_ot := v_hourly * COALESCE(v_settings.overtime_multiplier,1.5) * v_ot_hours;
  END IF;

  v_gross := v_basic_eff + v_holiday + v_off + v_ot;

  v_gepf  := v_gross * (v_settings.gepf_pct / 100.0);
  v_nssf_e:= v_gross * (v_settings.nssf_employee_pct / 100.0);
  v_taxable := v_gross - v_gepf - v_nssf_e;

  v_paye := public.compute_paye_for_amount(ROUND(v_taxable)::BIGINT, v_period_date);

  v_miss := CASE WHEN v_settings.working_days > 0
                 THEN v_basic / v_settings.working_days * COALESCE(NEW.missing_days,0)
                 ELSE 0 END;

  v_loan := COALESCE(NEW.loan_installment, 0);

  v_net := v_gross - v_gepf - v_nssf_e - v_paye
           - COALESCE(NEW.cash_shortage,0)
           - COALESCE(NEW.salary_advances,0)
           - v_miss
           - COALESCE(NEW.gepf_loan,0)
           - v_loan;

  NEW.net_clamped := false;
  IF v_net < 0 AND v_loan > 0 THEN
    v_loan := GREATEST(v_loan + v_net, 0);
    v_net := v_gross - v_gepf - v_nssf_e - v_paye
             - COALESCE(NEW.cash_shortage,0)
             - COALESCE(NEW.salary_advances,0)
             - v_miss
             - COALESCE(NEW.gepf_loan,0)
             - v_loan;
    NEW.net_clamped := true;
  END IF;

  NEW.loan_installment       := ROUND(v_loan)::BIGINT;
  NEW.overtime_hours         := ROUND(v_ot_hours, 2);
  NEW.overtime_amount        := ROUND(v_ot)::BIGINT;
  NEW.public_holiday_earned  := ROUND(v_holiday)::BIGINT;
  NEW.night_days             := 0;
  NEW.night_allowance_hours  := 0;
  NEW.night_allowance        := 0;
  NEW.off_days_total         := ROUND(v_off)::BIGINT;
  NEW.gross_salary           := ROUND(v_gross)::BIGINT;
  NEW.gepf_employee          := ROUND(v_gepf)::BIGINT;
  NEW.nssf_employee          := ROUND(v_nssf_e)::BIGINT;
  NEW.taxable_pay            := ROUND(v_taxable)::BIGINT;
  NEW.paye                   := v_paye;
  NEW.deductions_missing_days:= ROUND(v_miss)::BIGINT;
  NEW.net_salary             := ROUND(v_net)::BIGINT;

  NEW.nssf_employer := ROUND(v_gross * v_settings.nssf_employer_pct / 100.0)::BIGINT;
  NEW.wcf_amount    := ROUND(v_gross * v_settings.wcf_pct / 100.0)::BIGINT;
  NEW.sdl_amount    := ROUND(v_gross * v_settings.sdl_pct / 100.0)::BIGINT;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.payroll_refresh_period(_period_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period RECORD;
  v_start DATE;
  v_end DATE;
  v_days_in_month INT;
  v_working_days INT;
  v_added INT := 0;
  v_updated INT := 0;
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
      AND (e.payroll_status = 'active' OR (e.termination_date IS NOT NULL AND e.termination_date BETWEEN v_start AND v_end))
      AND (e.employment_date IS NULL OR e.employment_date <= v_end)
      AND NOT EXISTS (
        SELECT 1 FROM public.payroll_entries pe
        WHERE pe.period_id = v_period.id AND pe.employee_id = e.id
      )
    RETURNING 1
  )
  SELECT count(*) INTO v_added FROM inserted;

  -- pro-rata days for joiners / leavers
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
  daily AS (
    SELECT a.employee_id, a.d, a.effective_hours, a.is_holiday, a.raw_value,
           ROW_NUMBER() OVER (PARTITION BY a.employee_id
                              ORDER BY CASE WHEN a.effective_hours > 0 THEN 0 ELSE 1 END, a.d) AS worked_rank
    FROM att a
  ),
  agg AS (
    SELECT d.employee_id,
           SUM(CASE WHEN d.is_holiday THEN d.effective_hours ELSE 0 END)::INT AS holiday_hours,
           SUM(CASE WHEN d.is_holiday AND d.effective_hours > 0 THEN 1 ELSE 0 END)::INT AS holiday_days,
           SUM(CASE WHEN UPPER(COALESCE(d.raw_value,'')) = 'A' THEN 1 ELSE 0 END)::INT AS missing_days,
           SUM(CASE WHEN d.effective_hours > 0 THEN 1 ELSE 0 END)::INT AS worked_days,
           COALESCE(SUM(d.effective_hours), 0)::NUMERIC AS worked_hours,
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
        off_days = COALESCE(agg.off_days, 0),
        off_days_hours = COALESCE(agg.off_days_hours, 0),
        updated_at = now()
    FROM agg
    WHERE pe.period_id = v_period.id AND pe.employee_id = agg.employee_id
    RETURNING 1
  )
  SELECT count(*) INTO v_updated FROM upd;

  -- loan installments for this period
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
          jsonb_build_object('added', v_added, 'updated', v_updated));

  RETURN jsonb_build_object('added', v_added, 'updated', v_updated);
END;
$$;

CREATE OR REPLACE FUNCTION public.payroll_period_checklist(_period_id uuid)
RETURNS TABLE (
  entry_id uuid,
  employee_id uuid,
  full_name text,
  severity text,
  issue text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH p AS (SELECT * FROM public.payroll_periods WHERE id = _period_id),
  allowed AS (
    SELECT EXISTS (
      SELECT 1 FROM p WHERE public.has_role(auth.uid(),'super_admin'::app_role)
        OR public.can_finance(auth.uid())
        OR ((public.has_role(auth.uid(),'hr'::app_role) OR public.can_manage(auth.uid()))
            AND public.has_casino_scope(auth.uid(), p.casino_id))
    ) AS ok
  ),
  e AS (
    SELECT pe.*, emp.contract_end, emp.tax_id, emp.nssf_number
    FROM public.payroll_entries pe
    LEFT JOIN public.employees emp ON emp.id = pe.employee_id
    WHERE pe.period_id = _period_id AND (SELECT ok FROM allowed)
  )
  SELECT id, employee_id, snapshot_full_name, 'error', 'Net salary is negative'
  FROM e WHERE net_salary < 0
  UNION ALL
  SELECT id, employee_id, snapshot_full_name, 'warning', 'Loan installment reduced to keep net at zero'
  FROM e WHERE net_clamped
  UNION ALL
  SELECT id, employee_id, snapshot_full_name, 'warning', 'No attendance recorded this month'
  FROM e WHERE worked_hours = 0
  UNION ALL
  SELECT id, employee_id, snapshot_full_name, 'error', 'Basic salary is zero'
  FROM e WHERE snapshot_basic_salary = 0
  UNION ALL
  SELECT id, employee_id, snapshot_full_name, 'error', 'Missing bank account number'
  FROM e WHERE COALESCE(snapshot_account_number,'') = ''
  UNION ALL
  SELECT id, employee_id, snapshot_full_name, 'warning', 'Missing TIN / NSSF number'
  FROM e WHERE COALESCE(tax_id,'') = '' OR COALESCE(nssf_number,'') = ''
  UNION ALL
  SELECT e.id, e.employee_id, e.snapshot_full_name, 'warning', 'Contract expired'
  FROM e, p WHERE e.contract_end IS NOT NULL
    AND e.contract_end < (make_date(p.year, p.month, 1) + INTERVAL '1 month - 1 day')::date;
$$;

GRANT EXECUTE ON FUNCTION public.payroll_period_checklist(uuid) TO authenticated;