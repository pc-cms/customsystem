/**
 * Office → Wallets (merged with former Balance tab, 2026-07-20).
 * Single source of truth for cash-desk reconciliation:
 *  - Wallet balances per currency (native) + TZS-equivalent
 *  - Grand Total in TZS and USD (Budget-style)
 *  - Breakdown (Expected): Live/Slots (from Day Closing) /Other ± Miss − Expenses
 *  - Physical count inline, transactions log, wallet CRUD
 */
import { invalidateFinance } from "@/lib/fin-invalidate";
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
  MoreHorizontal,
  CalendarCheck,
  Save,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PageShell, PageSection } from "@/components/layout/PageShell";
import { OfficeActions, useOfficePeriod } from "@/components/office/office-shell";
import FinanceCasinoSwitcher from "@/components/finances/FinanceCasinoSwitcher";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberInput, formatSpacedValue } from "@/components/ui/number-input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { FormGrid, FormField } from "@/components/ui/form-grid";
import { MonthCarousel, MONTHS } from "@/components/payroll/MonthCarousel";
import { useFinWallets, useUpsertFinWallet, useFinWalletTx } from "@/hooks/use-fin";
import { useFinBalanceSnapshot, computeBalanceTotals } from "@/hooks/use-fin-balance";
import { fmtDate } from "@/lib/format-date";
import { CloseMonthWizard } from "@/pages/office/CloseMonthWizard";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useCasino } from "@/lib/casino-context";
import { useAuth } from "@/lib/auth-context";
import { formatNumberSpaces, CASH_DENOMS } from "@/lib/currency";
import { fmtDateOnly } from "@/lib/format-date";
import CashDenomInput, { cashSum } from "@/components/cage/CashDenomInput";
import WalletMovementDialog, { type MovementMode } from "@/components/finances/WalletMovementDialog";
import StaleCountsNotice, { type CountFreshnessRow } from "@/components/office/StaleCountsNotice";

import { useRecordDayBalance, useDayBalanceSnapshot, dayToRecord } from "@/hooks/use-day-balance-snapshot";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const CURRENCIES = ["TZS", "USD", "EUR", "GBP", "KES"];
const KINDS = ["cash", "bank", "mobile_money", "safe", "cage", "external"];
const CASH_LIKE_KINDS = new Set(["cash", "safe"]);
const CURRENCY_ORDER = ["TZS", "USD", "EUR", "GBP", "KES"];

type WalletSortKey =
  | "name"
  | "kind"
  | "currency"
  | "starting_float"
  | "balance_native"
  | "balance_tzs"
  | "counted";

const WALLET_SORT_DEFAULT: { key: WalletSortKey; dir: "asc" | "desc" } = { key: "name", dir: "asc" };

/** Business date (EAT) of a timestamp — counts belong to the day they were taken. */
const eatDate = (ts: string | Date) =>
  new Date(ts).toLocaleDateString("en-CA", { timeZone: "Africa/Dar_es_Salaam" });
const eatTime = (ts: string | Date) =>
  new Date(ts).toLocaleTimeString("en-GB", {
    timeZone: "Africa/Dar_es_Salaam",
    hour: "2-digit",
    minute: "2-digit",
  });


/* ============ Page ============ */

