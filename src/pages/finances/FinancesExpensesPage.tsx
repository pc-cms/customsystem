import { useMemo, useState } from "react";
import { Receipt, Plus, Trash2, ArrowUp, ArrowDown, Filter, Pencil } from "lucide-react";
import EditExpenseDialog, { type EditableExpense } from "@/components/expenses/EditExpenseDialog";
import { PageShell, PageSection } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import FinanceCasinoSwitcher from "@/components/finances/FinanceCasinoSwitcher";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { FormGrid, FormField } from "@/components/ui/form-grid";
import { YearSelect } from "@/components/ui/year-select";
import {
  useFinExpenses, useCreateFinExpense, useVoidFinExpense,
  useFinCategories, useFinWallets, useFinBudget
} from "@/hooks/use-fin";
import { useAuth } from "@/lib/auth-context";
import { formatNumberSpaces } from "@/lib/currency";
import {
  FinTable, FinTHead, FinTBody, FinTR, FinTH, FinTD,
  FinAmount, FinDate, FinTrunc, FinEmpty, FW,
} from "@/components/finances/FinTable";

const todayBD = () => new Date().toISOString().slice(0, 10);
const pad = (n: number) => String(n).padStart(2, "0");
const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

type Period = "day" | "week" | "month" | "year" | "ytd" | "all" | "custom";

