/**
 * Office → Wallets (merged with former Balance tab, 2026-07-20).
 * Single source of truth for cash-desk reconciliation:
 *  - Wallet balances per currency (native) + TZS-equivalent
 *  - Grand Total in TZS and USD (Budget-style)
 *  - Breakdown (Expected): Live/Slots/Other ± Miss − Expenses − Collections
 *  - Physical count inline, transactions log, wallet CRUD
 */
import { Fragment, useMemo, useState } from "react";
import { useSessionState } from "@/hooks/use-session-state";
import {
  Wallet,
  Plus,
  Pencil,
  ArrowUpRight,
  ArrowDownLeft,
  ArrowUp,
  ArrowDown,
  ChevronRight,
  ChevronDown,
  RotateCw,
} from "lucide-react";
import { PageShell, PageSection } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import FinanceCasinoSwitcher from "@/components/finances/FinanceCasinoSwitcher";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { FormGrid, FormField } from "@/components/ui/form-grid";
import { MonthCarousel, MONTHS } from "@/components/payroll/MonthCarousel";
import { useFinWallets, useUpsertFinWallet, useFinWalletTx } from "@/hooks/use-fin";
import { useFinBalanceSnapshot, computeBalanceTotals } from "@/hooks/use-fin-balance";
import { CloseMonthWizard } from "@/pages/office/CloseMonthWizard";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useCasino } from "@/lib/casino-context";
import { useAuth } from "@/lib/auth-context";
import { formatNumberSpaces, CASH_DENOMS } from "@/lib/currency";
import { fmtDateOnly } from "@/lib/format-date";
import CashDenomInput, { cashSum } from "@/components/cage/CashDenomInput";
import WalletMovementDialog, { type MovementMode } from "@/components/finances/WalletMovementDialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const CURRENCIES = ["TZS", "USD", "EUR", "GBP", "KES"];
const KINDS = ["cash", "bank", "mobile_money", "safe", "cage", "external"];
const CASH_LIKE_KINDS = new Set(["cash", "safe"]);
const CURRENCY_ORDER = ["TZS", "USD", "EUR", "GBP", "KES"];

type WalletSortKey = "name" | "kind" | "currency" | "starting_float" | "balance_native" | "balance_tzs";

const WALLET_SORT_DEFAULT: { key: WalletSortKey; dir: "asc" | "desc" } = { key: "name", dir: "asc" };

/* ============ Page ============ */

