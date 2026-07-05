import { Fragment, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSessionState } from "@/hooks/use-session-state";
import { Wallet, Plus, Pencil, ArrowUpRight, ArrowDownLeft, ChevronRight, ChevronDown, Scale } from "lucide-react";
import { PageShell, PageSection } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import FinanceCasinoSwitcher from "@/components/finances/FinanceCasinoSwitcher";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { FormGrid, FormField } from "@/components/ui/form-grid";
import {
  DateRangePresets,
  type DatePreset,
  presetRange,
} from "@/components/ui/date-range-presets";
import { useFinWallets, useUpsertFinWallet, useFinWalletTx } from "@/hooks/use-fin";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCasino } from "@/lib/casino-context";
import { useAuth } from "@/lib/auth-context";
import { formatNumberSpaces, CASH_DENOMS } from "@/lib/currency";
import { fmtDateOnly } from "@/lib/format-date";
import CashDenomInput, { cashSum } from "@/components/cage/CashDenomInput";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const CURRENCIES = ["TZS", "USD", "EUR", "GBP", "KES"];
const KINDS = ["cash", "bank", "safe", "cage", "external"];
const CASH_LIKE_KINDS = new Set(["cash", "safe"]);

/* ============ Period dashboard data ============ */

/** Wallet balances as of `to` (inclusive): Σ amount_tzs where business_date <= to. */
const useWalletBalancesAsOf = (toDate: string) => {
  const { activeCasinoId, isSummaryMode } = useCasino();
  return useQuery({
    queryKey: ["fin-wallet-bal-asof", isSummaryMode ? "all" : activeCasinoId, toDate],
    enabled: !!toDate && (isSummaryMode || !!activeCasinoId),
    queryFn: async () => {
      let q = supabase
        .from("fin_wallet_tx")
        .select("wallet_id, amount_tzs, casino_id")
        .lte("business_date", toDate)
        .limit(50000);
      if (!isSummaryMode && activeCasinoId) q = q.eq("casino_id", activeCasinoId);
      const { data, error } = await q;
      if (error) throw error;
      const map = new Map<string, number>();
      let total = 0;
      (data || []).forEach((r: any) => {
        const v = Number(r.amount_tzs || 0);
        map.set(r.wallet_id, (map.get(r.wallet_id) || 0) + v);
        total += v;
      });
      return { perWallet: map, total };
    },
  });
};

/** Period income: shifts.tables_result + cage_slots_shifts.system_shift_result + fin_incomes (USD→TZS at 2500 fallback). */
const usePeriodIncome = (from: string, to: string) => {
  const { activeCasinoId } = useCasino();
  return useQuery({
    queryKey: ["fin-period-income", activeCasinoId, from, to],
    enabled: !!activeCasinoId && !!from && !!to,
    queryFn: async () => {
      if (!activeCasinoId) return { live: 0, slots: 0, other: 0, total: 0 };
      const startUtc = `${from}T04:00:00.000Z`;
      const d = new Date(to);
      d.setUTCDate(d.getUTCDate() + 1);
      const endUtc = `${d.toISOString().slice(0, 10)}T04:00:00.000Z`;

      const [shifts, slots, incomes, rates] = await Promise.all([
        supabase
          .from("shifts")
          .select("tables_result")
          .eq("casino_id", activeCasinoId)
          .gte("opened_at", startUtc)
          .lt("opened_at", endUtc),
        supabase
          .from("cage_slots_shifts")
          .select("system_shift_result")
          .eq("casino_id", activeCasinoId)
          .gte("opened_at", startUtc)
          .lt("opened_at", endUtc),
        (supabase as any)
          .from("fin_incomes")
          .select("amount, currency, year, month")
          .eq("casino_id", activeCasinoId),
        supabase
          .from("fin_daily_rates")
          .select("rate_to_tzs")
          .eq("casino_id", activeCasinoId)
          .eq("currency", "USD")
          .gte("business_date", from)
          .lte("business_date", to),
      ]);


      const live = (shifts.data || []).reduce(
        (s: number, r: any) => s + Number(r.tables_result || 0),
        0,
      );
      const slotsTotal = (slots.data || []).reduce(
        (s: number, r: any) => s + Number(r.system_shift_result || 0),
        0,
      );
      const rateList = (rates.data || [])
        .map((r: any) => Number(r.rate_to_tzs || 0))
        .filter((n: number) => n > 0);
      const avg = rateList.length
        ? rateList.reduce((a: number, b: number) => a + b, 0) / rateList.length
        : 2500;

      // fin_incomes is keyed by year/month — pick months overlapping [from..to].
      const fy = Number(from.slice(0, 4));
      const fm = Number(from.slice(5, 7));
      const ty = Number(to.slice(0, 4));
      const tm = Number(to.slice(5, 7));
      const inRange = (y: number, m: number) => {
        const k = y * 12 + m;
        return k >= fy * 12 + fm && k <= ty * 12 + tm;
      };
      const other = ((incomes as any)?.data || []).reduce((s: number, r: any) => {
        if (!inRange(Number(r.year), Number(r.month))) return s;
        const amt = Number(r.amount || 0);
        return s + (r.currency === "USD" ? amt * avg : amt);
      }, 0);

      const total = live + slotsTotal + other;
      return { live, slots: slotsTotal, other, total };
    },
  });
};

