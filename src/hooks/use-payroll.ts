/**
 * Payroll module hooks — employees master, periods, entries, approvals.
 * Data flow: HR edits drafts → HR Approve → Manager (Finance) Approve = locked.
 * All financial computations live in DB triggers; UI sends raw inputs only.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useCasino } from "@/lib/casino-context";
import { toast } from "sonner";
import { invalidateEmployeeCaches } from "@/lib/invalidate-employees";

// ============= EMPLOYEES =============
export interface Employee {
  id: string;
  casino_id: string;
  staff_member_id: string | null;
  dealer_id: string | null;
  full_name: string;
  first_name: string;
  last_name: string;
  position: string;
  department: string;
  employment_date: string | null;
  onboarding_date: string | null;
  contract_start: string | null;
  contract_end: string | null;
  dealer_category: "dealer" | "inspector" | "trainee" | null;
  is_pit_boss: boolean;
  source_table: "staff_members" | "dealers" | null;
  photo_url: string | null;
  nssf_number: string | null;
  tax_id: string | null;
  gepf_number: string | null;
  basic_salary: number;
  payroll_status: "active" | "inactive";
  // Extended HR fields (Excel template parity)
  contract_type: string | null;
  birthday: string | null;
  phone: string | null;
  job_description: string | null;
  general_details: string | null;
  intro_to_work: boolean;
  staff_rules_acknowledged: boolean;
  disciplinary_acknowledged: boolean;
  confidentiality_agreement: boolean;
  annual_leave_earned: number;
  annual_leave_used: number;
  annual_leave_sold: number;
  corporate_mail: string | null;
  gender: string | null;
  nationality: string | null;
  license_type: string | null;
  license_available: boolean;
  license_pass_date: string | null;
  uniform_issued: boolean;
  bank?: BankAccount | null;
}
export interface BankAccount {
  id: string;
  employee_id: string;
  bank_name: string;
  bank_code: string;
  branch_code: string;
  account_number: string;
  is_primary: boolean;
}

export const useEmployees = () => {
  const { activeCasinoId } = useCasino();
  return useQuery({
    queryKey: ["employees", activeCasinoId],
    queryFn: async (): Promise<Employee[]> => {
      let q = supabase.from("employees").select("*, employee_bank_accounts(*)").order("full_name");
      if (activeCasinoId) q = q.eq("casino_id", activeCasinoId);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []).map((e: any) => ({
        ...e,
        bank: e.employee_bank_accounts?.find((b: BankAccount) => b.is_primary) ?? e.employee_bank_accounts?.[0] ?? null,
      })) as Employee[];
    },
    enabled: !!activeCasinoId,
    staleTime: 1000 * 60 * 30,
  });
};

export const useUpsertEmployee = () => {
  const qc = useQueryClient();
  const { activeCasinoId } = useCasino();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: Partial<Employee> & { bank?: Partial<BankAccount> | null }) => {
      const { bank, ...emp } = input as any;
      let employeeId = emp.id as string | undefined;
      const extended = {
        contract_type: emp.contract_type ?? null,
        birthday: emp.birthday ?? null,
        phone: emp.phone ?? null,
        job_description: emp.job_description ?? null,
        general_details: emp.general_details ?? null,
        intro_to_work: !!emp.intro_to_work,
        staff_rules_acknowledged: !!emp.staff_rules_acknowledged,
        disciplinary_acknowledged: !!emp.disciplinary_acknowledged,
        confidentiality_agreement: !!emp.confidentiality_agreement,
        annual_leave_earned: Number(emp.annual_leave_earned) || 0,
        annual_leave_used: Number(emp.annual_leave_used) || 0,
        annual_leave_sold: Number(emp.annual_leave_sold) || 0,
        corporate_mail: emp.corporate_mail ?? null,
        gender: emp.gender ?? null,
        nationality: emp.nationality ?? null,
        license_type: emp.license_type ?? null,
        license_available: !!emp.license_available,
        license_pass_date: emp.license_pass_date ?? null,
        uniform_issued: !!emp.uniform_issued,
      };
      if (employeeId) {
        const { error } = await supabase.from("employees").update({
          full_name: emp.full_name,
          ...(emp.first_name !== undefined ? { first_name: emp.first_name } : {}),
          ...(emp.last_name  !== undefined ? { last_name:  emp.last_name  } : {}),
          position: emp.position, department: emp.department,
          employment_date: emp.employment_date ?? emp.onboarding_date ?? null,
          onboarding_date: emp.onboarding_date ?? null,
          contract_start: emp.contract_start ?? null,
          contract_end: emp.contract_end ?? null,
          is_pit_boss: !!emp.is_pit_boss,
          dealer_category: emp.dealer_category ?? null,
          photo_url: emp.photo_url,
          nssf_number: emp.nssf_number, tax_id: emp.tax_id, gepf_number: emp.gepf_number,
          basic_salary: emp.basic_salary ?? 0, payroll_status: emp.payroll_status ?? "active",
          ...extended,
        } as any).eq("id", employeeId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("employees").insert({
          casino_id: activeCasinoId, full_name: emp.full_name,
          ...(emp.first_name !== undefined ? { first_name: emp.first_name } : {}),
          ...(emp.last_name  !== undefined ? { last_name:  emp.last_name  } : {}),
          position: emp.position ?? "",
          department: emp.department ?? "",
          employment_date: emp.employment_date ?? emp.onboarding_date ?? null,
          onboarding_date: emp.onboarding_date ?? null,
          contract_start: emp.contract_start ?? null,
          contract_end: emp.contract_end ?? null,
          is_pit_boss: !!emp.is_pit_boss,
          dealer_category: emp.dealer_category ?? null,
          source_table: null,
          nssf_number: emp.nssf_number, tax_id: emp.tax_id, gepf_number: emp.gepf_number,
          basic_salary: emp.basic_salary ?? 0, payroll_status: emp.payroll_status ?? "active",
          created_by: user?.id, photo_url: emp.photo_url,
          ...extended,
        } as any).select("id").single();
        if (error) throw error;
        employeeId = data.id;
      }
      if (bank && employeeId) {
        if (bank.id) {
          const { error } = await supabase.from("employee_bank_accounts").update({
            bank_name: bank.bank_name ?? "", bank_code: bank.bank_code ?? "",
            branch_code: bank.branch_code ?? "", account_number: bank.account_number ?? "",
          }).eq("id", bank.id);
          if (error) throw error;
        } else if (bank.account_number || bank.bank_name) {
          const { error } = await supabase.from("employee_bank_accounts").insert({
            employee_id: employeeId, bank_name: bank.bank_name ?? "",
            bank_code: bank.bank_code ?? "", branch_code: bank.branch_code ?? "",
            account_number: bank.account_number ?? "", is_primary: true,
          });
          if (error) throw error;
        }
      }
      return employeeId;
    },
    onSuccess: () => {
      invalidateEmployeeCaches(qc);
      toast.success("Employee saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

/** Inline single-/multi-field patch (for click-to-edit table). */
export const usePatchEmployee = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Employee> }) => {
      const allowed = [
        "full_name","first_name","last_name","position","department","onboarding_date","employment_date",
        "contract_start","contract_end","is_pit_boss","dealer_category",
        "basic_salary","payroll_status","contract_type","birthday","phone",
        "job_description","general_details","intro_to_work","staff_rules_acknowledged",
        "disciplinary_acknowledged","confidentiality_agreement","annual_leave_earned",
        "annual_leave_used","annual_leave_sold","corporate_mail","gender","nationality",
        "license_type","license_available","license_pass_date","uniform_issued",
        "nssf_number","tax_id","gepf_number","photo_url",
      ] as const;
      const body: Record<string, unknown> = {};
      for (const k of allowed) if (k in patch) body[k] = (patch as any)[k];
      const { error } = await supabase.from("employees").update(body as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidateEmployeeCaches(qc),
    onError: (e: Error) => toast.error(e.message),
  });
};

