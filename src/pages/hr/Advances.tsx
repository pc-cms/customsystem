/**
 * HR Advances — monthly salary-advance sheet.
 *
 * Rows are entered per employee, printed for signature, and pulled into the
 * payroll period on Refresh (salary_advances → deducted from net pay).
 */
import { useMemo, useState } from "react";
import { HandCoins, Plus, Pencil, Trash2, Printer } from "lucide-react";
import { PageShell, PageSection } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { MonthCarousel, useMonthFromUrl } from "@/components/payroll/MonthCarousel";
import { DataTable, DTHead, DTBody, DTRow, DTHeader, DTCell } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NumberInput } from "@/components/ui/number-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth-context";
import { useCasino } from "@/lib/casino-context";
import { useEmployees } from "@/hooks/use-payroll";
import {
  useStaffAdvances, useSaveStaffAdvance, useDeleteStaffAdvance, type StaffAdvance,
} from "@/hooks/use-staff-advances";
import { fmtDate } from "@/lib/format-date";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const fmt = (n: number) => new Intl.NumberFormat("en-US").format(n).replace(/,/g, " ");
const esc = (s: string) => s.replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));

export default function HrAdvances() {
  const { roles } = useAuth();
  const { activeCasino } = useCasino();
  const canEdit = roles.some(r => ["super_admin", "hr", "finance_manager", "manager"].includes(r));

  const { year, month, setYM } = useMonthFromUrl();
  const { data: employees = [] } = useEmployees();
  const { data: advances = [], isLoading } = useStaffAdvances(year, month);
  const save = useSaveStaffAdvance();
  const del = useDeleteStaffAdvance();

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Partial<StaffAdvance>>({});

  const empName = useMemo(() => {
    const m = new Map<string, string>();
    employees.forEach(e => m.set(e.id, e.full_name));
    return m;
  }, [employees]);

  const empDept = useMemo(() => {
    const m = new Map<string, string>();
    employees.forEach(e => m.set(e.id, e.department || ""));
    return m;
  }, [employees]);

  const total = advances.reduce((s, a) => s + Number(a.amount || 0), 0);
  const monthLabel = `${MONTHS[month - 1]} ${year}`;

  const openNew = () => {
    setDraft({
      year, month,
      advance_date: `${year}-${String(month).padStart(2, "0")}-01`,
      amount: 0, paid_out: false,
    });
    setOpen(true);
  };

  const submit = async () => {
    if (!draft.employee_id || !draft.amount) return;
    await save.mutateAsync({ ...draft, year, month });
    setOpen(false);
  };

  const print = () => {
    const rows = advances.map((a, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${esc(empName.get(a.employee_id) ?? "—")}</td>
        <td>${esc(empDept.get(a.employee_id) ?? "")}</td>
        <td>${fmtDate(a.advance_date)}</td>
        <td class="num">${fmt(Number(a.amount))}</td>
        <td>${esc(a.note ?? "")}</td>
        <td class="sign"></td>
      </tr>`).join("");
    const w = window.open("", "_blank");
    if (!w) { alert("Popup blocked — allow popups for this site"); return; }
    w.document.write(`<!doctype html><html><head><title>Salary Advances ${monthLabel}</title>
      <style>
        @page { size: A4 portrait; margin: 12mm; }
        body{font-family:Arial,sans-serif;font-size:11px;color:#000}
        h1{font-size:15px;margin:0}
        .sub{font-size:11px;margin:2px 0 12px 0}
        table{width:100%;border-collapse:collapse}
        th,td{border:1px solid #444;padding:4px 6px;text-align:left}
        th{background:#eee;text-transform:uppercase;font-size:10px}
        .num{text-align:right;font-family:'Courier New',monospace}
        .sign{width:110px}
        tfoot td{font-weight:bold}
        .foot{margin-top:24px;display:flex;justify-content:space-between;font-size:11px}
      </style></head><body>
      <h1>SALARY ADVANCES — ${esc(activeCasino?.name ?? "")}</h1>
      <div class="sub">${monthLabel} · ${advances.length} employees</div>
      <table>
        <thead><tr><th>#</th><th>Employee</th><th>Department</th><th>Date</th><th class="num">Amount</th><th>Note</th><th>Signature</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="7">No advances recorded</td></tr>`}</tbody>
        <tfoot><tr><td colspan="4">TOTAL</td><td class="num">${fmt(total)}</td><td></td><td></td></tr></tfoot>
      </table>
      <div class="foot"><div>Prepared by: ______________________</div><div>Approved by: ______________________</div></div>
      <script>window.onload=()=>setTimeout(()=>window.print(),300)</script>
      </body></html>`);
    w.document.close();
  };

  return (
    <PageShell>
      <PageHeader icon={HandCoins} title="Salary Advances"
        subtitle="Deducted from net pay when the payroll month is refreshed.">
        <MonthCarousel year={year} month={month} onChange={setYM} />
        <Button size="sm" variant="outline" onClick={print}>
          <Printer className="w-4 h-4 mr-1" /> Print Sheet
        </Button>
        {canEdit && <Button size="sm" onClick={openNew}><Plus className="w-4 h-4 mr-1" /> Add Advance</Button>}
      </PageHeader>

      <PageSection card={false}>
        <DataTable>
          <DTHead>
            <DTRow>
              <DTHeader>Employee</DTHeader>
              <DTHeader>Department</DTHeader>
              <DTHeader>Date</DTHeader>
              <DTHeader align="right">Amount</DTHeader>
              <DTHeader>Note</DTHeader>
              <DTHeader>Paid Out</DTHeader>
              <DTHeader />
            </DTRow>
          </DTHead>
          <DTBody>
            {isLoading && <DTRow><DTCell colSpan={7} className="py-6 text-center text-muted-foreground">Loading…</DTCell></DTRow>}
            {!isLoading && advances.length === 0 && (
              <DTRow><DTCell colSpan={7} className="py-8 text-center text-muted-foreground">No advances for {monthLabel}</DTCell></DTRow>
            )}
            {advances.map(a => (
              <DTRow key={a.id}>
                <DTCell className="font-medium">{empName.get(a.employee_id) ?? "—"}</DTCell>
                <DTCell className="text-muted-foreground">{empDept.get(a.employee_id) || "·"}</DTCell>
                <DTCell>{fmtDate(a.advance_date)}</DTCell>
                <DTCell numeric className="font-semibold">{fmt(Number(a.amount))}</DTCell>
                <DTCell className="text-muted-foreground">{a.note || "·"}</DTCell>
                <DTCell>{a.paid_out ? "Yes" : "·"}</DTCell>
                <DTCell>
                  {canEdit && (
                    <div className="flex gap-1 justify-end">
                      <Button size="sm" variant="ghost" onClick={() => { setDraft(a); setOpen(true); }}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => del.mutate(a.id)}>
                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                      </Button>
                    </div>
                  )}
                </DTCell>
              </DTRow>
            ))}
            {advances.length > 0 && (
              <DTRow className="bg-muted/40 font-semibold border-t-2 border-border">
                <DTCell>TOTAL</DTCell>
                <DTCell /><DTCell />
                <DTCell numeric>{fmt(total)}</DTCell>
                <DTCell /><DTCell /><DTCell />
              </DTRow>
            )}
          </DTBody>
        </DataTable>
      </PageSection>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{draft.id ? "Edit Advance" : `New Advance — ${monthLabel}`}</DialogTitle></DialogHeader>
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
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Date</Label>
              <Input type="date" value={draft.advance_date ?? ""} onChange={e => setDraft({ ...draft, advance_date: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Amount</Label>
              <NumberInput value={draft.amount ?? 0} onValueChange={v => setDraft({ ...draft, amount: v ?? 0 })} className="font-mono" />
            </div>
            <div className="col-span-2 space-y-1">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Note</Label>
              <Input value={draft.note ?? ""} onChange={e => setDraft({ ...draft, note: e.target.value })} />
            </div>
            <div className="col-span-2 space-y-1">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Paid Out</Label>
              <Select value={draft.paid_out ? "yes" : "no"} onValueChange={v => setDraft({ ...draft, paid_out: v === "yes" })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="no">Not yet</SelectItem>
                  <SelectItem value="yes">Yes</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={!draft.employee_id || !draft.amount || save.isPending}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