export default function FinancesWalletsPage() {
  const { activeCasinoId } = useCasino();
  const { user, roles } = useAuth();
  const qc = useQueryClient();
  const isSuperAdmin = roles.includes("super_admin");
  const { data: wallets = [] } = useFinWallets();
  const upsert = useUpsertFinWallet();

  const now = new Date();
  const [ym, setYm] = useSessionState<{ year: number; month: number }>("ym", {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
  });
  const [walletFilter, setWalletFilter] = useSessionState<string>("wallet", "all");
  const [kindFilter, setKindFilter] = useSessionState<string>("kind", "all");
  const [sort, setSort] = useSessionState<"date_desc" | "date_asc" | "amount_desc" | "amount_asc">(
    "sort",
    "date_desc",
  );
  const [walletSort, setWalletSort] = useSessionState<{ key: WalletSortKey; dir: "asc" | "desc" }>(
    "walletSort",
    WALLET_SORT_DEFAULT,
  );
  const [closeOpen, setCloseOpen] = useState(false);

  // Whole page is scoped to a single calendar month.
  const range = useMemo(() => {
    const pad = (n: number) => String(n).padStart(2, "0");
    const last = new Date(ym.year, ym.month, 0).getDate();
    return {
      from: `${ym.year}-${pad(ym.month)}-01`,
      to: `${ym.year}-${pad(ym.month)}-${pad(last)}`,
    };
  }, [ym]);
  const monthRange = range;
  const monthLabel = `${MONTHS[ym.month - 1]} ${ym.year}`;

  // Unified snapshot — same source of truth as former Balance tab.
  const { data: snap, isFetching } = useFinBalanceSnapshot(range.from, range.to);
  const totals = useMemo(() => computeBalanceTotals(snap), [snap]);
  const usdRate = snap?.rates?.usd_tzs || 2600;

  const { data: tx = [] } = useFinWalletTx({ from: monthRange.from, to: monthRange.to });

  // per-wallet map for physical-count inline UI
  const ledgerByWallet = useMemo(() => {
    const m = new Map<string, { native: number; tzs: number }>();
    (snap?.wallets || []).forEach((w) =>
      m.set(w.wallet_id, {
        native: Number(w.ledger_native ?? w.ledger ?? 0),
        tzs: Number(w.ledger_tzs ?? w.ledger ?? 0),
      }),
    );
    return m;
  }, [snap]);

  // Grand totals in TZS and USD (Budget-style)
  const grandTotals = useMemo(() => {
    const tzs = (snap?.wallets || []).reduce((s, w) => s + Number(w.ledger_tzs ?? w.ledger ?? 0), 0);
    const usd = usdRate > 0 ? tzs / usdRate : 0;
    // per-currency native totals
    const perCcy: Record<string, number> = {};
    (snap?.wallets || []).forEach((w) => {
      perCcy[w.currency] = (perCcy[w.currency] || 0) + Number(w.ledger_native ?? w.ledger ?? 0);
    });
    return { tzs, usd, perCcy };
  }, [snap, usdRate]);

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

  const incomeTotal =
    (snap?.incomes?.live_game || 0) + (snap?.incomes?.slots || 0) + (snap?.incomes?.other || 0);
  const expensesTotal = snap?.expenses_total || 0;
  const varianceTone =
    Math.abs(totals.variance) < 1 ? "neutral" : totals.variance > 0 ? "positive" : "negative";

  const reconcileNow = () => {
    qc.invalidateQueries({ queryKey: ["fin-balance-snapshot"] });
    qc.invalidateQueries({ queryKey: ["fin-wallet-tx"] });
    qc.invalidateQueries({ queryKey: ["fin-wallets"] });
  };

  /* ===== wallet movement (transactional cash in/out/transfer) ===== */
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveMode, setMoveMode] = useState<MovementMode>("in");
  const [moveWalletId, setMoveWalletId] = useState<string | undefined>(undefined);

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
  const [centsInput, setCentsInput] = useState<Record<string, number>>({});
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
    const cents = w.currency === "TZS" && useDenoms ? centsInput[w.id] || 0 : 0;
    const counted = useDenoms
      ? cashSum(denomCounts[w.id] || {}) + cents / 100
      : Number(amountInput[w.id] || 0);
    // Guard against an untouched panel — never write a zeroing adjustment
    // just because someone clicked Save without entering anything.
    const denomEntered = useDenoms
      && (Object.values(denomCounts[w.id] || {}).some((v) => Number(v) > 0) || cents > 0);
    const amountEntered = !useDenoms
      && amountInput[w.id] !== undefined
      && String(amountInput[w.id]).trim() !== "";
    if (!denomEntered && !amountEntered) {
      toast.error("Enter physical count");
      return;
    }
    if (Number.isNaN(counted) || counted < 0) {
      toast.error("Enter physical count");
      return;
    }
    // Physical counts must land on the day they are entered — not on the
    // last day of the selected month. Clamp today into the selected period.
    const todayEat = new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);
    const countDate = todayEat < range.from ? range.from : todayEat > range.to ? range.to : todayEat;
    setSavingId(w.id);
    try {
      const led = ledgerByWallet.get(w.id) || { native: 0, tzs: 0 };
      const variance = counted - led.native;
      let fxRate = 1;
      if (w.currency === "USD") {
        fxRate = usdRate;
      } else if (w.currency !== "TZS") {
        if (led.native) {
          fxRate = led.tzs / led.native;
        } else {
          const { data: rateRow, error: rateError } = await supabase
            .from("fin_daily_rates")
            .select("rate_to_tzs")
            .eq("casino_id", activeCasinoId)
            .eq("currency", w.currency)
            .lte("business_date", range.to)
            .order("business_date", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (rateError) throw rateError;
          fxRate = Number(rateRow?.rate_to_tzs || 1);
        }
      }
      const varianceTzs = variance * fxRate;
      const line = {
        wallet_id: w.id,
        wallet_name: w.name,
        currency: w.currency,
        ledger: led.native, // ledger in wallet's native currency
        ledger_tzs: led.tzs,
        counted,
        variance,
        variance_tzs: varianceTzs,
        fx_rate: fxRate,
        denominations: useDenoms ? denomCounts[w.id] || {} : null,
        cents: useDenoms ? cents : null,
      };
      let adjustmentId: string | null = null;
      if (Math.abs(variance) >= 0.01) {
        const { data: adjustment, error: txError } = await supabase
          .from("fin_wallet_tx")
          .insert({
            casino_id: activeCasinoId,
            wallet_id: w.id,
            kind: "adjustment",
            amount: variance,
            currency: w.currency,
            fx_rate: fxRate,
            amount_tzs: varianceTzs,
            business_date: countDate,
            note: `Physical count · ${w.name} = ${formatNumberSpaces(counted)} ${w.currency}${countNote[w.id] ? ` · ${countNote[w.id]}` : ""}`,
            created_by: user.id,
          } as any)
          .select("id")
          .single();
        if (txError) throw txError;
        adjustmentId = adjustment?.id ?? null;
      }
      const { error } = await supabase.from("fin_audit_log").insert({
        casino_id: activeCasinoId,
        actor: user.id,
        action: "office_safe_reconciliation",
        entity_table: "fin_wallets",
        entity_id: w.id,
        before: {
          ledger: led.native,
          ledger_tzs: led.tzs,
        },
        after: {
          lines: [line],
          note: countNote[w.id] || "",
          business_date: countDate,
          adjustment_id: adjustmentId,
        },
      } as any);
      if (error) throw error;
      toast.success(
        Math.abs(variance) >= 0.01
          ? `Physical count saved · ${w.name}`
          : `Physical count checked · ${w.name}`,
      );
      setDenomCounts((s) => ({ ...s, [w.id]: {} }));
      setCentsInput((s) => ({ ...s, [w.id]: 0 }));
      setAmountInput((s) => ({ ...s, [w.id]: "" }));
      setCountNote((s) => ({ ...s, [w.id]: "" }));
      setExpanded((s) => ({ ...s, [w.id]: false }));
      qc.invalidateQueries({ queryKey: ["fin-balance-snapshot"] });
      qc.invalidateQueries({ queryKey: ["fin-wallet-tx"] });
      qc.invalidateQueries({ queryKey: ["fin-wallet-balances"] });
      qc.invalidateQueries({ queryKey: ["fin-audit-log"] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSavingId(null);
    }
  };

  return (
    <PageShell>
      <PageHeader icon={Wallet} title="Wallets" subtitle="Cash, bank, safe & cage ledger · reconciliation">
        <FinanceCasinoSwitcher allowNetwork={false} />
        <MonthCarousel
          year={ym.year}
          month={ym.month}
          onChange={(year, month) => setYm({ year, month })}
        />
        <Button variant="outline" size="sm" onClick={reconcileNow}>
          <RotateCw className={cn("w-4 h-4", isFetching && "animate-spin")} /> Reconcile Now
        </Button>
        {isSuperAdmin && (
          <Button variant="secondary" size="sm" onClick={() => setCloseOpen(true)}>
            Close Month
          </Button>
        )}
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            setMoveWalletId(undefined);
            setMoveMode("in");
            setMoveOpen(true);
          }}
        >
          <ArrowDownLeft className="w-4 h-4" /> Money In
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            setMoveWalletId(undefined);
            setMoveMode("out");
            setMoveOpen(true);
          }}
        >
          <ArrowUpRight className="w-4 h-4" /> Money Out
        </Button>
        <Button onClick={openNewWallet}>
          <Plus className="w-4 h-4" /> Add Wallet
        </Button>
      </PageHeader>

      {/* KPI STRIP */}
      <PageSection card={false}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Kpi label="Total Wallets" tone="neutral" v={grandTotals.tzs} sub="grand TZS · period end" />
          <Kpi
            label="Total Income"
            tone="positive"
            v={incomeTotal}
            sub={`Live ${formatNumberSpaces(snap?.incomes?.live_game || 0)} · Slots ${formatNumberSpaces(snap?.incomes?.slots || 0)} · Other ${formatNumberSpaces(snap?.incomes?.other || 0)}`}
          />
          <Kpi label="Total Expenses" tone="negative" v={expensesTotal} sub="period · voided excluded" />
          <Kpi
            label="Variance"
            tone={varianceTone as any}
            v={totals.variance}
            sub="Actual − Expected"
            signed
          />
        </div>
      </PageSection>

      {/* BREAKDOWN + GRAND TOTAL */}
      <div id="wallets-breakdown" className="grid grid-cols-1 lg:grid-cols-2 gap-4 scroll-mt-20">
        <PageSection title="Breakdown (Expected)" card={false}>
          <div className="rounded-md border border-border bg-card">
            <BreakdownRow
              label="Starting Float (baseline, not in sum)"
              v={snap?.starting_float?.grand_tzs || 0}
              muted
            />
            <BreakdownRow label="Live Game" v={snap?.incomes?.live_game || 0} positive />
            <BreakdownRow label="Slots" v={snap?.incomes?.slots || 0} positive />
            <BreakdownRow label="Other Income" v={snap?.incomes?.other || 0} positive />
            <BreakdownRow label="Card Balance" v={snap?.incomes?.card_balance || 0} positive />

            <BreakdownRow label="Missed Chips (±)" v={snap?.incomes?.missed_chips || 0} signed />
            <BreakdownRow label="Missed Cards (±)" v={snap?.incomes?.missed_cards || 0} signed />
            <BreakdownRow label="− Expenses" v={snap?.expenses_total || 0} negative />
            <BreakdownRow label="− Collections" v={snap?.collections_total || 0} negative />
            <div className="border-t-2 border-border">
              <BreakdownRow label="= Expected (net of float)" v={totals.expected} bold signed />
            </div>
          </div>
          <div className="text-[10px] text-muted-foreground mt-1">
            USD→TZS rate {formatNumberSpaces(usdRate)} · Period {range.from} → {range.to}
          </div>
        </PageSection>

        <PageSection title="Grand Total (Wallets)" card={false}>
          <div className="rounded-md border border-border bg-card p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-md border border-border bg-background p-3">
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Grand TZS</div>
                <div className="font-mono tabular-nums text-2xl font-semibold mt-1">
                  {formatNumberSpaces(grandTotals.tzs)}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  Σ balance × FX (period end)
                </div>
              </div>
              <div className="rounded-md border border-border bg-background p-3">
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Grand USD</div>
                <div className="font-mono tabular-nums text-2xl font-semibold mt-1">
                  {formatNumberSpaces(Math.round(grandTotals.usd))}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  Grand TZS ÷ {formatNumberSpaces(usdRate)} (Office Rates)
                </div>
              </div>
            </div>
            <div className="border-t border-border pt-2">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
                Per currency (native units)
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5">
                {CURRENCY_ORDER.filter((c) => grandTotals.perCcy[c]).map((c) => (
                  <div
                    key={c}
                    className="flex items-baseline justify-between rounded border border-border/50 bg-background/50 px-2 py-1"
                  >
                    <span className="text-[11px] font-mono text-muted-foreground">{c}</span>
                    <span className="font-mono tabular-nums text-sm">
                      {formatNumberSpaces(grandTotals.perCcy[c])}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </PageSection>
      </div>

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
                <th className="px-3 py-2 text-right">Balance (native)</th>
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
                const centsVal = w.currency === "TZS" && useDenoms ? centsInput[w.id] || 0 : 0;
                const counted = useDenoms
                  ? cashSum(denomVals) + centsVal / 100
                  : Number(amountInput[w.id] || 0);
                const led = ledgerByWallet.get(w.id) || { native: 0, tzs: 0 };
                const variance = counted - led.native;
                return (
                  <Fragment key={w.id}>
                    <tr
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
                      <td className="capitalize">{String(w.kind).replace(/_/g, " ")}</td>
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
                        {formatNumberSpaces(led.native)}{" "}
                        <span className="text-[10px] text-muted-foreground">{w.currency}</span>
                      </td>
                      <td className="text-right font-mono tabular-nums">
                        {formatNumberSpaces(led.tzs)}
                      </td>
                      <td className="text-right pr-3 whitespace-nowrap">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={(e) => {
                            e.stopPropagation();
                            setMoveWalletId(w.id);
                            setMoveMode("in");
                            setMoveOpen(true);
                          }}
                          aria-label="Money in"
                        >
                          <ArrowDownLeft className="w-3.5 h-3.5 cms-amount-positive" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={(e) => {
                            e.stopPropagation();
                            setMoveWalletId(w.id);
                            setMoveMode("out");
                            setMoveOpen(true);
                          }}
                          aria-label="Money out"
                        >
                          <ArrowUpRight className="w-3.5 h-3.5 cms-amount-negative" />
                        </Button>
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
                        <td colSpan={8} className="p-4">
                          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                            <div>
                              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                                Physical count · {w.currency}
                              </div>
                              {useDenoms ? (
                                <CashDenomInput
                                  values={denomVals}
                                  onChange={(v) => setDenomCounts((s) => ({ ...s, [w.id]: v }))}
                                  denoms={denoms}
                                  currency={w.currency}
                                  size="sm"
                                  {...(w.currency === "TZS"
                                    ? {
                                        cents: centsVal,
                                        onCentsChange: (c: number) =>
                                          setCentsInput((s) => ({ ...s, [w.id]: c })),
                                      }
                                    : {})}
                                />
                              ) : (
                                <Input
                                  type="number"
                                  step="0.01"
                                  placeholder={`Amount (${w.currency})`}
                                  value={amountInput[w.id] || ""}
                                  onChange={(e) =>
                                    setAmountInput((s) => ({ ...s, [w.id]: e.target.value }))
                                  }
                                  className="font-mono"
                                />
                              )}
                            </div>
                            <div className="space-y-3">
                              <div className="rounded-md border border-border bg-card p-3 space-y-1">
                                <div className="flex items-center justify-between text-xs">
                                  <span className="text-muted-foreground">
                                    Ledger ({w.currency})
                                  </span>
                                  <span className="font-mono tabular-nums">
                                    {formatNumberSpaces(led.native)}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between text-xs text-muted-foreground">
                                  <span>Ledger (TZS)</span>
                                  <span className="font-mono tabular-nums">
                                    {formatNumberSpaces(led.tzs)}
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
                  </Fragment>
                );
              })}
              {!wallets.length && (
                <tr>
                  <td colSpan={8} className="text-center text-muted-foreground py-6">
                    No wallets yet
                  </td>
                </tr>
              )}
            </tbody>
            {(wallets as any[]).length > 0 && (
              <tfoot className="bg-muted/50 border-t-2 border-border">
                <tr>
                  <td colSpan={5} className="px-3 py-2 text-right text-[11px] uppercase tracking-wider font-semibold">
                    Grand Total
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-xs text-muted-foreground">
                    {CURRENCY_ORDER.filter((c) => grandTotals.perCcy[c])
                      .map((c) => `${formatNumberSpaces(grandTotals.perCcy[c])} ${c}`)
                      .join(" · ")}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums font-semibold">
                    {formatNumberSpaces(grandTotals.tzs)}
                  </td>
                  <td />
                </tr>
                <tr className="border-t border-border/50">
                  <td colSpan={5} className="px-3 py-1.5 text-right text-[10px] uppercase tracking-wider text-muted-foreground">
                    Grand Total USD
                  </td>
                  <td colSpan={2} className="px-3 py-1.5 text-right font-mono tabular-nums text-sm">
                    {formatNumberSpaces(Math.round(grandTotals.usd))} USD
                    <span className="text-[10px] text-muted-foreground ml-2">
                      @ {formatNumberSpaces(usdRate)}
                    </span>
                  </td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </PageSection>

      {/* TRANSACTIONS */}
      <PageSection title={`Transactions · ${monthLabel} · ${txRows.length}`} card={false}>
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
            <SelectTrigger className="h-9 w-[140px]">
              <SelectValue placeholder="All kinds" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All kinds</SelectItem>
              {Array.from(new Set((tx as any[]).map((r) => r.kind)))
                .sort()
                .map((k) => (
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
                    <td className="px-3 py-1.5 font-mono text-xs">{fmtDateOnly(r.business_date)}</td>
                    <td className="px-3 py-1.5">{r.fin_wallets?.name || "—"}</td>
                    <td className="px-3 py-1.5 text-xs uppercase text-muted-foreground">{r.kind}</td>
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

      <WalletMovementDialog
        open={moveOpen}
        onOpenChange={setMoveOpen}
        wallets={wallets as any[]}
        defaultWalletId={moveWalletId}
        defaultMode={moveMode}
        usdRate={usdRate}
        minDate={range.from}
        maxDate={range.to}
      />

      {isSuperAdmin && (
        <CloseMonthWizard
          open={closeOpen}
          onOpenChange={setCloseOpen}
          wallets={(snap?.wallets || []) as any}
          usdTzs={usdRate}
        />
      )}
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
  const sign = signed && v > 0 ? "+" : signed && v < 0 ? "−" : "";
  return (
    <div className={cn("rounded-md border border-border bg-card p-3", TONE[tone])}>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("font-mono tabular-nums text-lg font-semibold mt-1", color)}>
        {sign}
        {formatNumberSpaces(Math.abs(v))}
      </div>
      {sub && (
        <div className="text-[10px] text-muted-foreground mt-0.5 truncate" title={sub}>
          {sub}
        </div>
      )}
    </div>
  );
};

/* ============ Breakdown row ============ */

function BreakdownRow({
  label,
  v,
  positive,
  negative,
  bold,
  signed,
  muted,
}: {
  label: string;
  v: number;
  positive?: boolean;
  negative?: boolean;
  bold?: boolean;
  signed?: boolean;
  muted?: boolean;
}) {
  const cls = positive
    ? "cms-amount-positive"
    : negative
      ? "cms-amount-negative"
      : signed
        ? v > 0
          ? "cms-amount-positive"
          : v < 0
            ? "cms-amount-negative"
            : "text-muted-foreground"
        : muted
          ? "text-muted-foreground"
          : "";
  const sign = positive ? "+" : negative ? "−" : signed && v > 0 ? "+" : signed && v < 0 ? "−" : "";
  return (
    <div className="flex items-center justify-between px-3 py-1.5 border-b border-border last:border-b-0 text-xs">
      <span
        className={cn(
          "uppercase tracking-wider text-muted-foreground",
          bold && "text-foreground font-semibold",
        )}
      >
        {label}
      </span>
      <span className={cn("font-mono tabular-nums", cls, bold && "font-semibold text-sm")}>
        {sign}
        {formatNumberSpaces(Math.abs(v))}
      </span>
    </div>
  );
}