/** Period expenses Σ amount_tzs from expenses (voided excluded). */
const usePeriodExpenses = (from: string, to: string) => {
  const { activeCasinoId, isSummaryMode } = useCasino();
  return useQuery({
    queryKey: ["fin-period-expenses", isSummaryMode ? "all" : activeCasinoId, from, to],
    enabled: !!from && !!to && (isSummaryMode || !!activeCasinoId),
    queryFn: async () => {
      let q = supabase
        .from("expenses")
        .select("amount_tzs")
        .gte("business_date", from)
        .lte("business_date", to)
        .is("voided_at", null)
        .limit(20000);
      if (!isSummaryMode && activeCasinoId) q = q.eq("casino_id", activeCasinoId);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []).reduce((s: number, r: any) => s + Number(r.amount_tzs || 0), 0);
    },
  });
};

/* ============ Page ============ */

export default function FinancesWalletsPage() {
  const { activeCasinoId } = useCasino();
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: wallets = [] } = useFinWallets();
  const upsert = useUpsertFinWallet();

  const [preset, setPreset] = useSessionState<DatePreset>("preset", "month");
  const [range, setRange] = useSessionState<{from:string;to:string}>("range", presetRange("month"));
  const [walletFilter, setWalletFilter] = useSessionState<string>("wallet", "all");
  const [kindFilter, setKindFilter] = useSessionState<string>("kind", "all");
  const [sort, setSort] = useSessionState<"date_desc" | "date_asc" | "amount_desc" | "amount_asc">("sort", "date_desc");

  const { data: balAsOf } = useWalletBalancesAsOf(range.to);
  const { data: income } = usePeriodIncome(range.from, range.to);
  const { data: expenses = 0 } = usePeriodExpenses(range.from, range.to);
  const { data: tx = [] } = useFinWalletTx({ from: range.from, to: range.to });

  const txRows = useMemo(() => {
    let list = tx as any[];
    if (walletFilter !== "all") list = list.filter((r) => r.wallet_id === walletFilter);
    if (kindFilter !== "all") list = list.filter((r) => r.kind === kindFilter);
    const sorted = [...list];
    sorted.sort((a, b) => {
      if (sort === "amount_desc") return Number(b.amount_tzs) - Number(a.amount_tzs);
      if (sort === "amount_asc") return Number(a.amount_tzs) - Number(b.amount_tzs);
      const da = `${a.business_date}T${a.created_at}`;
      const db = `${b.business_date}T${b.created_at}`;
      return sort === "date_asc" ? da.localeCompare(db) : db.localeCompare(da);
    });
    return sorted;
  }, [tx, walletFilter, kindFilter, sort]);

  const distinctKinds = useMemo(
    () => Array.from(new Set((tx as any[]).map((r) => r.kind))).sort(),
    [tx],
  );

  const totalWallets = balAsOf?.total ?? 0;
  const incomeTotal = income?.total ?? 0;
  // Reconciliation: Total Income − Total Expenses − Total Wallets
  const reconciliation = incomeTotal - expenses - totalWallets;

  /* ===== wallet CRUD dialog ===== */
  const [walletOpen, setWalletOpen] = useState(false);
  const [walletForm, setWalletForm] = useState<any>({
    name: "",
    kind: "cash",
    currency: "TZS",
    sort_order: 0,
    is_active: true,
  });
  const openNewWallet = () => {
    setWalletForm({ name: "", kind: "cash", currency: "TZS", sort_order: 0, is_active: true });
    setWalletOpen(true);
  };

  /* ===== physical count (inline expandable) ===== */
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [denomCounts, setDenomCounts] = useState<Record<string, Record<number, number>>>({});
  const [amountInput, setAmountInput] = useState<Record<string, string>>({});
  const [countNote, setCountNote] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const toggleRow = (id: string) => setExpanded((s) => ({ ...s, [id]: !s[id] }));

  const saveCount = async (w: any) => {
    if (!user || !activeCasinoId) {
      toast.error("Not authorised");
      return;
    }
    const useDenoms = CASH_LIKE_KINDS.has(w.kind);
    const counted = useDenoms
      ? cashSum(denomCounts[w.id] || {})
      : Number(amountInput[w.id] || 0);
    if (!counted) {
      toast.error("Enter physical count");
      return;
    }
    setSavingId(w.id);
    try {
      const ledger = Number(balAsOf?.perWallet.get(w.id) || 0);
      const line = {
        wallet_id: w.id,
        wallet_name: w.name,
        currency: w.currency,
        ledger,
        counted,
        variance: counted - ledger,
        denominations: useDenoms ? (denomCounts[w.id] || {}) : null,
      };
      const { error } = await supabase.from("fin_audit_log").insert({
        casino_id: activeCasinoId,
        actor: user.id,
        action: "office_safe_reconciliation",
        entity_table: "fin_wallets",
        entity_id: w.id,
        meta: {
          lines: [line],
          note: countNote[w.id] || "",
          business_date: new Date().toISOString().slice(0, 10),
        },
      } as any);
      if (error) throw error;
      toast.success(`Physical count saved · ${w.name}`);
      setDenomCounts((s) => ({ ...s, [w.id]: {} }));
      setAmountInput((s) => ({ ...s, [w.id]: "" }));
      setCountNote((s) => ({ ...s, [w.id]: "" }));
      setExpanded((s) => ({ ...s, [w.id]: false }));
      qc.invalidateQueries({ queryKey: ["fin-wallet-bal-asof"] });
      qc.invalidateQueries({ queryKey: ["fin-balance-snapshot"] });
      qc.invalidateQueries({ queryKey: ["fin-audit-log"] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSavingId(null);
    }
  };



  return (
    <PageShell>
      <PageHeader icon={Wallet} title="Wallets" subtitle="Cash, bank, safe & cage ledger">
        <FinanceCasinoSwitcher allowNetwork={false} />
        <DateRangePresets
          preset={preset}
          from={range.from}
          to={range.to}
          onChange={({ preset, from, to }) => {
            setPreset(preset);
            setRange({ from, to });
          }}
        />
        <Button variant="outline" onClick={() => navigate("/office?tab=balance")}>
          <Scale className="w-4 h-4" /> Reconciliation
        </Button>
        <Button onClick={openNewWallet}>
          <Plus className="w-4 h-4" /> Add Wallet
        </Button>
      </PageHeader>

      {/* DASHBOARD KPIs */}
      <PageSection card={false}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Kpi label="Total Wallets" tone="neutral" v={totalWallets} sub="balance as of period end" />
          <Kpi
            label="Total Income"
            tone="positive"
            v={incomeTotal}
            sub={`Live ${formatNumberSpaces(income?.live ?? 0)} · Slots ${formatNumberSpaces(income?.slots ?? 0)} · Other ${formatNumberSpaces(income?.other ?? 0)}`}
          />
          <Kpi label="Total Expenses" tone="negative" v={expenses} sub="period · voided excluded" />
          <Kpi
            label="Reconciliation"
            tone={Math.abs(reconciliation) < 1 ? "neutral" : "warning"}
            v={reconciliation}
            sub="Income − Expenses − Wallets"
            signed
          />
        </div>
      </PageSection>

      {/* WALLETS TABLE */}
      <PageSection title="Wallets" card={false}>
        <div className="rounded-md border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted text-xs uppercase">
              <tr>
                <th className="w-6"></th>
                <th className="px-3 py-2 text-left">Name</th>
                <th className="px-3 py-2 text-left">Kind</th>
                <th className="px-3 py-2 text-left">Currency</th>
                <th className="px-3 py-2 text-right">Starting Float</th>
                <th className="px-3 py-2 text-right">Balance (TZS)</th>
                <th className="w-12"></th>
              </tr>
            </thead>
            <tbody>
              {(wallets as any[]).map((w) => {
                const isOpen = !!expanded[w.id];
                const useDenoms = CASH_LIKE_KINDS.has(w.kind);
                const denoms = CASH_DENOMS[w.currency] || CASH_DENOMS.TZS;
                const denomVals = denomCounts[w.id] || {};
                const counted = useDenoms
                  ? cashSum(denomVals)
                  : Number(amountInput[w.id] || 0);
                const ledger = Number(balAsOf?.perWallet.get(w.id) || 0);
                const variance = counted - ledger;
                return (
                  <Fragment key={w.id}>
                    <tr
                      key={w.id}
                      className="border-t border-border hover:bg-muted/40 cursor-pointer"
                      onClick={() => toggleRow(w.id)}
                    >
                      <td className="pl-2">
                        {isOpen ? (
                          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                        )}
                      </td>
                      <td className="px-3 py-1.5">{w.name}</td>
                      <td className="capitalize">{w.kind}</td>
                      <td className="font-mono">{w.currency}</td>
                      <td className="text-right font-mono tabular-nums text-xs">
                        {w.starting_float_amount
                          ? `${formatNumberSpaces(Number(w.starting_float_amount))} ${w.currency}`
                          : "·"}
                        {w.starting_float_date && (
                          <div className="text-[10px] text-muted-foreground">
                            from {fmtDateOnly(w.starting_float_date)}
                          </div>
                        )}
                      </td>
                      <td className="text-right font-mono tabular-nums">
                        {formatNumberSpaces(ledger)}
                      </td>
                      <td className="text-right pr-3">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={(e) => {
                            e.stopPropagation();
                            setWalletForm(w);
                            setWalletOpen(true);
                          }}
                          aria-label="Edit wallet"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="bg-muted/30 border-t border-border">
                        <td colSpan={7} className="p-4">
                          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                            <div>
                              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                                Physical count · {w.currency}
                              </div>
                              {useDenoms ? (
                                <CashDenomInput
                                  values={denomVals}
                                  onChange={(v) =>
                                    setDenomCounts((s) => ({ ...s, [w.id]: v }))
                                  }
                                  denoms={denoms}
                                  currency={w.currency}
                                  size="sm"
                                />
                              ) : (
                                <Input
                                  type="number"
                                  step="0.01"
                                  placeholder={`Amount (${w.currency})`}
                                  value={amountInput[w.id] || ""}
                                  onChange={(e) =>
                                    setAmountInput((s) => ({
                                      ...s,
                                      [w.id]: e.target.value,
                                    }))
                                  }
                                  className="font-mono"
                                />
                              )}
                            </div>
                            <div className="space-y-3">
                              <div className="rounded-md border border-border bg-card p-3 space-y-1">
                                <div className="flex items-center justify-between text-xs">
                                  <span className="text-muted-foreground">Ledger (TZS)</span>
                                  <span className="font-mono tabular-nums">
                                    {formatNumberSpaces(ledger)}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between text-xs">
                                  <span className="text-muted-foreground">Counted</span>
                                  <span className="font-mono tabular-nums">
                                    {formatNumberSpaces(counted)} {w.currency}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between text-sm font-semibold pt-1 border-t border-border">
                                  <span>Variance</span>
                                  <span
                                    className={cn(
                                      "font-mono tabular-nums",
                                      variance === 0
                                        ? "text-muted-foreground"
                                        : variance < 0
                                          ? "cms-amount-negative"
                                          : "cms-amount-positive",
                                    )}
                                  >
                                    {variance > 0 ? "+" : ""}
                                    {formatNumberSpaces(variance)}
                                  </span>
                                </div>
                              </div>
                              <Textarea
                                placeholder="Note (optional)"
                                value={countNote[w.id] || ""}
                                onChange={(e) =>
                                  setCountNote((s) => ({ ...s, [w.id]: e.target.value }))
                                }
                                rows={2}
                                className="text-xs"
                              />
                              <div className="flex justify-end gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => toggleRow(w.id)}
                                >
                                  Cancel
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={() => saveCount(w)}
                                  disabled={savingId === w.id}
                                >
                                  {savingId === w.id ? "Saving…" : "Save Physical Count"}
                                </Button>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
              {!wallets.length && (
                <tr>
                  <td colSpan={7} className="text-center text-muted-foreground py-6">
                    No wallets yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </PageSection>


      {/* TRANSACTIONS */}
      <PageSection title={`Transactions · ${txRows.length}`} card={false}>
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <Select value={walletFilter} onValueChange={setWalletFilter}>
            <SelectTrigger className="h-9 w-[180px]">
              <SelectValue placeholder="All wallets" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All wallets</SelectItem>
              {(wallets as any[]).map((w) => (
                <SelectItem key={w.id} value={w.id}>
                  {w.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={kindFilter} onValueChange={setKindFilter}>
            <SelectTrigger className="h-9 w-[160px]">
              <SelectValue placeholder="All kinds" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All kinds</SelectItem>
              {distinctKinds.map((k) => (
                <SelectItem key={k} value={k}>
                  {k}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={(v) => setSort(v as any)}>
            <SelectTrigger className="h-9 w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="date_desc">Newest first</SelectItem>
              <SelectItem value="date_asc">Oldest first</SelectItem>
              <SelectItem value="amount_desc">Amount ↓</SelectItem>
              <SelectItem value="amount_asc">Amount ↑</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="rounded-md border border-border overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted text-xs uppercase">
              <tr>
                <th className="px-3 py-2 text-left w-[110px]">Date</th>
                <th className="px-3 py-2 text-left">Wallet</th>
                <th className="px-3 py-2 text-left w-[120px]">Kind</th>
                <th className="px-3 py-2 text-center w-[60px]">Dir</th>
                <th className="px-3 py-2 text-right w-[130px]">Amount</th>
                <th className="px-3 py-2 text-right w-[130px]">TZS</th>
                <th className="px-3 py-2 text-left">Note</th>
              </tr>
            </thead>
            <tbody>
              {txRows.map((r: any) => {
                const isIn = Number(r.amount_tzs) >= 0;
                return (
                  <tr key={r.id} className="border-t border-border hover:bg-muted/40">
                    <td className="px-3 py-1.5 font-mono text-xs">
                      {fmtDateOnly(r.business_date)}
                    </td>
                    <td className="px-3 py-1.5">{r.fin_wallets?.name || "—"}</td>
                    <td className="px-3 py-1.5 text-xs uppercase text-muted-foreground">
                      {r.kind}
                    </td>
                    <td className="px-3 py-1.5 text-center">
                      {isIn ? (
                        <ArrowDownLeft className="w-3.5 h-3.5 inline cms-amount-positive" />
                      ) : (
                        <ArrowUpRight className="w-3.5 h-3.5 inline cms-amount-negative" />
                      )}
                    </td>
                    <td
                      className={cn(
                        "px-3 py-1.5 text-right font-mono tabular-nums",
                        isIn ? "cms-amount-positive" : "cms-amount-negative",
                      )}
                    >
                      {formatNumberSpaces(Math.abs(Number(r.amount)))}{" "}
                      <span className="text-[10px] text-muted-foreground">{r.currency}</span>
                    </td>
                    <td
                      className={cn(
                        "px-3 py-1.5 text-right font-mono tabular-nums",
                        isIn ? "cms-amount-positive" : "cms-amount-negative",
                      )}
                    >
                      {formatNumberSpaces(Math.abs(Number(r.amount_tzs)))}
                    </td>
                    <td className="px-3 py-1.5 text-xs text-muted-foreground truncate max-w-[420px]">
                      {r.note}
                    </td>
                  </tr>
                );
              })}
              {!txRows.length && (
                <tr>
                  <td colSpan={7} className="text-center text-muted-foreground py-6">
                    No transactions in this period
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </PageSection>

      {/* WALLET CRUD DIALOG */}
      <ResponsiveDialog
        open={walletOpen}
        onOpenChange={setWalletOpen}
        title={walletForm.id ? "Edit wallet" : "New wallet"}
      >
        <FormGrid>
          <FormField span={6} label="Name">
            <Input
              value={walletForm.name || ""}
              onChange={(e) => setWalletForm({ ...walletForm, name: e.target.value })}
            />
          </FormField>
          <FormField span={3} label="Kind">
            <Select
              value={walletForm.kind}
              onValueChange={(v) => setWalletForm({ ...walletForm, kind: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {KINDS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {k}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField span={3} label="Currency">
            <Select
              value={walletForm.currency}
              onValueChange={(v) => setWalletForm({ ...walletForm, currency: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField span={6} label="Sort order">
            <Input
              type="number"
              value={walletForm.sort_order || 0}
              onChange={(e) =>
                setWalletForm({ ...walletForm, sort_order: Number(e.target.value) })
              }
            />
          </FormField>

          <FormField span={12}>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1 mb-1 border-t border-border pt-2">
              Starting Float (edited by manager / finance / super-admin · logged)
            </div>
          </FormField>
          <FormField span={5} label={`Amount (${walletForm.currency || "TZS"})`}>
            <Input
              type="number"
              step="0.01"
              value={walletForm.starting_float_amount ?? 0}
              onChange={(e) =>
                setWalletForm({ ...walletForm, starting_float_amount: e.target.value })
              }
            />
          </FormField>
          <FormField span={4} label="From date">
            <Input
              type="date"
              value={walletForm.starting_float_date || ""}
              onChange={(e) =>
                setWalletForm({ ...walletForm, starting_float_date: e.target.value })
              }
            />
          </FormField>
          <FormField span={3} label="Note">
            <Input
              value={walletForm.starting_float_note || ""}
              onChange={(e) =>
                setWalletForm({ ...walletForm, starting_float_note: e.target.value })
              }
              placeholder="Optional"
            />
          </FormField>
        </FormGrid>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setWalletOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={async () => {
              await upsert.mutateAsync({ ...walletForm, casino_id: activeCasinoId });
              setWalletOpen(false);
            }}
          >
            Save
          </Button>
        </div>
      </ResponsiveDialog>
    </PageShell>
  );
}

/* ============ KPI ============ */

const TONE: Record<string, string> = {
  positive: "border-l-4 border-l-cms-amount-positive",
  negative: "border-l-4 border-l-cms-amount-negative",
  warning: "border-l-4 border-l-amber-500",
  neutral: "border-l-4 border-l-muted-foreground/40",
};

const Kpi = ({
  label,
  v,
  sub,
  tone = "neutral",
  signed,
}: {
  label: string;
  v: number;
  sub?: string;
  tone?: keyof typeof TONE;
  signed?: boolean;
}) => {
  const color = signed
    ? v > 0
      ? "cms-amount-positive"
      : v < 0
        ? "cms-amount-negative"
        : ""
    : "";
  return (
    <div className={cn("rounded-md border border-border bg-card p-3", TONE[tone])}>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("font-mono tabular-nums text-lg font-semibold mt-1", color)}>
        {formatNumberSpaces(v)}
      </div>
      {sub && (
        <div className="text-[10px] text-muted-foreground mt-0.5 truncate" title={sub}>
          {sub}
        </div>
      )}
    </div>
  );
};
