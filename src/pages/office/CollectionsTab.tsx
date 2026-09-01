/**
 * Office → Collections
 * Ledger of cash collections (money taken out of the casino) and returns.
 * Stored in fin_other_incomes with source = "collection", signed:
 *   negative → collected (money OUT of the wallet)
 *   positive → returned  (money back IN)
 * Never income. Nets into the Collections group of the Monthly Report.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
import { useFinWallets, useFinCategories } from "@/hooks/use-fin";
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
import { defaultPostingDate, isOutsideWindow } from "@/lib/office-posting-date";
import { toast } from "sonner";

type Filter = "all" | "out" | "in";

/** One line of the ledger — either a signed entry of this tab, or a legacy expense row. */
type Row = {
  id: string;
  origin: "entry" | "expense";
  business_date: string;
  category: string;
  wallet: string;
  currency: string;
  /** Signed: negative = collected (money out), positive = returned (money in). */
  amount: number;
  amount_tzs: number;
  note: string;
  raw?: OtherIncomeRow;
};

export default function CollectionsTab() {
  const { roles } = useAuth();
  const canWrite =
    roles.includes("super_admin") ||
    roles.includes("finance_manager") ||
    roles.includes("manager");

  const { period } = useOfficePeriod();
  const range = { from: period.from, to: period.to };

  const { data: allEntries = [], isLoading } = useOtherIncomes(range.from, range.to, {
    only: ["collection"],
  });
  const { data: wallets = [] } = useFinWallets();
  const { data: categories = [] } = useFinCategories();
  const addIncome = useAddOtherIncome();
  const updateIncome = useUpdateOtherIncome();
  const deleteIncome = useDeleteOtherIncome();

  /** Collections-group categories (Collection, CAPEX, Money Change…). */
  const collectionCats = useMemo(
    () => (categories as any[]).filter((c) => c.group_code === "collections" && c.is_active),
    [categories],
  );
  const collectionCatIds = useMemo(
    () => (categories as any[]).filter((c) => c.group_code === "collections").map((c) => c.id),
    [categories],
  );

  // Historical collections were (and still are) booked as expenses in the
  // Collections categories — show them here read-only so the tab is complete.
  const { data: legacy = [], isLoading: loadingLegacy } = useQuery({
    queryKey: ["collections-expenses", range.from, range.to, collectionCatIds.length],
    enabled: collectionCatIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expenses")
        .select(
          "id, business_date, amount, amount_tzs, currency, description, fin_category_id, wallet_id, voided_at, fin_categories(name), fin_wallets(name)",
        )
        .in("fin_category_id", collectionCatIds)
        .gte("business_date", range.from)
        .lte("business_date", range.to)
        .is("voided_at", null)
        .order("business_date", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const [filter, setFilter] = useState<Filter>("all");
  const [catFilter, setCatFilter] = useState<string>("all");
  const [walletFilter, setWalletFilter] = useState<string>("all");
  const [grouped, setGrouped] = useState(false);

  const allRows: Row[] = useMemo(() => {
    const entries: Row[] = (allEntries as OtherIncomeRow[]).map((r) => ({
      id: r.id,
      origin: "entry",
      business_date: r.business_date,
      category: r.fin_categories?.name || "Collection",
      wallet: r.fin_wallets?.name || "—",
      currency: r.currency,
      amount: Number(r.amount || 0),
      amount_tzs: Number(r.amount || 0) * Number(r.fx_rate || 1),
      note: r.note || "",
      raw: r,
    }));
    // Expenses are stored positive = money leaving → shown as collected (negative).
    // A negative expense amount means the cash came back → shown as returned (+).
    const old: Row[] = (legacy as any[]).map((e) => ({
      id: e.id,
      origin: "expense",
      business_date: e.business_date,
      category: e.fin_categories?.name || "—",
      wallet: e.fin_wallets?.name || "—",
      currency: e.currency || "TZS",
      amount: -Number(e.amount || 0),
      amount_tzs: -Number(e.amount_tzs ?? e.amount ?? 0),
      note: e.description || "",
      expense_amount: Number(e.amount || 0),
      expense_currency: (e.currency || "TZS") as any,
    }));
    return [...entries, ...old].sort((a, b) => b.business_date.localeCompare(a.business_date));
  }, [allEntries, legacy]);

  const rows = useMemo(
    () =>
      allRows.filter((r) => {
        if (filter !== "all" && (r.amount < 0 ? "out" : "in") !== filter) return false;
        if (catFilter !== "all" && r.category !== catFilter) return false;
        if (walletFilter !== "all" && r.wallet !== walletFilter) return false;
        return true;
      }),
    [allRows, filter, catFilter, walletFilter],
  );

  /** Distinct values for the filter selectors (from the loaded period). */
  const catOptions = useMemo(
    () => Array.from(new Set(allRows.map((r) => r.category))).sort(),
    [allRows],
  );
  const walletOptions = useMemo(
    () => Array.from(new Set(allRows.map((r) => r.wallet))).sort(),
    [allRows],
  );

  /** Totals in TZS of the CURRENT selection — collected (OUT), returned (IN), net. */
  const totals = useMemo(() => sumRows(rows), [rows]);

  /** Rows grouped by category, each with its own subtotals. */
  const byCategory = useMemo(() => {
    const map = new Map<string, Row[]>();
    rows.forEach((r) => {
      const arr = map.get(r.category) || [];
      arr.push(r);
      map.set(r.category, arr);
    });
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([category, list]) => ({ category, list, totals: sumRows(list) }));
  }, [rows]);



  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [mode, setMode] = useState<"out" | "in">("out");
  const [form, setForm] = useState({
    business_date: defaultPostingDate(range),
    wallet_id: "",
    fin_category_id: "",
    currency: "TZS",
    amount: "",
    note: "",
  });

  const activeWallet = (wallets as any[]).find((w) => w.id === form.wallet_id);
  const defaultWalletId = useMemo(() => {
    const tzs = (wallets as any[]).filter((x) => (x.currency || "TZS") === "TZS");
    return (tzs.find((x) => x.kind === "cash") || tzs[0])?.id || "";
  }, [wallets]);
  const defaultCategoryId = useMemo(
    () => collectionCats.find((c) => c.name === "Collection")?.id || collectionCats[0]?.id || "",
    [collectionCats],
  );

  const openAdd = (m: "out" | "in") => {
    setEditId(null);
    setMode(m);
    setForm({
      business_date: defaultPostingDate(range),
      wallet_id: defaultWalletId,
      fin_category_id: defaultCategoryId,
      currency: "TZS",
      amount: "",
      note: "",
    });
    setDialogOpen(true);
  };

  const openEdit = (r: OtherIncomeRow) => {
    setEditId(r.id);
    setMode(Number(r.amount) < 0 ? "out" : "in");
    setForm({
      business_date: r.business_date,
      wallet_id: r.wallet_id,
      fin_category_id: r.fin_category_id || "",
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
      fin_category_id: form.fin_category_id || null,
      source: "collection" as const,
      currency: activeWallet?.currency || form.currency,
      amount: mode === "out" ? -raw : raw,
      note: form.note,
    };
    if (editId) await updateIncome.mutateAsync({ id: editId, ...payload });
    else await addIncome.mutateAsync(payload);
    setDialogOpen(false);
  };

  const columns: ColumnDef<Row>[] = [
    {
      key: "date",
      header: "Date",
      type: "date",
      accessor: (r) => <span className="font-mono text-xs">{fmtDateOnly(r.business_date)}</span>,
      style: { width: 110 },
    },
    {
      key: "direction",
      header: "Direction",
      accessor: (r) => {
        const out = r.amount < 0;
        return (
          <span
            className={cn(
              "text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border",
              out
                ? "border-primary/30 bg-primary/10 text-primary"
                : "border-warning/40 bg-warning/10 text-warning",
            )}
            title={out ? "Cash collected — leaves the wallet" : "Cash returned — comes back into the wallet"}
          >
            {out ? "Collected" : "Returned"}
          </span>
        );
      },
      style: { width: 110 },
    },
    {
      key: "category",
      header: "Category",
      accessor: (r) => (
        <span className="text-xs uppercase tracking-wider text-muted-foreground">
          {r.category}
          {r.origin === "expense" && (
            <span
              className="ml-1.5 rounded border border-border px-1 py-0.5 text-[9px] tracking-wider"
              title="Booked as an expense in a Collections category — edit it in the Expenses module"
            >
              EXP
            </span>
          )}
        </span>
      ),
      style: { width: 170 },
    },
    {
      key: "wallet",
      header: "Wallet",
      accessor: (r) => (
        <span>
          {r.wallet} <span className="text-[10px] text-muted-foreground">{r.currency}</span>
        </span>
      ),
    },
    {
      key: "amount",
      header: "Amount",
      type: "money",
      accessor: (r) => (
        <span
          className={cn(
            "font-mono tabular-nums",
            r.amount < 0 ? "cms-amount-negative" : "cms-amount-positive",
          )}
        >
          {r.amount < 0 ? "−" : ""}
          {formatNumberSpaces(Math.abs(r.amount))}
        </span>
      ),
      style: { width: 140 },
    },
    {
      key: "note",
      header: "Note",
      accessor: (r) => (
        <span className="text-xs text-muted-foreground truncate max-w-[300px] inline-block">{r.note}</span>
      ),
    },
    {
      key: "actions",
      header: "",
      type: "actions",
      accessor: (r) => {
        if (!canWrite || r.origin !== "entry" || !r.raw) return null;
        const raw = r.raw;
        return (
          <div className="flex items-center gap-0.5">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(raw)} aria-label="Edit">
              <Pencil className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive"
              onClick={() => {
                if (confirm("Delete this collection entry? This is logged in the finance audit log."))
                  deleteIncome.mutate(raw.id);
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
    { value: "out", label: "Collected" },
    { value: "in", label: "Returned" },
  ];

  return (
    <PageShell>
      {canWrite && (
        <OfficeActions>
          <Button onClick={() => openAdd("in")} size="sm" variant="outline">
            <Plus className="w-4 h-4" /> Return (IN)
          </Button>
          <Button onClick={() => openAdd("out")} size="sm">
            <Minus className="w-4 h-4" /> Add Collection (OUT)
          </Button>
        </OfficeActions>
      )}

      <div className="grid gap-3 lg:grid-cols-4">
        <div className="grid grid-cols-2 gap-3 lg:col-span-3">
          <TotalCard label="Collected (OUT)" value={totals.outSum} />
          <TotalCard label="Returned (IN)" value={totals.inSum} />
        </div>
        <TotalCard
          label="Net Collected"
          value={totals.net}
          strong
          className="lg:h-full lg:flex lg:flex-col lg:justify-center"
        />
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
          loading={isLoading || loadingLegacy}
          empty={
            <div className="text-sm text-muted-foreground text-center py-10">
              No collections in this period.
            </div>
          }
        />
      </PageSection>

      <ResponsiveDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={editId ? "Edit collection" : mode === "out" ? "Add Collection (OUT)" : "Return (IN)"}
      >
        <FormGrid>
          <FormField span={6} label="Business Date">
            <Input
              type="date"
              value={form.business_date}
              onChange={(e) => setForm({ ...form, business_date: e.target.value })}
              className={cn(
                isOutsideWindow(form.business_date, range) &&
                  "border-amber-500 text-amber-600 dark:text-amber-400",
              )}
              title={
                isOutsideWindow(form.business_date, range)
                  ? "Date is outside the selected month window"
                  : "Posting date"
              }
            />
          </FormField>
          <FormField span={6} label="Direction">
            <Select value={mode} onValueChange={(v) => setMode(v as "out" | "in")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="out">Collected — money out (−)</SelectItem>
                <SelectItem value="in">Returned — money in (+)</SelectItem>
              </SelectContent>
            </Select>
          </FormField>

          <FormField span={6} label="Category">
            <Select
              value={form.fin_category_id}
              onValueChange={(v) => setForm({ ...form, fin_category_id: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select category…" />
              </SelectTrigger>
              <SelectContent>
                {collectionCats.map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
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

const TotalCard = ({
  label,
  value,
  strong,
  className,
}: {
  label: string;
  value: number;
  strong?: boolean;
  className?: string;
}) => (
  <div className={cn("rounded-md border border-border bg-card px-3 py-2", strong && "border-primary/40 bg-primary/5", className)}>
    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
    <p
      className={cn(
        "font-mono tabular-nums",
        strong ? "text-3xl font-bold" : "text-xl",
        value < 0 ? "cms-amount-negative" : value > 0 ? "cms-amount-positive" : "text-muted-foreground",
      )}
    >
      {value < 0 ? "−" : ""}
      {formatNumberSpaces(Math.abs(Math.round(value)))}
    </p>
  </div>
);