/** Hard-delete an employee. Payroll history stays (employee_id is set NULL). */
export const useDeleteEmployee = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("employees").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { invalidateEmployeeCaches(qc); toast.success("Employee removed"); },
    onError: (e: Error) => toast.error(e.message),
  });
};

// ============= PERIODS =============
export interface PayrollPeriod {
  id: string;
  casino_id: string;
  year: number;
  month: number;
  status: "draft" | "hr_approved" | "locked" | "paid";
  hr_approved_by: string | null;
  hr_approved_at: string | null;
  manager_approved_by: string | null;
  manager_approved_at: string | null;
  locked_at: string | null;
  paid_by?: string | null;
  paid_at?: string | null;
  payment_description?: string | null;
  branch_label?: string | null;
}

/** Display labels for the 4-stage workflow (UI only — DB stores legacy values). */
export const PERIOD_STATUS_LABEL: Record<PayrollPeriod["status"], string> = {
  draft: "Draft",
  hr_approved: "Reviewed",
  locked: "Approved",
  paid: "Paid",
};

export const usePayrollPeriods = () => {
  const { activeCasinoId } = useCasino();
  return useQuery({
    queryKey: ["payroll_periods", activeCasinoId],
    queryFn: async (): Promise<PayrollPeriod[]> => {
      let q = supabase.from("payroll_periods").select("*").order("year", { ascending: false }).order("month", { ascending: false });
      if (activeCasinoId) q = q.eq("casino_id", activeCasinoId);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as PayrollPeriod[];
    },
    enabled: !!activeCasinoId,
  });
};

