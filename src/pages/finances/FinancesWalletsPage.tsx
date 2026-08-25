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
  CalendarCheck,
  Sliders,
} from "lucide-react";

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

import { useFinWallets, useUpsertFinWallet, useFinWalletTx } from "@/hooks/use-fin";
import { useFinBalanceSnapshot, computeBalanceTotals } from "@/hooks/use-fin-balance";
import { fmtDate } from "@/lib/format-date";
import { CloseMonthWizard } from "@/pages/office/CloseMonthWizard";
import { useAdjustFloat, useMonthFinance } from "@/hooks/use-fin-month-finance";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useCasino } from "@/lib/casino-context";
import { useAuth } from "@/lib/auth-context";
import { formatNumberSpaces, CASH_DENOMS } from "@/lib/currency";
import { fmtDateOnly } from "@/lib/format-date";
import CashDenomInput, { cashSum } from "@/components/cage/CashDenomInput";
import WalletMovementDialog, { type MovementMode } from "@/components/finances/WalletMovementDialog";
import StaleCountsNotice, { type CountFreshnessRow } from "@/components/office/StaleCountsNotice";
import { BalanceBanner } from "@/components/office/BalanceBanner";


import { dayToRecord } from "@/hooks/use-day-balance-snapshot";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { walletTxIsIn, isWalletAdjustment } from "@/lib/wallet-tx-sign";
import {
  WALLET_GROUPS,
  WALLET_GROUP_ORDER,
  WALLET_GROUP_KINDS,
  groupOfWallet,
  walletGroupLabel,
  type WalletGroup,
} from "@/lib/wallet-groups";

const CURRENCIES = ["TZS", "USD", "EUR", "GBP", "KES"];
const KINDS = [
  "cash",
  "bank",
  "mobile_money",
  "digital_wallet",
  "selcom",
  "safe",
  "cage",
  "external",
];
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

/** Default view: canonical Group -> Name. Column clicks sort WITHIN each group. */
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


/** Signed amount colour helper (project tokens). */
const cls = (n: number) =>
  n > 0 ? "cms-amount-positive" : n < 0 ? "cms-amount-negative" : "text-muted-foreground";

/* ============ Page ============ */