export default function FinancesWalletsPage() {
  const { activeCasinoId } = useCasino();
  const { user, roles } = useAuth();
  const qc = useQueryClient();
  const isSuperAdmin = roles.includes("super_admin");
  const { data: wallets = [] } = useFinWallets();
  const upsert = useUpsertFinWallet();
  /**
   * We always close YESTERDAY: on 05/08 the recorded day is 04/08 (it rolled
   * over at 07:00 EAT). Re-recording during the day overwrites the snapshot.
   */
  const recordTargetDate = dayToRecord();
  const recordDay = useRecordDayBalance();
  /**
   * Business day the physical counts are FOR. We always close YESTERDAY, so
   * counting on 12/08 normally records the 11/08 balances. The user can move
   * this date when catching up on an older day.
   */
  const [countForDate, setCountForDate] = useState<string>(recordTargetDate);
  const { data: recordedSnap } = useDayBalanceSnapshot(countForDate);


  const now = new Date();
  const { period } = useOfficePeriod();
  const ym = { year: period.year, month: period.month };
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

  // per-wallet map for physical-count inline UI.
  // Balance = Actual = last recorded wallet state (manual count, or the state
  // written automatically after a movement). The book/ledger replay is never used.
  const ledgerByWallet = useMemo(() => {
    const m = new Map<
      string,
      { native: number; tzs: number; counted: boolean; asof?: string | null; source?: string | null }
    >();
    (snap?.wallets || []).forEach((w) =>
      m.set(w.wallet_id, {
        native: Number(w.actual_native ?? 0),
        tzs: Number(w.actual_tzs ?? 0),
        counted: w.actual_tzs != null,
        asof: (w as any).physical_asof ?? null,
        source: (w as any).physical_source ?? null,
      }),
    );
    return m;
  }, [snap]);

  /**
   * Count freshness is measured against the business day we are CLOSING
   * (`countForDate`), not the calendar day. Counting yesterday's money this
   * morning is the normal flow and must never be reported as stale.
   */
  const todayEat = eatDate(new Date());
  const refDate = countForDate < range.from ? range.from
    : countForDate > range.to ? range.to : countForDate;
  const freshness = useMemo<CountFreshnessRow[]>(() => {
    const refMs = new Date(`${refDate}T00:00:00Z`).getTime();
    return (snap?.wallets || []).map((w) => {
      const asof = (w as any).physical_asof as string | null;
      const cd = asof ? eatDate(asof) : null;
      const days = cd
        ? Math.max(0, Math.round((refMs - new Date(`${cd}T00:00:00Z`).getTime()) / 86400000))
        : null;
      return {
        wallet_id: w.wallet_id,
        name: w.name,
        currency: w.currency,
        actual_native: Number(w.actual_native ?? 0),
        actual_tzs: Number(w.actual_tzs ?? 0),
        counted_date: cd,
        counted_time: asof ? eatTime(asof) : null,
        source: ((w as any).physical_source as string) ?? null,
        days,
        stale: !cd || cd < refDate,
      };
    });
  }, [snap, refDate]);

  const freshnessByWallet = useMemo(() => {
    const m = new Map<string, CountFreshnessRow>();
    freshness.forEach((r) => m.set(r.wallet_id, r));
    return m;
  }, [freshness]);



  /* Last physical count per wallet — shown as grey placeholder hints. */
  const { data: lastCounts } = useQuery({
    queryKey: ["wallet-last-counts", activeCasinoId],
    enabled: !!activeCasinoId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cash_count_snapshots")
        .select("wallet_id, denominations, physical_total, created_at, source")
        .eq("casino_id", activeCasinoId!)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      const m = new Map<string, { denoms: Record<number, number>; total: number; at: string; source: string }>();
      (data || []).forEach((r: any) => {
        if (!r.wallet_id || m.has(r.wallet_id)) return;
        m.set(r.wallet_id, {
          denoms: (r.denominations || {}) as Record<number, number>,
          total: Number(r.physical_total || 0),
          at: r.created_at,
          source: String(r.source || "manual"),
        });
      });

      return m;
    },
  });

  /* Denomination hints come from the LAST PHYSICAL COUNT only.
     No ledger / movement replay is used anywhere on this page. */
  const expectedDenoms = useMemo(() => {
    const m = new Map<string, { denoms: Record<number, number>; unallocated: number }>();
    (lastCounts ? [...lastCounts.keys()] : []).forEach((id) => {
      const base = lastCounts?.get(id)?.denoms || {};
      const denoms: Record<number, number> = {};
      Object.entries(base).forEach(([k, v]) => {
        if (String(k) === "cents") return;
        denoms[Number(k)] = Number(v || 0);
      });
      m.set(id, { denoms, unallocated: 0 });
    });
    return m;
  }, [lastCounts]);

  // Grand totals in TZS and USD — Actual (last recorded count), same source as Variance.
  const grandTotals = useMemo(() => {
    const tzs = (snap?.wallets || []).reduce((s, w) => s + Number(w.actual_tzs ?? 0), 0);
    const usd = usdRate > 0 ? tzs / usdRate : 0;
    // per-currency native totals
    const perCcy: Record<string, number> = {};
    (snap?.wallets || []).forEach((w) => {
      perCcy[w.currency] = (perCcy[w.currency] || 0) + Number(w.actual_native ?? 0);
    });
    return { tzs, usd, perCcy };
  }, [snap, usdRate]);


  const toggleWalletSort = (k: WalletSortKey) => {
    setWalletSort((s) => ({
      key: k,
      dir: s.key === k && s.dir === "asc" ? "desc" : "asc",
    }));
  };

  const visibleWallets = useMemo(() => {
    const list = [...wallets] as any[];
    const { key, dir } = walletSort;
    const mult = dir === "asc" ? 1 : -1;
    list.sort((a, b) => {
      let av: any;
      let bv: any;
      const ledA = ledgerByWallet.get(a.id) || { native: 0, tzs: 0, counted: false };
      const ledB = ledgerByWallet.get(b.id) || { native: 0, tzs: 0, counted: false };
      switch (key) {
        case "name":
          av = a.name || "";
          bv = b.name || "";
          break;
        case "kind":
          av = a.kind || "";
          bv = b.kind || "";
          break;
        case "currency":
          av = a.currency || "";
          bv = b.currency || "";
          break;
        case "starting_float":
          av = Number(a.starting_float_amount || 0);
          bv = Number(b.starting_float_amount || 0);
          break;
        case "balance_native":
          av = ledA.native;
          bv = ledB.native;
          break;
        case "balance_tzs":
          av = ledA.tzs;
          bv = ledB.tzs;
          break;
        case "counted":
          av = freshnessByWallet.get(a.id)?.counted_date || "";
          bv = freshnessByWallet.get(b.id)?.counted_date || "";
          break;
      }

      if (typeof av === "string") {
        return av.localeCompare(bv) * mult;
      }
      return (av > bv ? 1 : av < bv ? -1 : 0) * mult;
    });
    return list;
  }, [wallets, walletSort, ledgerByWallet, freshnessByWallet]);

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
    invalidateFinance(qc);
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
  const [touchedCount, setTouchedCount] = useState<Record<string, boolean>>({});
  const [savingId, setSavingId] = useState<string | null>(null);


  const toggleRow = (id: string) => setExpanded((s) => ({ ...s, [id]: !s[id] }));

  /** Open the count form for every wallet whose last count is older than refDate. */
  const countAllStale = () => {
    const stale = freshness.filter((r) => r.stale);
    if (!stale.length) return;
    setExpanded((s) => {
      const n = { ...s };
      stale.forEach((r) => {
        n[r.wallet_id] = true;
      });
      return n;
    });
    setTimeout(
      () => document.getElementById("wallets-table")?.scrollIntoView({ behavior: "smooth", block: "start" }),
      50,
    );
  };


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
    // just because someone clicked Save without entering anything. But an
    // explicitly entered zero (empty wallet) is a valid physical count.
    const countTouched = !!touchedCount[w.id];
    const denomEntered = useDenoms
      && (countTouched || Object.values(denomCounts[w.id] || {}).some((v) => Number(v) > 0) || cents > 0);
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

    // A count belongs to the business day it is FOR, chosen above the table.
    // Entering 11/08 figures on 12/08 is the normal flow — the business day is
    // always closed the next morning.
    const countDate = countForDate;
    setSavingId(w.id);
    let variance = 0;
    try {
      const led = ledgerByWallet.get(w.id) || { native: 0, tzs: 0, counted: false };
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
      // A physical count is a new Actual snapshot, never a financial movement.
      // Variance is informational and must not be written back into the wallet.
      const { data: res, error: rpcError } = await (supabase as any).rpc("fin_save_wallet_count", {
        p_wallet_id: w.id,
        p_counted: counted,
        p_denominations: useDenoms ? { ...(denomCounts[w.id] || {}), ...(cents ? { cents } : {}) } : {},
        p_note: countNote[w.id] || "",
        p_business_date: countDate,
        p_fx_rate: fxRate,
      });
      if (rpcError) throw rpcError;
      variance = Number(res?.variance || 0);

      toast.success(
        Math.abs(variance) >= 0.01
          ? `Physical count saved · ${w.name}`
          : `Physical count checked · ${w.name}`,
      );
      setDenomCounts((s) => ({ ...s, [w.id]: {} }));
      setCentsInput((s) => ({ ...s, [w.id]: 0 }));
      setAmountInput((s) => ({ ...s, [w.id]: "" }));
      setCountNote((s) => ({ ...s, [w.id]: "" }));
      setTouchedCount((s) => ({ ...s, [w.id]: false }));
      setExpanded((s) => ({ ...s, [w.id]: false }));
      invalidateFinance(qc);

    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSavingId(null);
    }
  };

  const WalletSortIcon = ({ k }: { k: WalletSortKey }) =>
    walletSort.key === k ? (
      walletSort.dir === "asc" ? (
        <ArrowUp className="w-3 h-3 inline ml-1 align-text-bottom" />
      ) : (
        <ArrowDown className="w-3 h-3 inline ml-1 align-text-bottom" />
      )
    ) : null;

  return (
    <PageShell>
      <OfficeActions>
        <Button
          variant="secondary"
          size="sm"
          className="h-9"
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
          className="h-9"
          onClick={() => {
            setMoveWalletId(undefined);
            setMoveMode("out");
            setMoveOpen(true);
          }}
        >
          <ArrowUpRight className="w-4 h-4" /> Money Out
        </Button>
        <div
          className="flex items-center gap-2 h-9 px-2 rounded-md border border-border bg-card"
          title="Business day the counts are for. A business day is always closed the next morning."
        >
          <span className="text-xs text-muted-foreground whitespace-nowrap">Counting for</span>
          <input
            type="date"
            value={countForDate}
            max={todayEat}
            onChange={(e) => e.target.value && setCountForDate(e.target.value)}
            className="h-7 bg-transparent text-xs font-mono text-foreground outline-none"
          />
          {countForDate !== recordTargetDate && (
            <button
              type="button"
              className="text-[10px] uppercase tracking-wide text-primary"
              onClick={() => setCountForDate(recordTargetDate)}
            >
              reset
            </button>
          )}
        </div>
        <Button
          variant={recordedSnap ? "outline" : "default"}
          size="sm"
          className="h-9"
          disabled={recordDay.isPending}
          title={
            recordedSnap
              ? `Recorded ${fmtDate(countForDate)} · re-record to overwrite`
              : `Record safes & bank as of ${fmtDate(countForDate)}`
          }
          onClick={() => recordDay.mutate(countForDate)}
        >
          <Save className={cn("w-4 h-4", recordDay.isPending && "animate-pulse")} />
          Record {fmtDate(countForDate)}
        </Button>
        <Button size="sm" className="h-9" onClick={openNewWallet}>
          <Plus className="w-4 h-4" /> Add Wallet
        </Button>


        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" className="h-9 w-9" aria-label="More actions">
              <MoreHorizontal className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={reconcileNow}>
              <RotateCw className={cn("w-4 h-4 mr-2", isFetching && "animate-spin")} /> Reconcile Now
            </DropdownMenuItem>
            {isSuperAdmin && (
              <DropdownMenuItem onClick={() => setCloseOpen(true)}>
                <CalendarCheck className="w-4 h-4 mr-2" /> Close Month
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </OfficeActions>
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

      {/* COUNT FRESHNESS — Actual is only as fresh as the last count per wallet */}
      <PageSection card={false}>
        <StaleCountsNotice rows={freshness} refDate={refDate} onCountAll={countAllStale} />
      </PageSection>



      {/* BREAKDOWN + GRAND TOTAL */}
      <div id="wallets-breakdown" className="grid grid-cols-1 lg:grid-cols-2 gap-4 scroll-mt-20">
        <PageSection title="Breakdown (Expected)" card={false}>
          <div className="rounded-md border border-border bg-card">
            <BreakdownRow
              label="Starting Float (income · start of period)"
              v={snap?.starting_float?.grand_tzs || 0}
              positive
            />
            <BreakdownRow label="Live Game" v={snap?.incomes?.live_game || 0} positive />
            <BreakdownRow label="Slots" v={snap?.incomes?.slots || 0} positive />
            <BreakdownRow label="Other Income" v={snap?.incomes?.other || 0} positive />
            <BreakdownRow label="JP (IN)" v={snap?.incomes?.jp || 0} positive />
            <BreakdownRow label="Card Balance (Σ daily diff)" v={snap?.incomes?.card_balance || 0} signed />

            <BreakdownRow label="Missed Chips (±)" v={snap?.incomes?.missed_chips || 0} signed />
            <BreakdownRow label="Missed Cards (±)" v={snap?.incomes?.missed_cards || 0} signed />
            <BreakdownRow label="− Expenses" v={snap?.expenses_total || 0} negative />
            {/* Owner withdrawal — cash physically leaves the casino, subtracted from Expected */}
            <BreakdownRow label="− Collections (owner withdrawal)" v={snap?.collections_total || 0} negative />
            {/* Transfers out — cash leaves this casino's wallets, subtracted from Expected */}
            <BreakdownRow label="− Transfers" v={snap?.transfers_total || 0} negative />
            <div className="border-t-2 border-border">
              <BreakdownRow label="= Expected" v={totals.expected} bold signed />
            </div>
            <div className="border-t border-border">
              <BreakdownRow label="Actual (Σ wallets · last recorded state)" v={totals.actual} bold signed />
              <BreakdownRow label="= Variance (Actual − Expected)" v={totals.variance} bold signed />
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

      {/* DAILY AUDIT */}
      {!!snap?.daily?.length && (
        <PageSection title="Daily audit" card={false}>
          <div className="rounded-md border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted text-[11px] uppercase tracking-wider">
                <tr>
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-right">Live</th>
                  <th className="px-3 py-2 text-right">Slots</th>
                  <th className="px-3 py-2 text-right">Other</th>
                  <th className="px-3 py-2 text-right">JP</th>
                  <th className="px-3 py-2 text-right">Expenses</th>
                  <th className="px-3 py-2 text-right">Collections</th>
                  <th className="px-3 py-2 text-right">Cage exp.</th>
                  <th className="px-3 py-2 text-right">Net</th>
                </tr>
              </thead>
              <tbody className="font-mono tabular-nums">
                {snap.daily.map((d) => (
                  <tr key={d.business_date} className="border-t border-border hover:bg-muted/40">
                    <td className="px-3 py-1.5 text-left">
                      {fmtDate(d.business_date)}
                      {!d.day_closed && <span className="ml-1 text-[10px] text-muted-foreground">(open)</span>}
                    </td>
                    <td className="px-3 py-1.5 text-right">{formatNumberSpaces(d.live_game)}</td>
                    <td className="px-3 py-1.5 text-right">{formatNumberSpaces(d.slots)}</td>
                    <td className="px-3 py-1.5 text-right">{formatNumberSpaces(d.other)}</td>
                    <td className="px-3 py-1.5 text-right">{formatNumberSpaces(d.jp || 0)}</td>
                    <td className="px-3 py-1.5 text-right cms-amount-negative">{formatNumberSpaces(d.expenses)}</td>
                    <td className="px-3 py-1.5 text-right cms-amount-negative">{formatNumberSpaces(d.collections)}</td>
                    <td className="px-3 py-1.5 text-right">
                      {formatNumberSpaces(d.cage_expenses || 0)}
                      {!!(d.cage_expenses || 0) && (
                        <span
                          className={cn("ml-1 text-[10px]", d.cage_posted ? "cms-amount-positive" : "text-muted-foreground")}
                          title={d.cage_posted ? "Booked on wallet" : "Not booked on a wallet yet"}
                        >
                          {d.cage_posted ? "✓" : "·"}
                        </span>
                      )}
                    </td>
                    <td className={cn("px-3 py-1.5 text-right font-semibold", d.net >= 0 ? "cms-amount-positive" : "cms-amount-negative")}>
                      {formatNumberSpaces(d.net)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="text-[10px] text-muted-foreground mt-1">
            Expenses count once the business day is closed (office expenses immediately).
          </div>
        </PageSection>
      )}

      {/* WALLETS TABLE */}
      <div id="wallets-table" className="scroll-mt-20" />
      <PageSection title="Wallets" card={false}>

        <div className="rounded-md border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted text-xs uppercase">
              <tr>
                <th className="w-6"></th>
                <th
                  className="px-3 py-2 text-left cursor-pointer select-none"
                  onClick={() => toggleWalletSort("name")}
                >
                  Name <WalletSortIcon k="name" />
                </th>
                <th
                  className="px-3 py-2 text-left cursor-pointer select-none"
                  onClick={() => toggleWalletSort("kind")}
                >
                  Kind <WalletSortIcon k="kind" />
                </th>
                <th
                  className="px-3 py-2 text-left cursor-pointer select-none"
                  onClick={() => toggleWalletSort("currency")}
                >
                  Currency <WalletSortIcon k="currency" />
                </th>
                <th
                  className="px-3 py-2 text-right cursor-pointer select-none"
                  onClick={() => toggleWalletSort("starting_float")}
                >
                  Starting Float <WalletSortIcon k="starting_float" />
                </th>
                <th
                  className="px-3 py-2 text-right cursor-pointer select-none"
                  onClick={() => toggleWalletSort("balance_native")}
                >
                  Balance (native) <WalletSortIcon k="balance_native" />
                </th>
                <th
                  className="px-3 py-2 text-right cursor-pointer select-none"
                  onClick={() => toggleWalletSort("balance_tzs")}
                >
                  Balance (TZS) <WalletSortIcon k="balance_tzs" />
                </th>
                <th
                  className="px-3 py-2 text-left cursor-pointer select-none"
                  onClick={() => toggleWalletSort("counted")}
                >
                  Counted <WalletSortIcon k="counted" />
                </th>
                <th className="w-12"></th>

              </tr>
            </thead>
            <tbody>
              {visibleWallets.map((w) => {
                const isOpen = !!expanded[w.id];
                const useDenoms = CASH_LIKE_KINDS.has(w.kind);
                const denoms = CASH_DENOMS[w.currency] || CASH_DENOMS.TZS;
                const denomVals = denomCounts[w.id] || {};
                const centsVal = w.currency === "TZS" && useDenoms ? centsInput[w.id] || 0 : 0;
                const counted = useDenoms
                  ? cashSum(denomVals) + centsVal / 100
                  : Number(amountInput[w.id] || 0);
                const led = ledgerByWallet.get(w.id) || { native: 0, tzs: 0, counted: false };
                const fresh = freshnessByWallet.get(w.id);

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
                          : `0 ${w.currency}`}
                        {w.starting_float_date && (
                          <div className="text-[10px] text-muted-foreground">
                            from {fmtDateOnly(w.starting_float_date)}
                          </div>
                        )}
                      </td>
                      <td className="text-right font-mono tabular-nums">
                        {led.counted ? (
                          <>
                            {formatNumberSpaces(led.native)}{" "}
                            <span className="text-[10px] text-muted-foreground">{w.currency}</span>
                          </>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </td>
                      <td className="text-right font-mono tabular-nums">
                        {led.counted ? formatNumberSpaces(led.tzs) : <span className="text-muted-foreground">0</span>}
                      </td>
                      <td className="px-3 whitespace-nowrap text-xs">
                        {fresh?.counted_date ? (
                          <>
                            <span
                              className={cn(
                                "font-mono tabular-nums",
                                fresh.stale ? "text-amber-600 dark:text-amber-400" : undefined,
                              )}
                            >
                              {fmtDate(fresh.counted_date)}
                            </span>{" "}
                            <span className="text-[10px] text-muted-foreground">
                              {fresh.counted_time}
                            </span>
                            <div className="text-[10px] text-muted-foreground">
                              {fresh.source === "manual" ? "counted" : "after movement"}
                              {fresh.stale && fresh.days ? ` · ${fresh.days}d old` : ""}
                            </div>
                          </>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">never counted</span>
                        )}
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
                        <td colSpan={9} className="p-4">
                          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                            <div>
                              <div className="flex items-baseline justify-between mb-2">
                                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                                  Physical count · {w.currency}
                                </div>
                                {lastCounts?.get(w.id) && (
                                  <div className="text-[10px] text-muted-foreground/70">
                                    {lastCounts.get(w.id)!.source === "auto" ? "Auto" : "Manual"}:{" "}
                                    {formatNumberSpaces(lastCounts.get(w.id)!.total)} ·{" "}
                                    {fmtDateOnly(lastCounts.get(w.id)!.at)}
                                  </div>
                                )}

                              </div>
                              {useDenoms ? (
                                <>
                                  <CashDenomInput
                                    values={denomVals}
                                    onChange={(v) => {
                                      setDenomCounts((s) => ({ ...s, [w.id]: v }));
                                      setTouchedCount((s) => ({ ...s, [w.id]: true }));
                                    }}
                                    denoms={denoms}
                                    currency={w.currency}
                                    size="sm"
                                    placeholders={expectedDenoms.get(w.id)?.denoms}
                                    {...(w.currency === "TZS"
                                      ? {
                                          cents: centsVal,
                                          onCentsChange: (c: number) => {
                                            setCentsInput((s) => ({ ...s, [w.id]: c }));
                                            setTouchedCount((s) => ({ ...s, [w.id]: true }));
                                          },

                                          centsPlaceholder: (() => {
                                            const t = lastCounts?.get(w.id)?.total ?? 0;
                                            return Math.round((t - Math.trunc(t)) * 100);
                                          })(),
                                        }
                                      : {})}
                                  />
                                  <div className="mt-1 text-[10px] text-muted-foreground/70">
                                    Grey hints = notes from the last physical count
                                  </div>
                                </>
                              ) : (
                                <NumberInput
                                  decimals={2}
                                  placeholder={
                                    lastCounts?.get(w.id)
                                      ? formatSpacedValue(lastCounts.get(w.id)!.total, 2, true)
                                      : `Amount (${w.currency})`
                                  }
                                  value={amountInput[w.id] || ""}
                                  onValueChange={(v) => {
                                    setAmountInput((s) => ({ ...s, [w.id]: v == null ? "" : String(v) }));
                                    setTouchedCount((s) => ({ ...s, [w.id]: true }));
                                  }}
                                  className="font-mono"
                                />

                              )}
                            </div>

                            <div className="space-y-3">
                              <div className="rounded-md border border-border bg-card p-3 space-y-1">
                                <div className="flex items-center justify-between text-xs">
                                  <span className="text-muted-foreground">
                                    Last count ({w.currency})
                                  </span>
                                  <span className="font-mono tabular-nums">
                                    {led.counted ? formatNumberSpaces(led.native) : "0"}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between text-xs text-muted-foreground">
                                  <span>Last count (TZS)</span>
                                  <span className="font-mono tabular-nums">
                                    {led.counted ? formatNumberSpaces(led.tzs) : "0"}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between text-xs">
                                  <span className="text-muted-foreground">Counted</span>
                                  <span className="font-mono tabular-nums">
                                    {formatNumberSpaces(counted)} {w.currency}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between text-sm font-semibold pt-1 border-t border-border">
                                  <span>Change vs last count</span>
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
                  <td colSpan={9} className="text-center text-muted-foreground py-6">
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
                  <td /><td />
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
                  <td /><td />
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
                // Direction comes from the kind — expenses are stored as positive amounts.
                const kind = String(r.kind || "");
                const isIn =
                  kind === "expense" || kind === "transfer_out" || kind === "change_out"
                    ? false
                    : kind === "income" || kind === "transfer_in" || kind === "change_in"
                      ? true
                      : Number(r.amount_tzs) >= 0;
                return (
                  <tr key={r.id} className="border-t border-border hover:bg-muted/40">
                    <td className="px-3 py-1.5 font-mono text-xs">{fmtDateOnly(r.business_date)}</td>
                    <td className="px-3 py-1.5">{r.fin_wallets?.name || "—"}</td>
                    <td className="px-3 py-1.5 text-xs uppercase text-muted-foreground">
                      {r.kind}
                      {!r.posted_at && (
                        <span
                          className="ml-1.5 rounded border border-warning/40 px-1 py-0.5 text-[9px] tracking-wider text-warning"
                          title="Posts to the wallet balance when the business day is closed"
                        >
                          PENDING
                        </span>
                      )}
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
                      {isIn ? "" : "−"}{formatNumberSpaces(Math.abs(Number(r.amount)))}{" "}
                      <span className="text-[10px] text-muted-foreground">{r.currency}</span>
                    </td>
                    <td
                      className={cn(
                        "px-3 py-1.5 text-right font-mono tabular-nums",
                        isIn ? "cms-amount-positive" : "cms-amount-negative",
                      )}
                    >
                      {isIn ? "" : "−"}{formatNumberSpaces(Math.abs(Number(r.amount_tzs)))}
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
            <NumberInput
              value={walletForm.sort_order ?? 0}
              onValueChange={(v) =>
                setWalletForm({ ...walletForm, sort_order: v ?? 0 })
              }
            />
          </FormField>

          <FormField span={12}>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1 mb-1 border-t border-border pt-2">
              Starting Float (edited by manager / finance / super-admin · logged)
            </div>
          </FormField>
          <FormField span={5} label={`Amount (${walletForm.currency || "TZS"})`}>
            <NumberInput
              decimals={2}
              value={walletForm.starting_float_amount ?? 0}
              onValueChange={(v) =>
                setWalletForm({ ...walletForm, starting_float_amount: v == null ? "" : String(v) })
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
  // Effective direction: a "positive" row with a negative value must flip to minus/red,
  // and a "negative" (subtracted) row with a negative value flips to plus/green.
  const dir = positive ? (v < 0 ? -1 : v > 0 ? 1 : 0) : negative ? (v < 0 ? 1 : v > 0 ? -1 : 0) : v > 0 ? 1 : v < 0 ? -1 : 0;
  const cls =
    positive || negative || signed
      ? dir > 0
        ? "cms-amount-positive"
        : dir < 0
          ? "cms-amount-negative"
          : "text-muted-foreground"
      : muted
        ? "text-muted-foreground"
        : "";
  const sign = positive || negative || signed ? (dir > 0 ? "+" : dir < 0 ? "−" : "") : "";

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
