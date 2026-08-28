import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Wallet, CheckCircle2, Lock, Unlock, FileSpreadsheet, Printer, History, RefreshCw } from "lucide-react";
import { PageShell, PageSection } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { DataTable, DTHead, DTBody, DTRow, DTHeader, DTCell } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth-context";
import {
  usePayrollPeriod, usePayrollEntries, useUpdatePayrollEntry,
  useApproveHR, useApproveManager, useMarkPaid, useRevertToDraft, useUnlockPeriod,
  usePayrollAuditLog, useEmployees, usePayrollChecklist,
  PERIOD_STATUS_LABEL,
  type PayrollEntry,
} from "@/hooks/use-payroll";
import { useRefreshPayrollPeriod } from "@/hooks/use-attendance-monthly";
import { StatusBadge } from "@/components/payroll/MonthCarousel";
import { Banknote } from "lucide-react";
import {
  exportBankCsv, exportNssfReport, exportPayeReport, exportSdlReport,
  exportWcfReport, exportJournal, exportSalarySlipsPrint, exportSingleSalarySlip,
  type BankFormat,
} from "@/lib/payroll-exports";
import { fmtDateTime } from "@/lib/format-date";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const fmt = (n: number) => new Intl.NumberFormat("en-US").format(n).replace(/,/g, " ");