export default function FinancesWalletsPage() {
  const { activeCasinoId } = useCasino();
  const { user, roles } = useAuth();
  const qc = useQueryClient();
  const isSuperAdmin = roles.includes("super_admin");
  const canCloseMonth = roles.some((r) =>
    ["super_admin", "admin", "manager", "general_manager", "finance_manager"].includes(r),
  );
  const { data: wallets = [] } = useFinWallets();
  const upsert = useUpsertFinWallet();
  /* Signed Basic Float adjustment lives ONLY here (not in Monthly Report). */
  const adjustFloat = useAdjustFloat();
  const [floatOpen, setFloatOpen] = useState(false);
  const [floatDir, setFloatDir] = useState<"increase" | "decrease">("increase");
  const [floatAmt, setFloatAmt] = useState(0);
  const [floatWallet, setFloatWallet] = useState<string>("");
  const [floatNote, setFloatNote] = useState("");
  /**
   * Physical counts always belong to the business day being closed (yesterday):
   * on 05/08 the counted day is 04/08 (it rolled over at 07:00 EAT).
   */
  const countForDate = dayToRecord();


  const now = new Date();
  const { period } = useOfficePeriod();
  const ym = { year: period.year, month: period.month };
  const { data: monthFinance } = useMonthFinance(activeCasinoId, ym.year, ym.month);
  const monthClosed = monthFinance?.status === "closed";
  const floatCurrent = Number(monthFinance?.float?.current_tzs || 0);
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
  /** Inactive wallets are hidden by default; legacy wallets stay visible while active. */
  const [includeInactive, setIncludeInactive] = useSessionState<boolean>("walletInactive", false);
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
  

  // Unified snapshot — same source of truth as former Balance tab.
  const { data: snap, isFetching } = useFinBalanceSnapshot(range.from, range.to);
  const totals = useMemo(() => computeBalanceTotals(snap), [snap]);
  const usdRate = snap?.rates?.usd_tzs || 2600;

  const [txLimit, setTxLimit] = useState<string>("10");
  const { data: tx = [] } = useFinWalletTx({
    from: monthRange.from,
    to: monthRange.to,
    limit: txLimit === "all" ? null : Number(txLimit),
  });


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
  /** Cash / Mobile / Bank buckets keep native units separated per currency. */
  const bucketOfKind = (kind?: string | null) => {
    switch (kind) {
      case "bank":
        return "bank" as const;
      case "mobile_money":
      case "digital_wallet":
      case "selcom":
        return "mobile" as const;
      default:
        return "cash" as const;
    }
  };

  const grandTotals = useMemo(() => {
    const tzs = (snap?.wallets || []).reduce((s, w) => s + Number(w.actual_tzs ?? 0), 0);
    const usd = usdRate > 0 ? tzs / usdRate : 0;
    // per-currency native totals, split into Cash / Mobile / Bank
    const perCcy: Record<string, number> = {};
    const perCcyBucket: Record<string, { cash: number; mobile: number; bank: number }> = {};
    (snap?.wallets || []).forEach((w) => {
      const native = Number(w.actual_native ?? 0);
      perCcy[w.currency] = (perCcy[w.currency] || 0) + native;
      const b = (perCcyBucket[w.currency] ||= { cash: 0, mobile: 0, bank: 0 });
      b[bucketOfKind(w.kind)] += native;
    });
    return { tzs, usd, perCcy, perCcyBucket };
  }, [snap, usdRate]);



  const toggleWalletSort = (k: WalletSortKey) => {
    setWalletSort((s) => ({
      key: k,
      dir: s.key === k && s.dir === "asc" ? "desc" : "asc",
    }));
  };

  const visibleWallets = useMemo(() => {
    const list = (wallets as any[]).filter((w) => includeInactive || w.is_active !== false);
    const { key, dir } = walletSort;
    const mult = dir === "asc" ? 1 : -1;
    const sorted = [...list];
    sorted.sort((a, b) => {
      // Canonical group always wins — column sorts apply INSIDE each group.
      const ga = WALLET_GROUP_ORDER[groupOfWallet(a)] ?? 99;
      const gb = WALLET_GROUP_ORDER[groupOfWallet(b)] ?? 99;
      if (ga !== gb) return ga - gb;

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
        const c = av.localeCompare(bv) * mult;
        return c !== 0 ? c : String(a.name || "").localeCompare(String(b.name || ""));
      }
      const c = (av > bv ? 1 : av < bv ? -1 : 0) * mult;
      return c !== 0 ? c : String(a.name || "").localeCompare(String(b.name || ""));
    });
    return sorted;
  }, [wallets, walletSort, ledgerByWallet, freshnessByWallet, includeInactive]);


  const txRows = useMemo(() => {
    let list = tx as any[];
    if (walletFilter !== "all") list = list.filter((r) => r.wallet_id === walletFilter);
    if (kindFilter !== "all")
      list = list.filter((r) => (walletTxIsIn(r) ? "in" : "out") === kindFilter);
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
    setWalletForm({
      name: "",
      kind: "cash",
      wallet_group: "cash",
      currency: "TZS",
      sort_order: 0,
      is_active: true,
    });
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
        <Button size="sm" className="h-9" onClick={openNewWallet}>
          <Plus className="w-4 h-4" /> Add Wallet
        </Button>
        {canCloseMonth && (
          <Button variant="outline" size="sm" className="h-9" onClick={() => setFloatOpen(true)}>
            <Sliders className="w-4 h-4" /> Adjust Float
          </Button>
        )}
        {canCloseMonth && (
          <Button variant="outline" size="sm" className="h-9" onClick={() => setCloseOpen(true)}>
            <CalendarCheck className="w-4 h-4" />
            Close Month · {ym.year}-{String(ym.month).padStart(2, "0")} ·{" "}
            {monthClosed ? "Closed" : "Open"}
          </Button>
        )}
      </OfficeActions>
      {/* KPI STRIP */}
      <PageSection card={false}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Kpi label="Total Wallets" tone="neutral" v={grandTotals.tzs} sub="grand TZS · period end" />
          <Kpi
            label="Total Income"
            tone="positive"
            v={incomeTotal}
            sub={`Table ${formatNumberSpaces(snap?.incomes?.live_game || 0)} · Slot ${formatNumberSpaces(snap?.incomes?.slots || 0)} · Other ${formatNumberSpaces(snap?.incomes?.other || 0)}`}
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

      {/* CASH SURPLUS/DEFICIT + COUNT FRESHNESS — one responsive row, equal width and height */}
      <PageSection card={false}>
        <div
          className={cn(
            "grid grid-cols-1 gap-2 items-stretch",
            freshness.some((r) => r.stale) && "md:grid-cols-2",
          )}
        >
          <BalanceBanner />
          <StaleCountsNotice rows={freshness} refDate={refDate} onCountAll={countAllStale} />

        </div>
      </PageSection>




      {/* BREAKDOWN + GRAND TOTAL */}
      <div id="wallets-breakdown" className="grid grid-cols-1 lg:grid-cols-2 gap-4 scroll-mt-20">
        <PageSection title="Breakdown (Expected)" card={false}>
          <div className="rounded-md border border-border bg-card">
            <BreakdownRow
              label="Opening Basic Float (start of period)"
              v={snap?.starting_float?.grand_tzs || 0}
              positive
            />
            <BreakdownRow label="Add Float" v={snap?.incomes?.add_float || 0} signed />
            <BreakdownRow label="Table Result" v={snap?.incomes?.live_game || 0} positive />
            <BreakdownRow label="CashDesk Win (slots cash)" v={snap?.incomes?.slots || 0} positive />
            <BreakdownRow label="Commissions" v={snap?.incomes?.other || 0} signed />
            <BreakdownRow label="Tips & Bonuses (±)" v={snap?.incomes?.tips_bonus || 0} signed />
            <BreakdownRow label="Other movements (investment / office)" v={snap?.incomes?.movements || 0} signed />
            <BreakdownRow label="JP (±)" v={snap?.incomes?.jp || 0} signed />

            <BreakdownRow label="Card Balance (cash held in cage)" v={snap?.incomes?.card_balance || 0} signed />


            <BreakdownRow label="Missed Chips (±)" v={snap?.incomes?.missed_chips || 0} signed />
            <BreakdownRow label="Missed Cards (±)" v={snap?.incomes?.missed_cards || 0} signed />
            <BreakdownRow label="− Expenses" v={snap?.expenses_total || 0} negative />
            {/* Owner withdrawal — cash physically leaves the casino, subtracted from Expected */}
            <BreakdownRow label="− Collections (owner withdrawal)" v={snap?.collections_total || 0} negative />
            {/* Transfers out — cash leaves this casino's wallets, subtracted from Expected */}
            <BreakdownRow label="− Transfers" v={snap?.transfers_total || 0} negative />
            {/* No "= Expected" row here — the Expected tile in Grand Total is the single display. */}
          </div>

          <div className="text-[10px] text-muted-foreground mt-1">
            USD→TZS rate {formatNumberSpaces(usdRate)} · Period {range.from} → {range.to}
          </div>
        </PageSection>

        <PageSection title="Grand Total (Wallets)" card={false}>
          <div className="rounded-md border border-border bg-card p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-md border border-border bg-background p-3">
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Expected</div>
                <div className={cn("font-mono tabular-nums text-2xl font-semibold mt-1", cls(totals.expected))}>
                  {formatNumberSpaces(totals.expected)}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">Breakdown total (TZS)</div>
              </div>
              <div className="rounded-md border border-border bg-background p-3">
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Actual</div>
                <div className={cn("font-mono tabular-nums text-2xl font-semibold mt-1", cls(totals.actual))}>
                  {formatNumberSpaces(totals.actual)}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">Σ wallets · last recorded state</div>
              </div>
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
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1.5">
                Per currency (native units)
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
                {CURRENCY_ORDER.filter((c) => grandTotals.perCcy[c]).map((c) => {
                  const b = grandTotals.perCcyBucket[c] || { cash: 0, mobile: 0, bank: 0 };
                  const buckets: [string, number][] =
                    c === "TZS"
                      ? [["Cash", b.cash], ["Mobile", b.mobile], ["Bank", b.bank]]
                      : c === "USD"
                        ? [["Cash", b.cash], ["Bank", b.bank]]
                        : [["Cash", b.cash]];
                  return (
                    <div key={c} className="rounded-md border border-border/60 bg-background/50 px-3 py-2">
                      <div className="flex items-baseline justify-between gap-3 pb-1.5 border-b border-border/50">
                        <span className="text-xs font-semibold tracking-wider text-muted-foreground">{c}</span>
                        <span className="font-mono tabular-nums text-base font-semibold whitespace-nowrap">
                          {formatNumberSpaces(grandTotals.perCcy[c])}
                        </span>
                      </div>
                      <dl className="mt-1.5 space-y-0.5">
                        {buckets.map(([lbl, v]) => (
                          <div key={lbl} className="flex items-baseline justify-between gap-3">
                            <dt className="text-xs uppercase tracking-wider text-muted-foreground">{lbl}</dt>
                            <dd className="font-mono tabular-nums text-sm whitespace-nowrap">
                              {v ? formatNumberSpaces(v) : "·"}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  );
                })}
              </div>
            </div>


          </div>
        </PageSection>
      </div>

      {/* WALLETS TABLE */}
      <div id="wallets-table" className="scroll-mt-20" />
      <PageSection title="Wallets" card={false}>
        <div className="flex items-center justify-end gap-2 mb-2">
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              className="h-3.5 w-3.5 accent-primary"
              checked={includeInactive}
              onChange={(e) => setIncludeInactive(e.target.checked)}
            />
            Include inactive
          </label>
        </div>

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
              {visibleWallets.map((w, idx) => {
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
                const grp = groupOfWallet(w);
                const prevGrp = idx > 0 ? groupOfWallet(visibleWallets[idx - 1]) : null;
                const showGroupHeader = grp !== prevGrp;

                const variance = counted - led.native;
                return (
                  <Fragment key={w.id}>
                    {showGroupHeader && (
                      <tr className="bg-muted/60 border-t-2 border-border">
                        <td
                          colSpan={9}
                          className="px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground"
                        >
                          {walletGroupLabel(grp)}
                        </td>
                      </tr>
                    )}
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
              {!visibleWallets.length && (
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
            <SelectTrigger className="h-9 w-[140px]">
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="in">IN</SelectItem>
              <SelectItem value="out">OUT</SelectItem>
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
          <Select value={txLimit} onValueChange={setTxLimit}>
            <SelectTrigger className="h-9 w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="10">Last 10</SelectItem>
              <SelectItem value="50">Last 50</SelectItem>
              <SelectItem value="100">Last 100</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>

        </div>

        <div className="rounded-md border border-border overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted text-xs uppercase">
              <tr>
                <th className="px-3 py-2 text-left w-[110px]">Date</th>
                <th className="px-3 py-2 text-left">Wallet</th>
                <th className="px-3 py-2 text-center w-[70px]">Dir</th>
                <th className="px-3 py-2 text-right w-[130px]">Amount</th>
                <th className="px-3 py-2 text-right w-[130px]">TZS</th>
                <th className="px-3 py-2 text-left">Note</th>
              </tr>
            </thead>
            <tbody>
              {txRows.map((r: any) => {
                // Direction comes from the kind — expenses are stored as positive amounts.
                const kind = String(r.kind || "");
                const isIn = walletTxIsIn(r);
                const adj = isWalletAdjustment(kind);
                return (
                  <tr key={r.id} className="border-t border-border hover:bg-muted/40">
                    <td className="px-3 py-1.5 font-mono text-xs whitespace-nowrap">
                      {fmtDateOnly(r.business_date)}
                      {!r.posted_at && (
                        <span
                          className="ml-1.5 rounded border border-warning/40 px-1 py-0.5 text-[9px] tracking-wider text-warning"
                          title="Posts to the wallet balance when the business day is closed"
                        >
                          PENDING
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-1.5">
                      {r.fin_wallets?.name || "—"}
                      {adj && (
                        <span
                          className="ml-1.5 rounded border border-border px-1 py-0.5 text-[9px] uppercase tracking-wider text-muted-foreground"
                          title="Manual balance adjustment — not counted as income or expense"
                        >
                          Adj
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-center" title={kind.replace(/_/g, " ")}>
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
                  <td colSpan={6} className="text-center text-muted-foreground py-6">
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
          <FormField span={3} label="Group">
            <Select
              value={groupOfWallet(walletForm)}
              onValueChange={(v) => {
                const g = v as WalletGroup;
                const kinds = WALLET_GROUP_KINDS[g] || [];
                setWalletForm({
                  ...walletForm,
                  wallet_group: g,
                  is_legacy: g === "legacy_other",
                  kind: kinds.includes(walletForm.kind) ? walletForm.kind : kinds[0] || walletForm.kind,
                });
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WALLET_GROUPS.map((g) => (
                  <SelectItem key={g} value={g}>
                    {walletGroupLabel(g)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField span={3} label="Type">
            <Select
              value={walletForm.kind}
              onValueChange={(v) => setWalletForm({ ...walletForm, kind: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from(
                  new Set([
                    ...(WALLET_GROUP_KINDS[groupOfWallet(walletForm)] || []),
                    ...(walletForm.kind ? [walletForm.kind] : []),
                  ]),
                ).map((k) => (
                  <SelectItem key={k} value={k}>
                    {String(k).replace(/_/g, " ")}
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
          <FormField span={3} label="Sort order">
            <NumberInput
              value={walletForm.sort_order ?? 0}
              onValueChange={(v) =>
                setWalletForm({ ...walletForm, sort_order: v ?? 0 })
              }
            />
          </FormField>
          <FormField span={3} label="Canonical code">
            <Input
              value={walletForm.canonical_code || ""}
              onChange={(e) => setWalletForm({ ...walletForm, canonical_code: e.target.value })}
              placeholder="e.g. CASH_TZS"
            />
          </FormField>
          <FormField span={3} label="Provider ref">
            <Input
              value={walletForm.provider_account_ref || ""}
              onChange={(e) =>
                setWalletForm({ ...walletForm, provider_account_ref: e.target.value })
              }
              placeholder="Optional"
            />
          </FormField>
          <FormField span={3} label="Active">
            <Select
              value={walletForm.is_active === false ? "no" : "yes"}
              onValueChange={(v) => setWalletForm({ ...walletForm, is_active: v === "yes" })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="yes">Active</SelectItem>
                <SelectItem value="no">Inactive</SelectItem>
              </SelectContent>
            </Select>
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

      {canCloseMonth && (
        <ResponsiveDialog
          open={floatOpen}
          onOpenChange={setFloatOpen}
          title="Adjust Basic Float"
          description="Signed adjustment. Cash is posted to the selected wallet."
        >
          <div className="space-y-3">
            <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-[13px] flex items-center justify-between">
              <span className="text-muted-foreground">Current → Resulting</span>
              <span className="font-mono tabular-nums">
                {formatNumberSpaces(floatCurrent)} →{" "}
                <b className={cls(floatCurrent + (floatDir === "decrease" ? -floatAmt : floatAmt))}>
                  {formatNumberSpaces(floatCurrent + (floatDir === "decrease" ? -floatAmt : floatAmt))}
                </b>
              </span>
            </div>
            <FormGrid>
              <FormField label="Direction">
                <Select value={floatDir} onValueChange={(v) => setFloatDir(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="increase">Increase (+)</SelectItem>
                    <SelectItem value="decrease">Decrease (−)</SelectItem>
                  </SelectContent>
                </Select>
              </FormField>
              <FormField label="Amount (TZS)">
                <NumberInput value={floatAmt} onValueChange={setFloatAmt} />
              </FormField>
              <FormField label="Wallet">
                <Select value={floatWallet} onValueChange={setFloatWallet}>
                  <SelectTrigger><SelectValue placeholder="Select wallet" /></SelectTrigger>
                  <SelectContent>
                    {wallets.map((w: any) => (
                      <SelectItem key={w.id} value={w.id}>
                        {w.name} · {w.currency}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
              <FormField label="Note">
                <Input value={floatNote} onChange={(e) => setFloatNote(e.target.value)} />
              </FormField>
            </FormGrid>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setFloatOpen(false)}>Cancel</Button>
              <Button
                disabled={!activeCasinoId || !floatWallet || !floatAmt || adjustFloat.isPending}
                onClick={async () => {
                  await adjustFloat.mutateAsync({
                    casino_id: activeCasinoId as string,
                    wallet_id: floatWallet,
                    amount: floatDir === "decrease" ? -floatAmt : floatAmt,
                    note: floatNote || undefined,
                  });
                  setFloatOpen(false);
                  setFloatAmt(0);
                  setFloatNote("");
                }}
              >
                Apply
              </Button>
            </div>
          </div>
        </ResponsiveDialog>
      )}

      {canCloseMonth && (
        <CloseMonthWizard
          open={closeOpen}
          onOpenChange={setCloseOpen}
          wallets={(snap?.wallets || []) as any}
          usdTzs={usdRate}
          casinoId={activeCasinoId}
          year={ym.year}
          month={ym.month}
          status={monthClosed ? "closed" : "open"}
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