export const usePayrollPeriod = (id: string | undefined) =>
  useQuery({
    queryKey: ["payroll_period", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("payroll_periods").select("*").eq("id", id!).single();
      if (error) throw error;
      return data as PayrollPeriod;
    },
    enabled: !!id,
  });

export const useCreatePayrollPeriod = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ year, month }: { year: number; month: number }) => {
      const { data, error } = await supabase.rpc("payroll_create_period", { _year: year, _month: month });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["payroll_periods"] }); toast.success("Period created"); },
    onError: (e: Error) => toast.error(e.message),
  });
};

export const useDuplicatePayrollPeriod = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ source, year, month }: { source: string; year: number; month: number }) => {
      const { data, error } = await supabase.rpc("payroll_duplicate_period", {
        _source_period_id: source, _year: year, _month: month,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["payroll_periods"] }); toast.success("Period duplicated"); },
    onError: (e: Error) => toast.error(e.message),
  });
};

// ============= ENTRIES =============
export interface PayrollEntry {
  id: string;
  period_id: string;
  employee_id: string;
  casino_id: string;
  snapshot_full_name: string;
  snapshot_position: string;
  snapshot_basic_salary: number;
  snapshot_account_number: string;
  snapshot_bank_code: string;
  snapshot_branch_code: string;
  public_holiday_worked: number;
  hrs_worked_on_holiday: number;
  night_days: number;
  off_days: number;
  off_days_hours: number;
  cash_shortage: number;
  salary_advances: number;
  missing_days: number;
  gepf_loan: number;
  // computed
  public_holiday_earned: number;
  night_allowance_hours: number;
  night_allowance: number;
  off_days_total: number;
  gross_salary: number;
  gepf_employee: number;
  nssf_employee: number;
  taxable_pay: number;
  paye: number;
  deductions_missing_days: number;
  net_salary: number;
  nssf_employer: number;
  wcf_amount: number;
  sdl_amount: number;
}

export const usePayrollEntries = (periodId: string | undefined) =>
  useQuery({
    queryKey: ["payroll_entries", periodId],
    queryFn: async (): Promise<PayrollEntry[]> => {
      const { data, error } = await supabase.from("payroll_entries").select("*").eq("period_id", periodId!).order("snapshot_full_name");
      if (error) throw error;
      return (data || []) as PayrollEntry[];
    },
    enabled: !!periodId,
  });

