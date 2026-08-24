/**
 * Office → Tips & Bonuses
 * Ledger of tips and bonuses, split into two separate kinds:
 *   source = "tips"  → Tips
 *   source = "bonus" → Bonus
 * Direction is carried by the sign: collected (IN, positive) and paid out /
 * distributed (OUT, negative). Stored in fin_other_incomes, excluded from the
 * Transactions tab. Built after the JP tab pattern.
 */
import { useMemo, useState } from "react";
import { Plus, Minus, Pencil, Trash2 } from "lucide-react";
import { PageShell, PageSection } from "@/components/layout/PageShell";
import { OfficeActions, useOfficePeriod } from "@/components/office/office-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { FormGrid, FormField } from "@/components/ui/form-grid";
import { SmartTable, type ColumnDef } from "@/components/ui/smart-table";
import { useFinWallets } from "@/hooks/use-fin";
import {
  useOtherIncomes,
  useAddOtherIncome,
  useUpdateOtherIncome,
  useDeleteOtherIncome,
  type OtherIncomeRow,
} from "@/hooks/use-other-incomes";
import { formatNumberSpaces } from "@/lib/currency";
import { fmtDateOnly } from "@/lib/format-date";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

/** Sources shown on this tab. `tips_bonus` is legacy (pre-split rows). */
const TIPS_SOURCES = ["tips", "bonus", "tips_bonus"] as const;

type Kind = "tips" | "bonus";
type Filter = "all" | Kind;

const kindOf = (r: OtherIncomeRow): Kind => (r.source === "bonus" ? "bonus" : "tips");

