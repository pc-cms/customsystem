/**
 * Staff Loans & Advances — ledger of money lent to employees.
 * The monthly installment is pulled into the payroll period on Refresh
 * and deducted from net pay (never below zero).
 */
import { useMemo, useState } from "react";
import { HandCoins, Plus, Save, Trash2 } from "lucide-react";
import { PageShell, PageSection } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { DataTable, DTHead, DTBody, DTRow, DTHeader, DTCell } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth-context";
import {
  useEmployees, useStaffLoans, useSaveStaffLoan, useDeleteStaffLoan, type StaffLoan,
} from "@/hooks/use-payroll";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const fmt = (n: number) => new Intl.NumberFormat("en-US").format(n).replace(/,/g, " ");
const now = new Date();

type Draft = Partial<StaffLoan>;

export default function StaffLoansPage() {
  const { roles } = useAuth();
  const canEdit = roles.some(r => ["super_admin", "hr", "finance_manager", "manager"].includes(r));

  const { data: employees = [] } = useEmployees();
  const { data: loans = [], isLoading } = useStaffLoans();
  const save = useSaveStaffLoan();
  const del = useDeleteStaffLoan();

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>({});

  const empName = useMemo(() => {
    const m = new Map<string, string>();
    employees.forEach(e => m.set(e.id, e.full_name));
    return m;
  }, [employees]);

  const openNew = () => {
    setDraft({
      kind: "loan", principal: 0, monthly_installment: 0,
      start_year: now.getFullYear(), start_month: now.getMonth() + 1, status: "active",
    });
    setOpen(true);
  };

  const submit = async () => {
    if (!draft.employee_id) return;
    await save.mutateAsync(draft);
    setOpen(false);
  };

  return (
    <PageShell>
      <PageHeader icon={HandCoins} title="Staff Loans & Advances"
        subtitle="Installments are deducted automatically when a payroll period is refreshed.">
        {canEdit && <Button size="sm" onClick={openNew}><Plus className="w-4 h-4 mr-1" /> Add Loan</Button>}
      </PageHeader>

      <PageSection card={false}>
        <DataTable>
          <DTHead>
            <DTRow>
              <DTHeader>Employee</DTHeader>
              <DTHeader>Type</DTHeader>
              <DTHeader>Start</DTHeader>
              <DTHeader align="right">Principal</DTHeader>
              <DTHeader align="right">Installment</DTHeader>
              <DTHeader align="right">Repaid</DTHeader>
              <DTHeader align="right">Remaining</DTHeader>
              <DTHeader>Status</DTHeader>
              <DTHeader />
            </DTRow>
          </DTHead>
          <DTBody>
            {isLoading && <DTRow><DTCell colSpan={9} className="py-6 text-center text-muted-foreground">Loading…</DTCell></DTRow>}
            {!isLoading && loans.length === 0 && (
              <DTRow><DTCell colSpan={9} className="py-8 text-center text-muted-foreground">No loans recorded</DTCell></DTRow>
            )}
            {loans.map(l => {
              const repaid = l.repaid ?? 0;
              const remaining = Math.max(l.principal - repaid, 0);
              return (
                <DTRow key={l.id}>
                  <DTCell className="font-medium">{empName.get(l.employee_id) ?? "—"}</DTCell>
                  <DTCell className="capitalize">{l.kind}</DTCell>
                  <DTCell>{MONTHS[l.start_month - 1]} {l.start_year}</DTCell>
                  <DTCell numeric>{fmt(l.principal)}</DTCell>
                  <DTCell numeric>{fmt(l.monthly_installment)}</DTCell>
                  <DTCell numeric className="text-muted-foreground">{fmt(repaid)}</DTCell>
                  <DTCell numeric className="font-semibold">{fmt(remaining)}</DTCell>
                  <DTCell className="capitalize">{remaining === 0 ? "settled" : l.status}</DTCell>
                  <DTCell>
                    {canEdit && (
                      <div className="flex gap-1 justify-end">
                        <Button size="sm" variant="ghost" onClick={() => { setDraft(l); setOpen(true); }}>
                          <Save className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => del.mutate(l.id)}>
                          <Trash2 className="w-3.5 h-3.5 text-destructive" />
                        </Button>
                      </div>
                    )}
                  </DTCell>
                </DTRow>
              );
            })}
          </DTBody>
        </DataTable>
      </PageSection>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{draft.id ? "Edit Loan" : "New Loan"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="col-span-2 space-y-1">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Employee</Label>
              <Select value={draft.employee_id ?? ""} onValueChange={v => setDraft({ ...draft, employee_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                <SelectContent>
                  {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Type</Label>
              <Select value={draft.kind ?? "loan"} onValueChange={v => setDraft({ ...draft, kind: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="loan">Loan</SelectItem>
                  <SelectItem value="advance">Advance</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Status</Label>
              <Select value={draft.status ?? "active"} onValueChange={v => setDraft({ ...draft, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="paused">Paused</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Principal</Label>
              <NumberInput value={draft.principal ?? 0} onValueChange={v => setDraft({ ...draft, principal: v ?? 0 })} className="font-mono" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Monthly Installment</Label>
              <NumberInput value={draft.monthly_installment ?? 0} onValueChange={v => setDraft({ ...draft, monthly_installment: v ?? 0 })} className="font-mono" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Start Month</Label>
              <Select value={String(draft.start_month ?? now.getMonth() + 1)} onValueChange={v => setDraft({ ...draft, start_month: Number(v) })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Start Year</Label>
              <NumberInput value={draft.start_year ?? now.getFullYear()} onValueChange={v => setDraft({ ...draft, start_year: v ?? now.getFullYear() })} className="font-mono" />
            </div>
            <div className="col-span-2 space-y-1">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Note</Label>
              <Input value={draft.note ?? ""} onChange={e => setDraft({ ...draft, note: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={!draft.employee_id || save.isPending}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
