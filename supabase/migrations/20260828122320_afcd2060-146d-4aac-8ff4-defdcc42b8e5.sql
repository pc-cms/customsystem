ALTER TABLE public.payroll_entries
  ADD COLUMN IF NOT EXISTS worked_days INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS worked_hours NUMERIC NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.compute_payroll_entry()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_settings public.payroll_settings%ROWTYPE;
  v_period   public.payroll_periods%ROWTYPE;
  v_period_date DATE;
  v_basic NUMERIC;
  v_hourly NUMERIC;
  v_holiday NUMERIC;
  v_off NUMERIC;
  v_gross NUMERIC;
  v_gepf NUMERIC;
  v_nssf_e NUMERIC;
  v_taxable NUMERIC;
  v_paye BIGINT;
  v_miss NUMERIC;
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
  END IF;

  v_basic  := COALESCE(NEW.snapshot_basic_salary, 0);
  v_hourly := CASE WHEN v_settings.hours_per_month > 0
                   THEN v_basic / v_settings.hours_per_month
                   ELSE 0 END;

  v_holiday := v_hourly * COALESCE(NEW.public_holiday_worked,0) * COALESCE(NEW.hrs_worked_on_holiday,0);

  -- Night shift differential removed: pay is per worked hours only.
  v_off := v_hourly * COALESCE(NEW.off_days_hours,0);

  v_gross := v_basic + v_holiday + v_off;

  v_gepf  := v_gross * (v_settings.gepf_pct / 100.0);
  v_nssf_e:= v_gross * (v_settings.nssf_employee_pct / 100.0);
  v_taxable := v_gross - v_gepf - v_nssf_e;

  v_paye := public.compute_paye_for_amount(ROUND(v_taxable)::BIGINT, v_period_date);

  v_miss := CASE WHEN v_settings.working_days > 0
                 THEN v_basic / v_settings.working_days * COALESCE(NEW.missing_days,0)
                 ELSE 0 END;

  v_net := v_gross - v_gepf - v_nssf_e - v_paye
           - COALESCE(NEW.cash_shortage,0)
           - COALESCE(NEW.salary_advances,0)
           - v_miss
           - COALESCE(NEW.gepf_loan,0);

  NEW.public_holiday_earned   := ROUND(v_holiday)::BIGINT;
  NEW.night_days              := 0;
  NEW.night_allowance_hours   := 0;
  NEW.night_allowance         := 0;
  NEW.off_days_total          := ROUND(v_off)::BIGINT;
  NEW.gross_salary            := ROUND(v_gross)::BIGINT;
  NEW.gepf_employee           := ROUND(v_gepf)::BIGINT;
  NEW.nssf_employee           := ROUND(v_nssf_e)::BIGINT;
  NEW.taxable_pay             := ROUND(v_taxable)::BIGINT;
  NEW.paye                    := v_paye;
  NEW.deductions_missing_days := ROUND(v_miss)::BIGINT;
  NEW.net_salary              := ROUND(v_net)::BIGINT;

  NEW.nssf_employer := ROUND(v_gross * v_settings.nssf_employer_pct / 100.0)::BIGINT;
  NEW.wcf_amount    := ROUND(v_gross * v_settings.wcf_pct / 100.0)::BIGINT;
  NEW.sdl_amount    := ROUND(v_gross * v_settings.sdl_pct / 100.0)::BIGINT;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.payroll_refresh_period(_period_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_period RECORD;
  v_start DATE;
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
      AND e.payroll_status = 'active'
      AND NOT EXISTS (
        SELECT 1 FROM public.payroll_entries pe
        WHERE pe.period_id = v_period.id AND pe.employee_id = e.id
      )
    RETURNING 1
  )
  SELECT count(*) INTO v_added FROM inserted;

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

  INSERT INTO public.payroll_audit_log(period_id, casino_id, action, actor_id, details)
  VALUES (v_period.id, v_period.casino_id, 'refresh_period', auth.uid(),
          jsonb_build_object('added', v_added, 'updated', v_updated));

  RETURN jsonb_build_object('added', v_added, 'updated', v_updated);
END;
$function$;