const PayrollPeriodPage = () => {
  const nav = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { roles } = useAuth();
  const isHR = roles.includes("hr") || roles.includes("super_admin");
  const isFinance = roles.includes("finance_manager") || roles.includes("super_admin");
  const isSuper = roles.includes("super_admin");

  const { data: period } = usePayrollPeriod(id);
  const { data: entries = [], isLoading } = usePayrollEntries(id);

  const approveHR = useApproveHR();
  const approveMgr = useApproveManager();
  const markPaid = useMarkPaid();
  const revert = useRevertToDraft();
  const unlock = useUnlockPeriod();
  const refresh = useRefreshPayrollPeriod();
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [unlockReason, setUnlockReason] = useState("");

  if (!period) {
    return <div className="p-6 text-sm text-muted-foreground">Loading period…</div>;
  }

  const isDraft = period.status === "draft";
  const isHrApproved = period.status === "hr_approved";
  const isLocked = period.status === "locked";
  const isPaid = period.status === "paid";
  const canEdit = isDraft && isHR;
  const periodLabel = `${MONTHS[period.month - 1]} ${period.year}`;

  return (
    <PageShell>
      <PageHeader
        icon={Wallet}
        title={`Payroll — ${periodLabel}`}
        subtitle={`Status: ${PERIOD_STATUS_LABEL[period.status]}`}
      >
        <StatusBadge status={period.status} />
        {!isLocked && !isPaid && (isHR || isFinance) && (
          <Button size="sm" variant="outline" onClick={() => refresh.mutate(period.id)} disabled={refresh.isPending}>
            <RefreshCw className={`w-4 h-4 mr-1 ${refresh.isPending ? "animate-spin" : ""}`} /> Refresh
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => nav("/payroll")}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Back
        </Button>
      </PageHeader>

      <Tabs defaultValue="entries">
        <TabsList>
          <TabsTrigger value="entries">Employee Payroll</TabsTrigger>
          <TabsTrigger value="checklist">Checklist</TabsTrigger>
          <TabsTrigger value="taxes">Taxes</TabsTrigger>
          <TabsTrigger value="slips">Salary Slips</TabsTrigger>
          <TabsTrigger value="audit">Audit Log</TabsTrigger>
        </TabsList>

        <TabsContent value="entries">
          <PageSection card={false}>
            {isLoading ? (
              <div className="text-sm text-muted-foreground p-4">Loading…</div>
            ) : (
              <EntriesGrid entries={entries} canEdit={canEdit} period={period} />
            )}
          </PageSection>
        </TabsContent>

        <TabsContent value="checklist">
          <ChecklistPanel periodId={period.id} />
        </TabsContent>

        <TabsContent value="taxes">
          <TaxesPanel entries={entries} />
        </TabsContent>

        <TabsContent value="slips">
          <SlipsPanel entries={entries} period={period} periodLabel={periodLabel} />
        </TabsContent>

        <TabsContent value="audit">
          <AuditPanel periodId={period.id} />
        </TabsContent>
      </Tabs>


      {/* APPROVAL & EXPORT BAR */}
      <PageSection card title="Workflow">
        <div className="flex flex-wrap gap-2 items-center">
          {isDraft && isHR && (
            <Button onClick={() => approveHR.mutate({ periodId: period.id })}>
              <CheckCircle2 className="w-4 h-4 mr-1" /> Mark as Reviewed
            </Button>
          )}
          {isHrApproved && isFinance && (
            <>
              <Button onClick={() => approveMgr.mutate({ periodId: period.id })}>
                <Lock className="w-4 h-4 mr-1" /> Approve & Lock
              </Button>
              <Button variant="outline" onClick={() => revert.mutate({ periodId: period.id, reason: "revert" })}>
                Revert to Draft
              </Button>
            </>
          )}
          {isLocked && isFinance && (
            <Button onClick={() => markPaid.mutate({ periodId: period.id })}>
              <Banknote className="w-4 h-4 mr-1" /> Mark as Paid
            </Button>
          )}
          {(isLocked || isPaid) && isSuper && (
            <Button variant="outline" onClick={() => setUnlockOpen(true)}>
              <Unlock className="w-4 h-4 mr-1" /> Unlock (Super Admin)
            </Button>
          )}

          {(isLocked || isPaid) && (
            <>
              <div className="w-full mt-2 text-xs text-muted-foreground uppercase tracking-wider">Exports</div>
              <BankExportButton entries={entries} period={period} />
              <Button size="sm" variant="outline" onClick={() => exportSalarySlipsPrint(entries, period)}>
                <Printer className="w-4 h-4 mr-1" /> Salary Slips PDF
              </Button>
              <Button size="sm" variant="outline" onClick={() => exportNssfReport(entries, period)}>
                <FileSpreadsheet className="w-4 h-4 mr-1" /> NSSF
              </Button>
              <Button size="sm" variant="outline" onClick={() => exportPayeReport(entries, period)}>
                <FileSpreadsheet className="w-4 h-4 mr-1" /> PAYE
              </Button>
              <Button size="sm" variant="outline" onClick={() => exportSdlReport(entries, period)}>
                <FileSpreadsheet className="w-4 h-4 mr-1" /> SDL
              </Button>
              <Button size="sm" variant="outline" onClick={() => exportWcfReport(entries, period)}>
                <FileSpreadsheet className="w-4 h-4 mr-1" /> WCF
              </Button>
              <Button size="sm" variant="outline" onClick={() => exportJournal(entries, period)}>
                <FileSpreadsheet className="w-4 h-4 mr-1" /> Journal
              </Button>
            </>
          )}
        </div>
      </PageSection>

      <Dialog open={unlockOpen} onOpenChange={setUnlockOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Unlock Period</DialogTitle></DialogHeader>
          <div className="space-y-2 py-2">
            <p className="text-sm text-muted-foreground">A reason is required and will be logged.</p>
            <Input value={unlockReason} onChange={e => setUnlockReason(e.target.value)} placeholder="Reason for unlock" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUnlockOpen(false)}>Cancel</Button>
            <Button onClick={async () => {
              if (!unlockReason.trim()) return;
              await unlock.mutateAsync({ periodId: period.id, reason: unlockReason });
              setUnlockOpen(false); setUnlockReason("");
            }}>Unlock</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
};

const READONLY_FIELDS = [
  ["worked_days", "Wkd Days"],
  ["worked_hours", "Wkd Hrs"],
  ["overtime_hours", "OT Hrs"],
  ["prorata_days", "Paid Days"],
  ["loan_installment", "Loan Inst."],
] as const;


const NUMERIC_INPUT_FIELDS = [
  ["public_holiday_worked", "PH Worked"],
  ["hrs_worked_on_holiday", "Hrs Hol"],
  ["off_days_hours", "OD Hrs"],
  ["missing_days", "Missing"],
  ["cash_shortage", "Cash Short"],
  ["salary_advances", "Advances"],
  ["gepf_loan", "GEPF Loan"],
] as const;

const EntriesGrid = ({ entries, canEdit, period }: { entries: PayrollEntry[]; canEdit: boolean; period: any }) => {
  const update = useUpdatePayrollEntry();
  const { data: employees = [] } = useEmployees();
  const [draft, setDraft] = useState<Record<string, Partial<PayrollEntry>>>({});
  const [dept, setDept] = useState<string>("__all__");

  const empDeptMap = useMemo(() => {
    const m = new Map<string, string>();
    employees.forEach(emp => m.set(emp.id, emp.department || ""));
    return m;
  }, [employees]);

  const departments = useMemo(() => {
    const set = new Set<string>();
    entries.forEach(e => {
      const d = empDeptMap.get(e.employee_id) || "";
      if (d) set.add(d);
    });
    return Array.from(set).sort();
  }, [entries, empDeptMap]);

  const filtered = useMemo(() =>
    dept === "__all__" ? entries : entries.filter(e => (empDeptMap.get(e.employee_id) || "") === dept),
    [entries, dept, empDeptMap]);

  const totals = useMemo(() => filtered.reduce((a, e) => ({
    basic: a.basic + e.snapshot_basic_salary,
    gross: a.gross + e.gross_salary,
    paye: a.paye + e.paye,
    nssf: a.nssf + e.nssf_employee,
    gepf: a.gepf + e.gepf_employee,
    net: a.net + e.net_salary,
  }), { basic: 0, gross: 0, paye: 0, nssf: 0, gepf: 0, net: 0 }), [filtered]);

  const onChange = (id: string, field: string, val: number) => {
    setDraft(d => ({ ...d, [id]: { ...d[id], [field]: val } }));
  };
  const onBlur = (id: string, field: string) => {
    const val = draft[id]?.[field as keyof PayrollEntry];
    if (val === undefined) return;
    update.mutate({ id, [field]: val } as any);
  };

  const colCount = 3 + READONLY_FIELDS.length + NUMERIC_INPUT_FIELDS.length + 5; // employee + basic + inputs + 4 calc + net + slip

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground uppercase tracking-wider">Department</span>
        <Select value={dept} onValueChange={setDept}>
          <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All departments ({entries.length})</SelectItem>
            {departments.map(d => (
              <SelectItem key={d} value={d}>{d}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground ml-auto">{filtered.length} employees</span>
      </div>

      <DataTable>
        <DTHead>
          <DTRow>
            <DTHeader>Employee</DTHeader>
            <DTHeader align="right">Basic</DTHeader>
            {READONLY_FIELDS.map(([k, l]) => <DTHeader key={k} align="right">{l}</DTHeader>)}
            {NUMERIC_INPUT_FIELDS.map(([k, l]) => <DTHeader key={k} align="right">{l}</DTHeader>)}
            <DTHeader align="right">Gross</DTHeader>
            <DTHeader align="right">PAYE</DTHeader>
            <DTHeader align="right">NSSF</DTHeader>
            <DTHeader align="right">GEPF</DTHeader>
            <DTHeader align="right">NET</DTHeader>
            <DTHeader />
          </DTRow>
        </DTHead>
        <DTBody>
          {filtered.length === 0 && (
            <DTRow><DTCell colSpan={colCount} className="text-center text-muted-foreground py-8">No employees in this period</DTCell></DTRow>
          )}
          {filtered.map(e => (
            <DTRow key={e.id}>
              <DTCell className="font-medium">{e.snapshot_full_name}</DTCell>
              <DTCell numeric>{fmt(e.snapshot_basic_salary)}</DTCell>
              {READONLY_FIELDS.map(([k]) => (
                <DTCell key={k} numeric className="text-muted-foreground">{fmt(Number(e[k as keyof PayrollEntry] ?? 0))}</DTCell>
              ))}
              {NUMERIC_INPUT_FIELDS.map(([k]) => {
                const cur = draft[e.id]?.[k as keyof PayrollEntry] ?? (e[k as keyof PayrollEntry] as number);
                return (
                  <DTCell key={k} numeric>
                    {canEdit ? (
                      <NumberInput
                        value={cur as number}
                        onValueChange={val => onChange(e.id, k, val ?? 0)}
                        onBlur={() => onBlur(e.id, k)}
                        className="w-20 h-7 px-1 text-right font-mono text-xs bg-transparent border border-border rounded focus:outline-none focus:border-primary"
                      />
                    ) : <span className="font-mono text-xs">{fmt(cur as number)}</span>}
                  </DTCell>
                );
              })}
              <DTCell numeric className="font-semibold">{fmt(e.gross_salary)}</DTCell>
              <DTCell numeric>{fmt(e.paye)}</DTCell>
              <DTCell numeric>{fmt(e.nssf_employee)}</DTCell>
              <DTCell numeric>{fmt(e.gepf_employee)}</DTCell>
              <DTCell numeric className="font-bold text-emerald-700 dark:text-emerald-400">{fmt(e.net_salary)}</DTCell>
              <DTCell>
                <Button size="sm" variant="ghost" title="Print this slip" onClick={() => exportSingleSalarySlip(e, period)}>
                  <Printer className="w-3.5 h-3.5" />
                </Button>
              </DTCell>
            </DTRow>
          ))}
          {filtered.length > 0 && (
            <DTRow className="bg-muted/40 font-semibold border-t-2 border-border">
              <DTCell>TOTAL</DTCell>
              <DTCell numeric>{fmt(totals.basic)}</DTCell>
              {READONLY_FIELDS.map(([k]) => <DTCell key={k} />)}
              {NUMERIC_INPUT_FIELDS.map(([k]) => <DTCell key={k} />)}
              <DTCell numeric>{fmt(totals.gross)}</DTCell>
              <DTCell numeric>{fmt(totals.paye)}</DTCell>
              <DTCell numeric>{fmt(totals.nssf)}</DTCell>
              <DTCell numeric>{fmt(totals.gepf)}</DTCell>
              <DTCell numeric className="text-emerald-700 dark:text-emerald-400 font-bold">{fmt(totals.net)}</DTCell>
              <DTCell />
            </DTRow>
          )}
        </DTBody>
      </DataTable>
    </div>
  );
};

const TaxesPanel = ({ entries }: { entries: PayrollEntry[] }) => {
  const tot = entries.reduce((a, e) => ({
    nssf_e: a.nssf_e + e.nssf_employee, nssf_er: a.nssf_er + e.nssf_employer,
    paye: a.paye + e.paye, sdl: a.sdl + e.sdl_amount, wcf: a.wcf + e.wcf_amount, gross: a.gross + e.gross_salary,
  }), { nssf_e: 0, nssf_er: 0, paye: 0, sdl: 0, wcf: 0, gross: 0 });
  const cards: [string, number, string][] = [
    ["NSSF Employee 10%", tot.nssf_e, "Deducted from employees"],
    ["NSSF Employer 10%", tot.nssf_er, "Paid by company"],
    ["PAYE", tot.paye, "Income tax (TRA)"],
    ["SDL 3.5%", tot.sdl, "Skills Development Levy"],
    ["WCF 1%", tot.wcf, "Workers Compensation Fund"],
    ["Gross Salaries", tot.gross, "Sum of all gross pay"],
  ];
  return (
    <PageSection card={false}>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {cards.map(([title, value, sub]) => (
          <div key={title} className="rounded-md border border-border bg-card p-4">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">{title}</div>
            <div className="text-2xl font-bold font-mono mt-1">{fmt(value)}</div>
            <div className="text-xs text-muted-foreground mt-1">{sub}</div>
          </div>
        ))}
      </div>
    </PageSection>
  );
};

const ChecklistPanel = ({ periodId }: { periodId: string }) => {
  const { data: rows = [], isLoading } = usePayrollChecklist(periodId);
  const errors = rows.filter(r => r.severity === "error");
  const warnings = rows.filter(r => r.severity === "warning");

  return (
    <PageSection card={false}>
      <div className="flex gap-3 mb-3">
        <div className="rounded-md border border-border bg-card px-4 py-2">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Errors</div>
          <div className={`text-2xl font-bold font-mono ${errors.length ? "text-destructive" : "text-emerald-600"}`}>{errors.length}</div>
        </div>
        <div className="rounded-md border border-border bg-card px-4 py-2">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Warnings</div>
          <div className="text-2xl font-bold font-mono text-amber-600">{warnings.length}</div>
        </div>
      </div>
      <DataTable>
        <DTHead>
          <DTRow>
            <DTHeader>Severity</DTHeader>
            <DTHeader>Employee</DTHeader>
            <DTHeader>Issue</DTHeader>
          </DTRow>
        </DTHead>
        <DTBody>
          {isLoading && <DTRow><DTCell colSpan={3} className="py-6 text-center text-muted-foreground">Loading…</DTCell></DTRow>}
          {!isLoading && rows.length === 0 && (
            <DTRow><DTCell colSpan={3} className="py-8 text-center text-emerald-600">All checks passed — period is ready to close</DTCell></DTRow>
          )}
          {[...errors, ...warnings].map((r, i) => (
            <DTRow key={`${r.entry_id}-${i}`}>
              <DTCell className={r.severity === "error" ? "text-destructive font-semibold uppercase text-xs" : "text-amber-600 uppercase text-xs"}>{r.severity}</DTCell>
              <DTCell className="font-medium">{r.full_name}</DTCell>
              <DTCell>{r.issue}</DTCell>
            </DTRow>
          ))}
        </DTBody>
      </DataTable>
    </PageSection>
  );
};


const SlipsPanel = ({ entries, period, periodLabel }: { entries: PayrollEntry[]; period: any; periodLabel: string }) => (
  <PageSection card={false}>
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      {entries.map(e => (
        <div key={e.id} className="rounded-md border border-border bg-card p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="font-semibold">{e.snapshot_full_name}</div>
              <div className="text-xs text-muted-foreground">{e.snapshot_position} · {periodLabel}</div>
            </div>
            <Button size="sm" variant="outline" onClick={() => exportSingleSalarySlip(e, period)}>
              <Printer className="w-3.5 h-3.5 mr-1" /> PDF
            </Button>
          </div>
          <table className="w-full text-xs mt-3 font-mono">
            <tbody>
              <tr><td className="text-muted-foreground">Basic</td><td className="text-right">{fmt(e.snapshot_basic_salary)}</td></tr>
              <tr><td className="text-muted-foreground">Gross</td><td className="text-right">{fmt(e.gross_salary)}</td></tr>
              <tr><td className="text-muted-foreground">PAYE</td><td className="text-right">({fmt(e.paye)})</td></tr>
              <tr><td className="text-muted-foreground">NSSF</td><td className="text-right">({fmt(e.nssf_employee)})</td></tr>
              <tr><td className="text-muted-foreground">GEPF</td><td className="text-right">({fmt(e.gepf_employee)})</td></tr>
              <tr><td className="font-semibold pt-1">NET</td><td className="text-right font-bold pt-1">{fmt(e.net_salary)}</td></tr>
            </tbody>
          </table>
        </div>
      ))}
    </div>
  </PageSection>
);

const ACTION_LABELS: Record<string, string> = {
  period_created: "Period created",
  period_duplicated: "Duplicated from previous period",
  hr_approved: "HR approved",
  manager_approved: "Manager approved & locked",
  reverted_to_draft: "Reverted to draft",
  unlocked: "Unlocked by administrator",
};

const AuditPanel = ({ periodId }: { periodId: string }) => {
  const { data: log = [], isLoading } = usePayrollAuditLog(periodId);
  return (
    <PageSection card={false}>
      <div className="flex items-center gap-2 mb-3 text-sm text-muted-foreground">
        <History className="w-4 h-4" /> Immutable audit trail — all approvals, reverts and unlocks.
      </div>
      {isLoading ? (
        <div className="text-sm text-muted-foreground p-4">Loading audit log…</div>
      ) : log.length === 0 ? (
        <div className="text-sm text-muted-foreground p-4">No audit entries yet.</div>
      ) : (
        <DataTable>
          <DTHead>
            <DTRow>
              <DTHeader>When</DTHeader>
              <DTHeader>Action</DTHeader>
              <DTHeader>Actor</DTHeader>
              <DTHeader>Details</DTHeader>
            </DTRow>
          </DTHead>
          <DTBody>
            {log.map(row => (
              <DTRow key={row.id}>
                <DTCell className="font-mono text-xs whitespace-nowrap">{fmtDateTime(row.created_at)}</DTCell>
                <DTCell className="font-medium">{ACTION_LABELS[row.action] ?? row.action}</DTCell>
                <DTCell className="font-mono text-xs text-muted-foreground">
                  {row.actor_id ? row.actor_id.slice(0, 8) : "—"}
                </DTCell>
                <DTCell className="text-xs text-muted-foreground">
                  {row.details && Object.keys(row.details).length > 0
                    ? <code className="font-mono">{JSON.stringify(row.details)}</code>
                    : "—"}
                </DTCell>
              </DTRow>
            ))}
          </DTBody>
        </DataTable>
      )}
    </PageSection>
  );
};

const BankExportButton = ({ entries, period }: any) => {
  const [open, setOpen] = useState(false);
  const [fmtSel, setFmtSel] = useState<BankFormat>("default");
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <FileSpreadsheet className="w-4 h-4 mr-1" /> Bank CSV
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Export Bank CSV</DialogTitle></DialogHeader>
          <div className="space-y-2 py-2">
            <label className="block text-sm">
              <input type="radio" name="bf" checked={fmtSel === "default"} onChange={() => setFmtSel("default")} className="mr-2" />
              BANK1 default (ID, NAME, ACCOUNT, AMOUNT, BANK, BRANCH, DESCRIPTION)
            </label>
            <label className="block text-sm">
              <input type="radio" name="bf" checked={fmtSel === "crdb"} onChange={() => setFmtSel("crdb")} className="mr-2" />
              CRDB (CRDB_SALARY_&lt;MONTH&gt;_&lt;YEAR&gt;.csv)
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => { exportBankCsv(entries, period, fmtSel); setOpen(false); }}>Export</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default PayrollPeriodPage;