export default function TipsBonusTab() {
  const { roles } = useAuth();
  const canWrite =
    roles.includes("super_admin") ||
    roles.includes("finance_manager") ||
    roles.includes("manager");

  const { period } = useOfficePeriod();
  const range = { from: period.from, to: period.to };

  const { data: allRows = [], isLoading } = useOtherIncomes(range.from, range.to, {
    only: [...TIPS_SOURCES] as any,
  });
  const { data: wallets = [] } = useFinWallets();
  const addIncome = useAddOtherIncome();
  const updateIncome = useUpdateOtherIncome();
  const deleteIncome = useDeleteOtherIncome();

  const [filter, setFilter] = useState<Filter>("all");

  const rows = useMemo(
    () =>
      filter === "all"
        ? (allRows as OtherIncomeRow[])
        : (allRows as OtherIncomeRow[]).filter((r) => kindOf(r) === filter),
    [allRows, filter],
  );

  /** Totals per kind (in TZS) — IN, OUT and net. */
  const totals = useMemo(() => {
    const empty = () => ({ inSum: 0, outSum: 0, net: 0 });
    const acc = { tips: empty(), bonus: empty() };
    (allRows as OtherIncomeRow[]).forEach((r) => {
      const v = Number(r.amount || 0) * Number(r.fx_rate || 1);
      const bucket = acc[kindOf(r)];
      if (v >= 0) bucket.inSum += v;
      else bucket.outSum += v;
      bucket.net += v;
    });
    return { ...acc, net: acc.tips.net + acc.bonus.net };
  }, [allRows]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [mode, setMode] = useState<"in" | "out">("in");
  const [kind, setKind] = useState<Kind>("tips");
  const [form, setForm] = useState({
    business_date: new Date().toISOString().slice(0, 10),
    wallet_id: "",
    currency: "TZS",
    amount: "",
    note: "",
  });

  const activeWallet = (wallets as any[]).find((w) => w.id === form.wallet_id);
  const defaultWalletId = useMemo(() => {
    const tzs = (wallets as any[]).filter((x) => (x.currency || "TZS") === "TZS");
    return (tzs.find((x) => x.kind === "cash") || tzs[0])?.id || "";
  }, [wallets]);

  const openAdd = (m: "in" | "out") => {
    setEditId(null);
    setMode(m);
    setKind(filter === "bonus" ? "bonus" : "tips");
    setForm({
      business_date: new Date().toISOString().slice(0, 10),
      wallet_id: defaultWalletId,
      currency: "TZS",
      amount: "",
      note: "",
    });
    setDialogOpen(true);
  };

  const openEdit = (r: OtherIncomeRow) => {
    setEditId(r.id);
    setMode(Number(r.amount) < 0 ? "out" : "in");
    setKind(kindOf(r));
    setForm({
      business_date: r.business_date,
      wallet_id: r.wallet_id,
      currency: r.currency,
      amount: String(Math.abs(Number(r.amount))),
      note: r.note || "",
    });
    setDialogOpen(true);
  };

  const submit = async () => {
    if (!form.wallet_id) return toast.error("Select wallet");
    const raw = Math.abs(Number(form.amount));
    if (!raw) return toast.error("Amount must not be 0");
    const payload = {
      business_date: form.business_date,
      wallet_id: form.wallet_id,
      fin_category_id: null,
      source: kind,
      currency: activeWallet?.currency || form.currency,
      amount: mode === "out" ? -raw : raw,
      note: form.note,
    };
    if (editId) await updateIncome.mutateAsync({ id: editId, ...payload });
    else await addIncome.mutateAsync(payload);
    setDialogOpen(false);
  };

  const columns: ColumnDef<OtherIncomeRow>[] = [
    {
      key: "date",
      header: "Date",
      type: "date",
      accessor: (r) => <span className="font-mono text-xs">{fmtDateOnly(r.business_date)}</span>,
      style: { width: 110 },
    },
    {
      key: "kind",
      header: "Type",
      accessor: (r) => {
        const k = kindOf(r);
        return (
          <span
            className={cn(
              "text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border",
              k === "bonus"
                ? "border-amber-500/30 bg-amber-500/10 text-amber-500"
                : "border-primary/30 bg-primary/10 text-primary",
            )}
          >
            {k === "bonus" ? "Bonus" : "Tips"}
          </span>
        );
      },
      style: { width: 90 },
    },
    {
      key: "direction",
      header: "Direction",
      accessor: (r) => (
        <span className="text-xs uppercase tracking-wider text-muted-foreground">
          {Number(r.amount) < 0 ? "Paid out" : "Collected"}
        </span>
      ),
      style: { width: 110 },
    },
    {
      key: "wallet",
      header: "Wallet",
      accessor: (r) => (
        <span>
          {r.fin_wallets?.name || "—"}{" "}
          <span className="text-[10px] text-muted-foreground">{r.currency}</span>
        </span>
      ),
    },
    {
      key: "amount",
      header: "Amount",
      type: "money",
      accessor: (r) => {
        const v = Number(r.amount);
        return (
          <span className={cn("font-mono tabular-nums", v < 0 ? "cms-amount-negative" : "cms-amount-positive")}>
            {v < 0 ? "−" : ""}
            {formatNumberSpaces(Math.abs(v))}
          </span>
        );
      },
      style: { width: 140 },
    },
    {
      key: "note",
      header: "Note",
      accessor: (r) => (
        <span className="text-xs text-muted-foreground truncate max-w-[300px] inline-block">
          {r.note || ""}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      type: "actions",
      accessor: (r) => {
        if (!canWrite) return null;
        return (
          <div className="flex items-center gap-0.5">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(r)} aria-label="Edit">
              <Pencil className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive"
              onClick={() => {
                if (confirm("Delete this Tips / Bonus entry permanently?")) deleteIncome.mutate(r.id);
              }}
              aria-label="Delete"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        );
      },
      style: { width: 90 },
    },
  ];

  const FILTERS: { value: Filter; label: string }[] = [
    { value: "all", label: "All" },
    { value: "tips", label: "Tips" },
    { value: "bonus", label: "Bonuses" },
  ];

  return (
    <PageShell>
      {canWrite && (
        <OfficeActions>
          <Button onClick={() => openAdd("out")} size="sm" variant="outline">
            <Minus className="w-4 h-4" /> Payout (OUT)
          </Button>
          <Button onClick={() => openAdd("in")} size="sm">
            <Plus className="w-4 h-4" /> Add Tips / Bonus
          </Button>
        </OfficeActions>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <TotalCard label="Tips IN" value={totals.tips.inSum} />
        <TotalCard label="Tips OUT" value={totals.tips.outSum} />
        <TotalCard label="Bonuses IN" value={totals.bonus.inSum} />
        <TotalCard label="Bonuses OUT" value={totals.bonus.outSum} />
        <TotalCard label="Tips Net" value={totals.tips.net} />
        <TotalCard label="Bonuses Net" value={totals.bonus.net} />
        <TotalCard label="Total Net" value={totals.net} strong />
      </div>

      <div className="flex items-center gap-1.5">
        {FILTERS.map((f) => (
          <Button
            key={f.value}
            size="sm"
            variant={filter === f.value ? "default" : "outline"}
            className="h-7 px-3 text-xs"
            onClick={() => setFilter(f.value)}
          >
            {f.label}
          </Button>
        ))}
      </div>

      <PageSection card={false}>
        <SmartTable
          data={rows}
          columns={columns}
          rowKey={(r) => r.id}
          loading={isLoading}
          empty={
            <div className="text-sm text-muted-foreground text-center py-10">
              No tips or bonus entries in this period.
            </div>
          }
        />
      </PageSection>

      <ResponsiveDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={editId ? "Edit entry" : mode === "out" ? "Payout (OUT)" : "Add Tips / Bonus (IN)"}
      >
        <FormGrid>
          <FormField span={6} label="Business Date">
            <Input
              type="date"
              value={form.business_date}
              onChange={(e) => setForm({ ...form, business_date: e.target.value })}
            />
          </FormField>
          <FormField span={6} label="Type">
            <Select value={kind} onValueChange={(v) => setKind(v as Kind)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tips">Tips</SelectItem>
                <SelectItem value="bonus">Bonus</SelectItem>
              </SelectContent>
            </Select>
          </FormField>

          <FormField span={6} label="Direction">
            <Select value={mode} onValueChange={(v) => setMode(v as "in" | "out")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="in">Collected (IN)</SelectItem>
                <SelectItem value="out">Paid out (OUT)</SelectItem>
              </SelectContent>
            </Select>
          </FormField>
          <FormField span={6} label="Wallet">
            <Select
              value={form.wallet_id}
              onValueChange={(v) => {
                const w = (wallets as any[]).find((x) => x.id === v);
                setForm({ ...form, wallet_id: v, currency: w?.currency || form.currency });
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select wallet…" />
              </SelectTrigger>
              <SelectContent>
                {(wallets as any[]).map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.name} · {w.currency}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <FormField span={6} label={`Amount (${activeWallet?.currency || form.currency})`}>
            <NumberInput
              decimals={2}
              allowNegative
              value={form.amount}
              onValueChange={(v) => setForm({ ...form, amount: v == null ? "" : String(v) })}
              placeholder="0"
            />
          </FormField>

          <FormField span={12} label="Note (optional)">
            <Textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} rows={2} />
          </FormField>
        </FormGrid>

        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => setDialogOpen(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={addIncome.isPending || updateIncome.isPending}>
            {addIncome.isPending || updateIncome.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </ResponsiveDialog>
    </PageShell>
  );
}

const TotalCard = ({ label, value, strong }: { label: string; value: number; strong?: boolean }) => (
  <div className="rounded-md border border-border bg-card px-3 py-2">
    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
    <p
      className={cn(
        "font-mono tabular-nums",
        strong ? "text-2xl font-bold" : "text-xl",
        value < 0 ? "cms-amount-negative" : value > 0 ? "cms-amount-positive" : "text-muted-foreground",
      )}
    >
      {value < 0 ? "−" : ""}
      {formatNumberSpaces(Math.abs(Math.round(value)))}
    </p>
  </div>
);