function computeRange(period: Period, anchor: string): { from?: string; to?: string } {
  const d = new Date(anchor + "T00:00:00");
  if (period === "day") return { from: anchor, to: anchor };
  if (period === "week") {
    const day = d.getDay(); // 0 = Sun
    const from = new Date(d);
    from.setDate(d.getDate() - day);
    const to = new Date(from);
    to.setDate(from.getDate() + 6);
    return { from: fmt(from), to: fmt(to) };
  }
  if (period === "month") {
    const from = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`;
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    const to = `${last.getFullYear()}-${pad(last.getMonth() + 1)}-${pad(last.getDate())}`;
    return { from, to };
  }
  if (period === "year") {
    return { from: `${d.getFullYear()}-01-01`, to: `${d.getFullYear()}-12-31` };
  }
  if (period === "ytd") return { from: `${d.getFullYear()}-01-01`, to: todayBD() };
  return {};
}

type SortKey = "date" | "category" | "wallet" | "amount";

interface FinancesExpensesPageProps {
  embedded?: boolean;
  embeddedFrom?: string;
  embeddedTo?: string;
}

export default function FinancesExpensesPage({ embedded = false, embeddedFrom, embeddedTo }: FinancesExpensesPageProps = {}) {
  const { roles } = useAuth();
  const canManage = roles.includes("super_admin") || roles.includes("manager") || roles.includes("finance_manager");

  const [period, setPeriod] = useState<Period>("month");
  const [anchor, setAnchor] = useState<string>(todayBD());
  const [customFrom, setCustomFrom] = useState<string>(todayBD());
  const [customTo, setCustomTo] = useState<string>(todayBD());
  const range = embedded && embeddedFrom && embeddedTo
    ? { from: embeddedFrom, to: embeddedTo }
    : period === "custom" ? { from: customFrom, to: customTo } : computeRange(period, anchor);

  const shiftMonth = (delta: number) => {
    const d = new Date(anchor + "T00:00:00");
    d.setDate(1);
    d.setMonth(d.getMonth() + delta);
    setAnchor(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`);
  };

  const shiftWeek = (delta: number) => {
    const d = new Date(anchor + "T00:00:00");
    d.setDate(d.getDate() + delta * 7);
    setAnchor(fmt(d));
  };

  const shiftYear = (delta: number) => {
    const d = new Date(anchor + "T00:00:00");
    d.setFullYear(d.getFullYear() + delta);
    setAnchor(`${d.getFullYear()}-01-01`);
  };

  const resetFilters = () => {
    setSearch("");
    setCategoryFilter("all");
    setWalletFilter("all");
    setPeriod("month");
    setAnchor(todayBD());
  };

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [walletFilter, setWalletFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const { data: rows = [] } = useFinExpenses(range);
  const { data: categories = [] } = useFinCategories();
  const { data: wallets = [] } = useFinWallets();
  const create = useCreateFinExpense();
  const voidExp = useVoidFinExpense();
  const now = new Date();
  const { data: budget = [] } = useFinBudget(now.getFullYear(), now.getMonth() + 1);

  const [open, setOpen] = useState(false);
  const [showVoided, setShowVoided] = useState(false);
  const [editRow, setEditRow] = useState<EditableExpense | null>(null);
  const [form, setForm] = useState<any>({
    business_date: todayBD(), fin_category_id: "", wallet_id: "",
    amount: 0, currency: "TZS", exchange_rate: 1, description: "",
    is_overrun: false, overrun_reason: "",
  });

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = rows.filter((r: any) => {
      if (!showVoided && r.voided_at) return false;
      if (categoryFilter !== "all" && r.fin_category_id !== categoryFilter) return false;
      if (walletFilter !== "all" && r.wallet_id !== walletFilter) return false;
      if (q) {
        const blob = `${r.description || ""} ${r.fin_categories?.name || ""} ${r.fin_categories?.group_name || ""} ${r.fin_wallets?.name || ""}`.toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
    const dir = sortDir === "asc" ? 1 : -1;
    filtered.sort((a: any, b: any) => {
      let av: any, bv: any;
      switch (sortKey) {
        case "date": av = a.business_date || ""; bv = b.business_date || ""; break;
        case "category": av = a.fin_categories?.name || ""; bv = b.fin_categories?.name || ""; break;
        case "wallet": av = a.fin_wallets?.name || ""; bv = b.fin_wallets?.name || ""; break;
        case "amount": av = Number(a.amount_tzs || a.amount || 0); bv = Number(b.amount_tzs || b.amount || 0); break;
      }
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
    return filtered;
  }, [rows, showVoided, categoryFilter, walletFilter, search, sortKey, sortDir]);

  const totalTzs = useMemo(
    () => visible.reduce((s: number, r: any) => s + (r.voided_at ? 0 : Number(r.amount_tzs || r.amount || 0)), 0),
    [visible],
  );

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir(k === "date" || k === "amount" ? "desc" : "asc"); }
  };
  const SortIcon = ({ k }: { k: SortKey }) =>
    sortKey === k ? (sortDir === "asc" ? <ArrowUp className="w-3 h-3 inline ml-0.5" /> : <ArrowDown className="w-3 h-3 inline ml-0.5" />) : null;

  const overrunCheck = useMemo(() => {
    if (!form.fin_category_id || !form.amount) return null;
    const b = (budget || []).find((x: any) => x.category_id === form.fin_category_id && x.currency === form.currency);
    if (!b) return null;
    const mtd = rows
      .filter((r: any) => r.fin_category_id === form.fin_category_id && !r.voided_at && r.currency === form.currency)
      .reduce((s: number, r: any) => s + Number(r.amount || 0), 0);
    const limit = Number(b.planned_amount) * (Number(b.overrun_limit_pct || 110) / 100);
    const overshoot = mtd + Number(form.amount) > limit;
    return { overshoot, limit, mtd, planned: Number(b.planned_amount) };
  }, [form, budget, rows]);

  const Shell = embedded
    ? ({ children }: { children: any }) => <>{children}</>
    : ({ children }: { children: any }) => <PageShell>{children}</PageShell>;

  return (
    <Shell>
      {!embedded && (
        <PageHeader
          icon={Receipt}
          title="Monthly Expenses"
          subtitle={`Per-casino expense ledger · ${visible.length} of ${rows.length} records`}
          date
        >
          <FinanceCasinoSwitcher />
          <label className="text-xs flex items-center gap-1.5">
            <input type="checkbox" checked={showVoided} onChange={(e) => setShowVoided(e.target.checked)} /> Show voided
          </label>
          {canManage && <Button onClick={() => setOpen(true)}><Plus className="w-4 h-4" /> New Expense</Button>}
        </PageHeader>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div className="cms-panel p-3">
          <p className="text-[10px] uppercase text-muted-foreground tracking-wider">Total TZS</p>
          <p className="font-mono text-lg font-bold text-card-foreground">{formatNumberSpaces(totalTzs)}</p>
        </div>
        <div className="cms-panel p-3">
          <p className="text-[10px] uppercase text-muted-foreground tracking-wider">Records</p>
          <p className="font-mono text-lg font-bold text-card-foreground">{visible.length}</p>
        </div>
        <div className="cms-panel p-3">
          <p className="text-[10px] uppercase text-muted-foreground tracking-wider">Categories</p>
          <p className="font-mono text-lg font-bold text-card-foreground">
            {new Set(visible.map((r: any) => r.fin_category_id).filter(Boolean)).size}
          </p>
        </div>
        <div className="cms-panel p-3">
          <p className="text-[10px] uppercase text-muted-foreground tracking-wider">Wallets</p>
          <p className="font-mono text-lg font-bold text-card-foreground">
            {new Set(visible.map((r: any) => r.wallet_id).filter(Boolean)).size}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="cms-panel p-3 mb-4">
        <div className="flex items-center gap-2 mb-2">
          <Filter className="w-3.5 h-3.5 text-muted-foreground" />
          <h3 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Filters</h3>
          {!embedded && (
            <div className="ml-auto flex items-center gap-1 flex-wrap">
              {(["day", "week", "month", "year", "ytd", "all", "custom"] as Period[]).map((p) => (
                <Button
                  key={p}
                  size="sm"
                  variant={period === p ? "default" : "outline"}
                  className="h-7 px-2 text-xs capitalize"
                  onClick={() => setPeriod(p)}
                >
                  {p === "ytd" ? "YTD" : p}
                </Button>
              ))}
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={resetFilters}>
                Reset
              </Button>
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          {!embedded && period === "day" && (
            <div className="md:col-span-2 flex items-end gap-1">
              <div className="flex-1">
                <label className="text-[10px] uppercase text-muted-foreground">Date</label>
                <Input type="date" value={anchor} onChange={(e) => setAnchor(e.target.value)} className="h-8 text-xs" />
              </div>
            </div>
          )}
          {!embedded && period === "week" && (
            <div className="md:col-span-2 flex items-end gap-1">
              <Button size="sm" variant="outline" className="h-8 w-8 p-0" onClick={() => shiftWeek(-1)} title="Previous week">‹</Button>
              <div className="flex-1">
                <label className="text-[10px] uppercase text-muted-foreground">Week</label>
                <Input type="date" value={anchor} onChange={(e) => setAnchor(e.target.value)} className="h-8 text-xs" />
              </div>
              <Button size="sm" variant="outline" className="h-8 w-8 p-0" onClick={() => shiftWeek(1)} title="Next week">›</Button>
            </div>
          )}
          {!embedded && period === "month" && (
            <div className="md:col-span-2 flex items-end gap-1">
              <Button size="sm" variant="outline" className="h-8 w-8 p-0" onClick={() => shiftMonth(-1)} title="Previous month">‹</Button>
              <div className="flex-1">
                <label className="text-[10px] uppercase text-muted-foreground">Month</label>
                <Input
                  type="month"
                  value={anchor.slice(0, 7)}
                  onChange={(e) => setAnchor(e.target.value + "-01")}
                  className="h-8 text-xs"
                />
              </div>
              <Button size="sm" variant="outline" className="h-8 w-8 p-0" onClick={() => shiftMonth(1)} title="Next month">›</Button>
            </div>
          )}
          {!embedded && period === "year" && (
            <div className="md:col-span-2 flex items-end gap-1">
              <Button size="sm" variant="outline" className="h-8 w-8 p-0" onClick={() => shiftYear(-1)} title="Previous year">‹</Button>
              <div className="flex-1">
                <label className="text-[10px] uppercase text-muted-foreground">Year</label>
                <YearSelect
                  value={new Date(anchor + "T00:00:00").getFullYear()}
                  onChange={(y) => setAnchor(`${y}-01-01`)}
                  className="w-full"
                />
              </div>
              <Button size="sm" variant="outline" className="h-8 w-8 p-0" onClick={() => shiftYear(1)} title="Next year">›</Button>
            </div>
          )}
          {!embedded && period === "custom" && (
            <>
              <div>
                <label className="text-[10px] uppercase text-muted-foreground">From</label>
                <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="h-8 text-xs" />
              </div>
              <div>
                <label className="text-[10px] uppercase text-muted-foreground">To</label>
                <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="h-8 text-xs" />
              </div>
            </>
          )}
          {!embedded && (period === "ytd" || period === "all") && <div className="md:col-span-2" />}
          <div>
            <label className="text-[10px] uppercase text-muted-foreground">Category</label>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-80">
                <SelectItem value="all">All categories</SelectItem>
                {categories.filter((c: any) => !c.is_income).map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>{c.group_name} · {c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[10px] uppercase text-muted-foreground">Wallet</label>
            <Select value={walletFilter} onValueChange={setWalletFilter}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All wallets</SelectItem>
                {wallets.map((w: any) => <SelectItem key={w.id} value={w.id}>{w.name} ({w.currency})</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[10px] uppercase text-muted-foreground">Search</label>
            <Input
              placeholder="Description or category…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 text-xs"
            />
          </div>
        </div>
      </div>

      <PageSection card={false}>
        <FinTable>
          <FinTHead>
            <tr>
              <FinTH className={`${FW.date} cursor-pointer select-none`} onClick={() => toggleSort("date")}>
                Date <SortIcon k="date" />
              </FinTH>
              <FinTH className="cursor-pointer select-none" onClick={() => toggleSort("category")}>
                Category <SortIcon k="category" />
              </FinTH>
              <FinTH className={`${FW.wallet} cursor-pointer select-none`} onClick={() => toggleSort("wallet")}>
                Wallet <SortIcon k="wallet" />
              </FinTH>
              <FinTH>Description</FinTH>
              <FinTH align="right" className={`${FW.amount} cursor-pointer select-none`} onClick={() => toggleSort("amount")}>
                Amount <SortIcon k="amount" />
              </FinTH>
              <FinTH className={FW.actions} />
            </tr>
          </FinTHead>
          <FinTBody>
            {visible.map((r: any) => {
              const ccy = r.currency || "TZS";
              const tzs = Number(r.amount_tzs || r.amount || 0);
              const amt = Number(r.amount || 0);
              return (
                <FinTR key={r.id} className={r.voided_at ? "opacity-50 line-through" : ""}>
                  <FinTD className={FW.date}><FinDate value={r.business_date} /></FinTD>
                  <FinTD><FinTrunc max="max-w-[220px]">{r.fin_categories?.name || r.category || "—"}</FinTrunc></FinTD>
                  <FinTD className={FW.wallet}><FinTrunc max="max-w-[140px]" muted>{r.fin_wallets?.name || "—"}</FinTrunc></FinTD>
                  <FinTD><FinTrunc max="max-w-[380px]" muted>{r.description || ""}</FinTrunc></FinTD>
                  <FinTD align="right" className={FW.amount}>
                    <div className="flex flex-col items-end leading-tight">
                      <FinAmount value={tzs} signed={false} />
                      {ccy !== "TZS" && (
                        <span className="text-[10px] text-muted-foreground font-mono tabular-nums">
                          {formatNumberSpaces(amt)} {ccy}
                        </span>
                      )}
                    </div>
                  </FinTD>
                  <FinTD align="right" className={FW.actions}>
                    {canManage && !r.voided_at && (
                      <div className="flex items-center justify-end gap-0.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={() => setEditRow({
                            id: r.id,
                            fin_category_id: r.fin_category_id ?? null,
                            amount: Number(r.amount || 0),
                            currency: r.currency ?? "TZS",
                            description: r.description ?? "",
                            player_id: r.player_id ?? null,
                            player_name: r.player_name ?? "",
                            source: r.source ?? null,
                          })}
                          title="Edit"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => voidExp.mutate(r.id)} title="Void / reverse">
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    )}
                  </FinTD>
                </FinTR>
              );
            })}
            {!visible.length && <FinEmpty colSpan={6} msg="No expenses" />}
          </FinTBody>
        </FinTable>
      </PageSection>


      <ResponsiveDialog open={open} onOpenChange={setOpen} title="New expense">
        <FormGrid>
          <FormField span={4} label="Business Date">
            <Input type="date" value={form.business_date} onChange={(e) => setForm({ ...form, business_date: e.target.value })} />
          </FormField>
          <FormField span={8} label="Category">
            <Select value={form.fin_category_id} onValueChange={(v) => setForm({ ...form, fin_category_id: v })}>
              <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
              <SelectContent className="max-h-80">
                {categories.filter((c: any) => !c.is_income).map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>{c.group_name} · {c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField span={5} label="Wallet">
            <Select value={form.wallet_id} onValueChange={(v) => {
              const w = wallets.find((x: any) => x.id === v);
              setForm({ ...form, wallet_id: v, currency: w?.currency || form.currency });
            }}>
              <SelectTrigger><SelectValue placeholder="Select wallet" /></SelectTrigger>
              <SelectContent>{wallets.map((w: any) => <SelectItem key={w.id} value={w.id}>{w.name} ({w.currency})</SelectItem>)}</SelectContent>
            </Select>
          </FormField>
          <FormField span={4} label="Amount">
            <Input type="number" step="0.01" value={form.amount || ""} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} />
          </FormField>
          <FormField span={3} label="FX → TZS">
            <Input type="number" step="0.000001" value={form.exchange_rate || 1} onChange={(e) => setForm({ ...form, exchange_rate: Number(e.target.value) })} />
          </FormField>
          <FormField span={12} label="Description">
            <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
          </FormField>
          {overrunCheck?.overshoot && (
            <FormField span={12} label="Overrun reason (required, > limit)">
              <Textarea value={form.overrun_reason} onChange={(e) => setForm({ ...form, overrun_reason: e.target.value, is_overrun: true })} rows={2} />
              <div className="text-xs cms-amount-negative mt-1">
                Limit {formatNumberSpaces(overrunCheck.limit)} · MTD {formatNumberSpaces(overrunCheck.mtd)} · This {formatNumberSpaces(Number(form.amount))} → exceeds
              </div>
            </FormField>
          )}
        </FormGrid>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            disabled={!form.fin_category_id || !form.wallet_id || !form.amount || (overrunCheck?.overshoot && !form.overrun_reason)}
            onClick={async () => { await create.mutateAsync(form); setOpen(false); }}>
            Record
          </Button>
        </div>
      </ResponsiveDialog>

      <EditExpenseDialog
        open={!!editRow}
        onOpenChange={(o) => { if (!o) setEditRow(null); }}
        expense={editRow}
      />
    </Shell>
  );
}