export const useUpdatePayrollEntry = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<PayrollEntry> & { id: string }) => {
      const { id, ...patch } = input;
      // strip computed fields
      const editable: any = {};
      const allowed = ["public_holiday_worked","hrs_worked_on_holiday","night_days","off_days","off_days_hours",
                       "cash_shortage","salary_advances","missing_days","gepf_loan"];
      for (const k of allowed) if (k in patch) editable[k] = (patch as any)[k];
      const { error } = await supabase.from("payroll_entries").update(editable).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => { qc.invalidateQueries({ queryKey: ["payroll_entries"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
};

// ============= APPROVALS =============
const rpcMutation = (rpc: string, success: string, withReason = false) => () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { periodId: string; reason?: string }) => {
      const params: any = { _period_id: vars.periodId };
      if (withReason) params._reason = vars.reason ?? null;
      const { error } = await supabase.rpc(rpc as any, params);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payroll_periods"] });
      qc.invalidateQueries({ queryKey: ["payroll_period"] });
      toast.success(success);
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

export const useApproveHR        = rpcMutation("payroll_approve_hr",       "Marked as Reviewed");
export const useApproveManager   = rpcMutation("payroll_approve_manager",  "Approved");
export const useMarkPaid         = rpcMutation("payroll_mark_paid",        "Marked as Paid");
export const useRevertToDraft    = rpcMutation("payroll_revert_to_draft",  "Reverted to draft", true);
export const useUnlockPeriod     = rpcMutation("payroll_unlock_period",    "Period unlocked",   true);

// ============= UPDATE PERIOD METADATA (payment description, branch label) =============
export const useUpdatePeriodMeta = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; payment_description?: string | null; branch_label?: string | null }) => {
      const { id, ...patch } = input;
      const { error } = await supabase.from("payroll_periods").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payroll_periods"] });
      qc.invalidateQueries({ queryKey: ["payroll_period"] });
      toast.success("Period updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

// ============= FIND PERIOD BY MONTH (for month carousel) =============
export const usePeriodForMonth = (year: number, month: number) => {
  const { activeCasinoId } = useCasino();
  return useQuery({
    queryKey: ["payroll_period_by_month", activeCasinoId, year, month],
    queryFn: async (): Promise<PayrollPeriod | null> => {
      const { data, error } = await supabase
        .from("payroll_periods").select("*")
        .eq("casino_id", activeCasinoId!).eq("year", year).eq("month", month)
        .maybeSingle();
      if (error) throw error;
      return (data as PayrollPeriod | null) ?? null;
    },
    enabled: !!activeCasinoId,
  });
};

// ============= BANK EXPORT VIEW (with validations) =============
export interface BankExportRow {
  id: string;
  period_id: string;
  employee_id: string;
  name: string;
  account_number: string;
  bank_code: string;
  branch_code: string;
  amount: number;
  warning: "missing_account" | "negative_salary" | "zero_salary" | "duplicate_account" | null;
}

export const useBankExport = (periodId: string | undefined) =>
  useQuery({
    queryKey: ["payroll_bank_export", periodId],
    queryFn: async (): Promise<BankExportRow[]> => {
      const { data, error } = await supabase
        .from("payroll_bank_export_v" as any).select("*")
        .eq("period_id", periodId!).order("name");
      if (error) throw error;
      return ((data as unknown) as BankExportRow[]) || [];
    },
    enabled: !!periodId,
  });

// ============= SETTINGS =============
export interface PayrollSettings {
  id: string;
  casino_id: string;
  effective_from: string;
  hours_per_month: number;
  night_hours_per_day: number;
  night_rate_pct: number;
  gepf_pct: number;
  nssf_employee_pct: number;
  nssf_employer_pct: number;
  wcf_pct: number;
  sdl_pct: number;
  working_days: number;
  off_day_multiplier: number;
  default_payment_description: string | null;
}

export const useLatestPayrollSettings = () => {
  const { activeCasinoId } = useCasino();
  return useQuery({
    queryKey: ["payroll_settings_latest", activeCasinoId],
    queryFn: async (): Promise<PayrollSettings | null> => {
      const { data, error } = await supabase
        .from("payroll_settings").select("*")
        .eq("casino_id", activeCasinoId!)
        .order("effective_from", { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      return (data as PayrollSettings | null) ?? null;
    },
    enabled: !!activeCasinoId,
  });
};

export interface PayeBracket {
  id: string;
  casino_id: string;
  effective_from: string;
  ord: number;
  lower_bound: number;
  upper_bound: number | null;
  base_tax: number;
  rate_pct: number;
}

export const useLatestPayeBrackets = () => {
  const { activeCasinoId } = useCasino();
  return useQuery({
    queryKey: ["paye_brackets_latest", activeCasinoId],
    queryFn: async (): Promise<PayeBracket[]> => {
      const { data: latest } = await supabase
        .from("payroll_paye_brackets" as any).select("effective_from")
        .eq("casino_id", activeCasinoId!).order("effective_from", { ascending: false }).limit(1).maybeSingle();
      if (!latest) return [];
      const { data, error } = await supabase
        .from("payroll_paye_brackets" as any).select("*")
        .eq("casino_id", activeCasinoId!).eq("effective_from", (latest as any).effective_from)
        .order("ord");
      if (error) throw error;
      return ((data as unknown) as PayeBracket[]) || [];
    },
    enabled: !!activeCasinoId,
  });
};

// ============= AUDIT LOG =============
export interface PayrollAuditEntry {
  id: string;
  period_id: string | null;
  casino_id: string;
  action: string;
  actor_id: string | null;
  details: Record<string, any>;
  created_at: string;
}

export const usePayrollAuditLog = (periodId: string | undefined) =>
  useQuery({
    queryKey: ["payroll_audit", periodId],
    queryFn: async (): Promise<PayrollAuditEntry[]> => {
      const { data, error } = await supabase
        .from("payroll_audit_log")
        .select("*")
        .eq("period_id", periodId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as PayrollAuditEntry[];
    },
    enabled: !!periodId,
  });
