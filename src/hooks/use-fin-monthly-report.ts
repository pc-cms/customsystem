/**
 * Monthly Finance Report hook — aggregates plan vs actual per category,
 * with drill-down expense rows. Supports per-casino + network (premier only).
 */
import { useQuery } from "@tanstack/react-query";
import { liveQueryOptions, liveQueryOptionsWithFallback } from "@/lib/live-query-options";
import { supabase } from "@/integrations/supabase/client";
import { useCasino } from "@/lib/casino-context";
import {
  COMMISSION_SOURCES,
  TIPS_BONUS_SOURCES,
  MOVEMENT_SOURCES,
  FLOAT_SOURCES,
} from "@/hooks/use-other-incomes";
import {
  fetchMonthFinance,
  mergeMonthFinance,
  type MonthFinance,
} from "@/hooks/use-fin-month-finance";
import {
  cashPosition as calcCashPosition,
  deposits as calcDeposits,
  expectedProfit as calcExpectedProfit,
  forecastCostBase,
  managerBonusForecast,
} from "@/lib/finance-formulas";


const GROUP_ORDER = ["fixed", "tax", "variable", "salary", "petrol", "additional"] as const;
const COLLECTIONS_GROUP = "collections";

export type ReportExpense = {
  id: string;
  business_date: string;
  description: string | null;
  amount: number;
  currency: string;
  amount_tzs: number;
  wallet_id: string | null;
  wallet_name: string | null;
  fin_category_id: string | null;
  player_id: string | null;
  player_name: string | null;
  source: string | null;
  casino_id: string;
  casino_slug: string | null;
  voided_at: string | null;
};

export type ReportCategory = {
  id: string;
  name: string;
  sort_order: number;
  is_income: boolean;
  plan_year_tzs: number;
  plan_year_usd: number;
  plan_month_tzs: number;
  plan_month_usd: number;
  /** plan_month_tzs + plan_month_usd × avg USD→TZS rate. */
  plan_month_grand_tzs: number;
  /** Σ amount where currency='TZS' — native TZS spend, no conversion. */
  actual_tzs: number;
  /** Σ amount where currency='USD' — native USD spend, no conversion. */
  actual_usd: number;
  /** Σ amount_tzs across all currencies — for grand totals in TZS. */
  actual_grand_tzs: number;
  /** Plan/Month − Actual (centralized so UI + Excel agree). */
  remain_tzs: number;
  remain_usd: number;
  remain_grand_tzs: number;
  expenses: ReportExpense[];
  per_casino?: Record<string, { actual_tzs: number; actual_usd: number; actual_grand_tzs: number }>;
};

export type ReportGroup = {
  code: string;
  name: string;
  categories: ReportCategory[];
  totals: {
    plan_year_tzs: number;
    plan_year_usd: number;
    plan_month_tzs: number;
    plan_month_usd: number;
    plan_month_grand_tzs: number;
    actual_tzs: number;
    actual_usd: number;
    actual_grand_tzs: number;
    remain_tzs: number;
    remain_usd: number;
    remain_grand_tzs: number;
  };
};

/** Recompute a group's totals from its category list (used when splitting). */
const sumCategoryTotals = (list: ReportCategory[]): ReportGroup["totals"] => {
  const t = list.reduce(
    (s, c) => ({
      plan_year_tzs: s.plan_year_tzs + c.plan_year_tzs,
      plan_year_usd: s.plan_year_usd + c.plan_year_usd,
      plan_month_tzs: s.plan_month_tzs + c.plan_month_tzs,
      plan_month_usd: s.plan_month_usd + c.plan_month_usd,
      plan_month_grand_tzs: s.plan_month_grand_tzs + c.plan_month_grand_tzs,
      actual_tzs: s.actual_tzs + c.actual_tzs,
      actual_usd: s.actual_usd + c.actual_usd,
      actual_grand_tzs: s.actual_grand_tzs + c.actual_grand_tzs,
      remain_tzs: 0,
      remain_usd: 0,
      remain_grand_tzs: 0,
    }),
    { plan_year_tzs: 0, plan_year_usd: 0, plan_month_tzs: 0, plan_month_usd: 0, plan_month_grand_tzs: 0, actual_tzs: 0, actual_usd: 0, actual_grand_tzs: 0, remain_tzs: 0, remain_usd: 0, remain_grand_tzs: 0 },
  );
  t.remain_tzs = t.plan_month_tzs - t.actual_tzs;
  t.remain_usd = t.plan_month_usd - t.actual_usd;
  t.remain_grand_tzs = t.plan_month_grand_tzs - t.actual_grand_tzs;
  return t;
};

export type MonthlyReport = {
  incomes: {
    /** Table Result — Σ per-table closing win (closed days). Alias of `table_result`. */
    live_game: number;
    /** Slot Result — Cashdesk Win − Δ client balances (closed days). Alias of `slot_result`. */
    slots: number;
    table_result: number;
    slot_result: number;
    /** Bar Income — paid POS revenue (cash / card), comps excluded. */
    bar_income: number;
    /** Commissions split (all signed). */
    commission: number;
    agent_commission: number;
    fee: number;
    /** Σ commission + agent_commission + fee (+ legacy `other`). Alias `other`. */
    commissions: number;
    other: number;
    /** Reference rows — NOT part of Total, shown so the page reconciles with Wallets. */
    tips_bonus: number;
    movements: number;
    investment: number;
    office: number;
    add_float: number;
    jp: number;
    total: number;
  };
  /** Cash adjustments & obligations — never income, never accounting profit. */
  cash: {
    basic_float_opening: number;
    basic_float_add: number;
    basic_float_current: number;
    /** Signed Card Balance adjustment (already normalized by the RPC). */
    card_balance: number;
    /** Signed Miss Chips adjustment (already normalized by the RPC). */
    miss_chips: number;
    miss_cards: number;
    /** Signed cash effect of intercompany transfers (− out, + in). */
    intercompany_cash: number;
    intercompany_liability: number;
    intercompany_receivable: number;
    expenses_actual: number;
    collections_actual: number;
    /** Closing outstanding liabilities (manual + repayable intercompany). */
    liabilities: number;
    /** Σ Unplanned Expenses of the month (paid + unpaid). */
    unplanned_expenses: number;
    unplanned_paid: number;
    /** Unplanned NOT represented inside Actual Expenses — the CLOSED-month deduction. */
    unplanned_not_in_actual: number;
    unplanned_unpaid: number;
    /** Actual liability repayments posted in the month (cash out). */
    liability_payments: number;
    /** Deposits = Tips & Bonuses + JP + Card Balance + Miss Chips + Miss Cards (signed). */
    deposits: number;
    available_for_collection: number;
    /** Individual investment movements of the month (for the expandable section). */
    investment_items: Array<{ id: string; business_date: string; label: string; amount_tzs: number }>;
  };
  /** Month status + the full server-side finance block (single source of truth). */
  month: MonthFinance | null;
  kpi: {
    total_income: number;
    expected_profit: number;
    cash_position: number;
    manager_bonus: number;
  };

  groups: ReportGroup[];
  /** Collections & Owner Withdrawals — rendered separately, excluded from grand. */
  collections: ReportGroup | null;
  /** CAPEX — its own block, excluded from Collections and from grand. */
  capex: ReportGroup | null;
  grand: {
    plan_month_tzs: number;
    plan_month_usd: number;
    plan_month_grand_tzs: number;
    actual_tzs: number;
    actual_usd: number;
    actual_grand_tzs: number;
    remain_tzs: number;
    remain_usd: number;
    remain_grand_tzs: number;
  };
  /** USD→TZS rate used for Grand TZS conversion (avg of period, or 0 if no rate set). */
  usd_rate: number;
};

type Args = {
  year: number;
  month: number; // 1..12
  ytd: boolean;
  /** null = use current casino; "network" = all casinos (premier only) */
  scope: string | "network";
};

const monthRangeISO = (year: number, month: number, ytd: boolean) => {
  // EAT business day starts 07:00 EAT = 04:00 UTC.
  const startMonth = ytd ? 1 : month;
  const start = `${year}-${String(startMonth).padStart(2, "0")}-01`;
  // End: first day of next month
  const nm = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 };
  const endExclusive = `${nm.y}-${String(nm.m).padStart(2, "0")}-01`;
  return { start, endExclusive, monthsCount: ytd ? month : 1 };
};

export const useMonthlyReport = ({ year, month, ytd, scope }: Args) => {
  const { activeCasinoId } = useCasino();
  const network = scope === "network";
  const casinoId = network ? null : (scope || activeCasinoId);

  return useQuery<MonthlyReport>({
    queryKey: ["fin-monthly-report", year, month, ytd, network ? "net" : casinoId],
    enabled: network || !!casinoId,
    queryFn: async () => {
      const { start, endExclusive, monthsCount } = monthRangeISO(year, month, ytd);

      // Parallel queries
      const catsQ = supabase.from("fin_categories").select("*").order("sort_order");
      let budgetQ = supabase.from("fin_budget").select("*").eq("year", year);
      if (!network && casinoId) budgetQ = budgetQ.eq("casino_id", casinoId);
      // Expenses — SAME rules as the Wallets balance snapshot:
      // approved, not voided, not a reversal, and either an Office entry or a
      // cage entry of an already CLOSED business day.
      let expQ = supabase
        .from("expenses")
        .select("id, business_date, description, amount, currency, amount_tzs, fin_category_id, wallet_id, player_id, player_name, source, casino_id, voided_at, approved, reversal_of, fin_wallets(name), casinos(slug)")
        .gte("business_date", start)
        .lt("business_date", endExclusive)
        .not("fin_category_id", "is", null)
        .is("voided_at", null)
        .is("reversal_of", null)
        .eq("approved", true)
        .limit(5000);
      if (!network && casinoId) expQ = expQ.eq("casino_id", casinoId);

      // Closed business days — needed to apply the same expense rule as Wallets.
      let closuresQ = supabase
        .from("business_day_closures")
        .select("casino_id, business_date")
        .gte("business_date", start)
        .lt("business_date", endExclusive);

      // Incomes from fin_day_closing — ONLY closed business days count as income.
      let dayClosingsQ = supabase
        .from("fin_day_closing")
        .select("tables_result, slots_result, casino_id, business_date")
        .gte("business_date", start)
        .lt("business_date", endExclusive);
      // Other Incomes — fetched in full and classified with the shared dictionary:
      //   Commissions (other/commission/agent_commission/fee) = real income
      //   Tips & Bonuses, JP, movements (investment/owner top-up) = reference only
      //   inter-casino transfers = registry, never here.
      let incomesQ = (supabase as any)
        .from("fin_other_incomes")
        .select("id, note, amount, fx_rate, currency, casino_id, business_date, reverses_id, reversed_by_id, source, fin_category_id")
        .gte("business_date", start)
        .lt("business_date", endExclusive)
        .is("reverses_id", null)
        .is("reversed_by_id", null);
      // USD→TZS rate for the period (correct column = rate_to_tzs, filtered to USD).
      let ratesQ = supabase
        .from("fin_daily_rates")
        .select("rate_to_tzs, business_date")
        .eq("currency", "USD")
        .gte("business_date", start)
        .lt("business_date", endExclusive);
      // Bar Income — paid POS revenue only (cash / card); comps are not income.
      let barQ = (supabase as any)
        .from("pos_orders")
        .select("total_tzs, business_date, casino_id, voided_at, pos_tabs(payment_mode)")
        .gte("business_date", start)
        .lt("business_date", endExclusive)
        .is("voided_at", null)
        .limit(20000);
      if (!network && casinoId) {
        dayClosingsQ = dayClosingsQ.eq("casino_id", casinoId);
        incomesQ = incomesQ.eq("casino_id", casinoId);
        ratesQ = ratesQ.eq("casino_id", casinoId);
        closuresQ = closuresQ.eq("casino_id", casinoId);
        barQ = barQ.eq("casino_id", casinoId);
      }

      // Cash adjustments (Basic Float, Miss Chips/Cards, Card Balance, intercompany)
      // reuse the SAME RPC as Wallets — no competing local logic.
      const periodEndInclusive = new Date(new Date(endExclusive + "T00:00:00Z").getTime() - 86400000)
        .toISOString()
        .slice(0, 10);
      const callSnap = (cid: string) =>
        (supabase as any).rpc("fin_balance_snapshot", {
          p_casino_id: cid,
          p_period_start: start,
          p_period_end: periodEndInclusive,
        });
      // Network scope aggregates the SAME per-casino snapshots (no local formulas).
      const snapQ: Promise<{ data: any }> = network
        ? (async () => {
            const { data: cs } = await (supabase as any).from("casinos").select("id").eq("is_active", true);
            const ids = ((cs || []) as any[]).map((c) => c.id);
            const parts = await Promise.all(ids.map((id) => callSnap(id)));
            const snaps = parts.map((r: any) => r?.data).filter(Boolean);
            if (!snaps.length) return { data: null };
            const num = (o: any, path: string[]) =>
              path.reduce((acc: any, k) => (acc == null ? acc : acc[k]), o);
            const sum = (path: string[]) =>
              snaps.reduce((t: number, sn: any) => t + Number(num(sn, path) || 0), 0);
            return {
              data: {
                basic_float: {
                  opening_tzs: sum(["basic_float", "opening_tzs"]),
                  add_tzs: sum(["basic_float", "add_tzs"]),
                  current_tzs: sum(["basic_float", "current_tzs"]),
                },
                intercompany: {
                  liability_tzs: sum(["intercompany", "liability_tzs"]),
                  receivable_tzs: sum(["intercompany", "receivable_tzs"]),
                },
                incomes: {
                  card_balance: sum(["incomes", "card_balance"]),
                  missed_chips: sum(["incomes", "missed_chips"]),
                  missed_cards: sum(["incomes", "missed_cards"]),
                  bar_income: sum(["incomes", "bar_income"]),
                },
                transfers_total: sum(["transfers_total"]),
              },
            };
          })()
        : casinoId
          ? callSnap(casinoId)
          : Promise.resolve({ data: null });

      // Month finance block (unplanned, liabilities, float, collections, KPIs)
      // — computed by `fin_month_finance` so the DB owns the formulas.
      const monthQ: Promise<MonthFinance | null> = network
        ? (async () => {
            const { data: cs } = await supabase.from("casinos").select("id");
            const ids = ((cs || []) as any[]).map((c) => c.id);
            const parts = await Promise.all(
              ids.map((id) => fetchMonthFinance(id, year, month).catch(() => null)),
            );
            const ok = parts.filter(Boolean) as MonthFinance[];
            return ok.length ? mergeMonthFinance(ok, year, month) : null;
          })()
        : casinoId
          ? fetchMonthFinance(casinoId, year, month).catch(() => null)
          : Promise.resolve(null);

      const [cats, budgets, expenses, dayClosings, incomes, rates, closures, bar, snapRes, monthFin] =
        await Promise.all([catsQ, budgetQ, expQ, dayClosingsQ, incomesQ, ratesQ, closuresQ, barQ, snapQ, monthQ]);
      if (cats.error) throw cats.error;
      if (budgets.error) throw budgets.error;
      if (expenses.error) throw expenses.error;
      const snap = ((snapRes as any)?.data || null) as any;
      const barIncome = ((bar as any)?.data || [])
        .filter((o: any) => ["cash", "card"].includes(String(o.pos_tabs?.payment_mode || "")))
        .reduce((s: number, o: any) => s + Number(o.total_tzs || 0), 0);


      const closedSet = new Set(
        ((closures as any)?.data || []).map((c: any) => `${c.casino_id}|${c.business_date}`),
      );

      // Only CLOSED business days propagate to official Table / Slot Result.
      const closedRows = (dayClosings.data || []).filter((r: any) =>
        closedSet.has(`${r.casino_id}|${r.business_date}`),
      );
      const liveGame = closedRows.reduce((s, r: any) => s + Number(r.tables_result || 0), 0);
      const slotsIncome = closedRows.reduce((s, r: any) => s + Number(r.slots_result || 0), 0);
      const rateList = ((rates as any)?.data || []).map((r: any) => Number(r.rate_to_tzs || 0)).filter((n: number) => n > 0);
      let avgUsdTzs = rateList.length ? rateList.reduce((s: number, n: number) => s + n, 0) / rateList.length : 0;
      // Fallback: if no USD rate was entered in the selected period, use the
      // most recent rate on/before the period end so USD budgets & expenses
      // still convert into Grand TZS (otherwise USD silently drops out of totals).
      if (avgUsdTzs === 0) {
        let fbQ = supabase
          .from("fin_daily_rates")
          .select("rate_to_tzs")
          .eq("currency", "USD")
          .lt("business_date", endExclusive)
          .gt("rate_to_tzs", 0)
          .order("business_date", { ascending: false })
          .limit(1);
        if (!network && casinoId) fbQ = fbQ.eq("casino_id", casinoId);
        const fb = await fbQ;
        const fbRate = Number((fb.data as any)?.[0]?.rate_to_tzs || 0);
        if (fbRate > 0) avgUsdTzs = fbRate;
        else {
          // Last resort: any casino's latest USD rate (network-wide).
          const fb2 = await supabase
            .from("fin_daily_rates")
            .select("rate_to_tzs")
            .eq("currency", "USD")
            .lt("business_date", endExclusive)
            .gt("rate_to_tzs", 0)
            .order("business_date", { ascending: false })
            .limit(1);
          const fb2Rate = Number((fb2.data as any)?.[0]?.rate_to_tzs || 0);
          if (fb2Rate > 0) avgUsdTzs = fb2Rate;
        }
      }
      const toTzs = (r: any) => {
        const amt = Number(r.amount || 0);
        const fx = Number(r.fx_rate || 0);
        if (fx > 0) return amt * fx;
        if (r.currency === "USD") return avgUsdTzs ? amt * avgUsdTzs : 0;
        return amt; // TZS
      };
      const sumSources = (list: string[]) =>
        ((incomes as any)?.data || [])
          .filter((r: any) => list.includes(String(r.source || "")))
          .reduce((s: number, r: any) => s + toTzs(r), 0);

      const other = sumSources(COMMISSION_SOURCES);
      const commission = sumSources(["commission", "other"]); // legacy `other` folds into Commission
      const agentCommission = sumSources(["agent_commission"]);
      const fee = sumSources(["fee"]); // `refund` is retired and never counted
      const tipsBonus = sumSources(TIPS_BONUS_SOURCES);
      const movements = sumSources(MOVEMENT_SOURCES);
      const investment = sumSources(["investment"]);
      // Detail rows behind the expandable "Investment" section.
      const investmentItems = ((incomes as any)?.data || [])
        .filter((r: any) => String(r.source || "") === "investment")
        .map((r: any) => ({
          id: String(r.id),
          business_date: String(r.business_date),
          label: String(r.note || "Investment"),
          amount_tzs: toTzs(r),
        }))
        .sort((a: any, b: any) => a.business_date.localeCompare(b.business_date));
      const office = sumSources(["office", "owner_topup"]);
      const addFloat = sumSources(FLOAT_SOURCES);
      const jp = sumSources(["jp"]);


      // Plan Year: if user entered only ONE month for (cat,currency), multiply by 12;
      // otherwise sum across entered months.
      // Plan Month = sum of selected month(s): single month, or 1..month for YTD.
      const planMap = new Map<string, { tzs: number; usd: number }>();
      // Per (catId, currency) → Map<month, amount>
      const planMonthly = new Map<string, { tzs: Map<number, number>; usd: Map<number, number> }>();
      const startMonth = ytd ? 1 : month;
      const endMonth = month;
      (budgets.data || []).forEach((b: any) => {
        const key = b.category_id;
        const pm = planMap.get(key) || { tzs: 0, usd: 0 };
        const isUsd = b.currency === "USD";
        const amt = Number(b.planned_amount || 0);
        if (b.month >= startMonth && b.month <= endMonth) {
          pm[isUsd ? "usd" : "tzs"] += amt;
        }
        planMap.set(key, pm);
        const pmonths = planMonthly.get(key) || { tzs: new Map(), usd: new Map() };
        if (amt > 0) {
          const m = pmonths[isUsd ? "usd" : "tzs"];
          m.set(b.month, (m.get(b.month) || 0) + amt);
        }
        planMonthly.set(key, pmonths);
      });
      const planYearFor = (catId: string): { tzs: number; usd: number } => {
        const e = planMonthly.get(catId);
        if (!e) return { tzs: 0, usd: 0 };
        const yearOf = (m: Map<number, number>) => {
          if (m.size === 0) return 0;
          if (m.size === 1) {
            const only = Array.from(m.values())[0];
            return only * 12;
          }
          return Array.from(m.values()).reduce((s, n) => s + n, 0);
        };
        return { tzs: yearOf(e.tzs), usd: yearOf(e.usd) };
      };

      // Index actuals per category.
      // `tzs` = native TZS spend, `usd` = native USD spend, `grand` = Σ amount_tzs.
      const actualMap = new Map<string, { tzs: number; usd: number; grand: number; perCasino: Record<string, { tzs: number; usd: number; grand: number }>; list: ReportExpense[] }>();
      (expenses.data || []).forEach((e: any) => {
        const cid = e.fin_category_id;
        if (!cid) return;
        // Same rule as Wallets: cage expenses count only once the day is closed.
        if (e.source !== "office" && !closedSet.has(`${e.casino_id}|${e.business_date}`)) return;
        const cur = actualMap.get(cid) || { tzs: 0, usd: 0, grand: 0, perCasino: {}, list: [] };
        const amt = Number(e.amount || 0);
        const amtTzs = Number(e.amount_tzs || 0);
        cur.grand += amtTzs;
        if (e.currency === "USD") cur.usd += amt;
        else if (!e.currency || e.currency === "TZS") cur.tzs += amt;
        const cKey = e.casino_id;
        cur.perCasino[cKey] = cur.perCasino[cKey] || { tzs: 0, usd: 0, grand: 0 };
        cur.perCasino[cKey].grand += amtTzs;
        if (e.currency === "USD") cur.perCasino[cKey].usd += amt;
        else if (!e.currency || e.currency === "TZS") cur.perCasino[cKey].tzs += amt;
        cur.list.push({
          id: e.id,
          business_date: e.business_date,
          description: e.description,
          amount: amt,
          currency: e.currency,
          amount_tzs: amtTzs,
          wallet_id: e.wallet_id ?? null,
          wallet_name: e.fin_wallets?.name ?? null,
          fin_category_id: e.fin_category_id ?? null,
          player_id: e.player_id ?? null,
          player_name: e.player_name ?? null,
          source: e.source ?? null,
          casino_id: e.casino_id,
          casino_slug: e.casinos?.slug ?? null,
          voided_at: e.voided_at,
        });
        actualMap.set(cid, cur);
      });

      // Build groups
      const byGroup = new Map<string, ReportCategory[]>();
      (cats.data || []).forEach((c: any) => {
        if (c.is_income) return; // incomes header handled separately
        if (!c.is_active) return;
        const a = actualMap.get(c.id) || { tzs: 0, usd: 0, grand: 0, perCasino: {}, list: [] };
        const py = planYearFor(c.id);
        const pm = planMap.get(c.id) || { tzs: 0, usd: 0 };
        const plan_month_grand_tzs = pm.tzs + (avgUsdTzs ? pm.usd * avgUsdTzs : 0);
        const cat: ReportCategory = {
          id: c.id,
          name: c.name,
          sort_order: c.sort_order,
          is_income: false,
          plan_year_tzs: py.tzs,
          plan_year_usd: py.usd,
          plan_month_tzs: pm.tzs,
          plan_month_usd: pm.usd,
          plan_month_grand_tzs,
          actual_tzs: a.tzs,
          actual_usd: a.usd,
          actual_grand_tzs: a.grand,
          remain_tzs: pm.tzs - a.tzs,
          remain_usd: pm.usd - a.usd,
          remain_grand_tzs: plan_month_grand_tzs - a.grand,
          expenses: a.list.sort((x, y) => x.business_date.localeCompare(y.business_date)),
          per_casino: a.perCasino as any,
        };
        const arr = byGroup.get(c.group_code) || [];
        arr.push(cat);
        byGroup.set(c.group_code, arr);
      });

      const buildGroup = (g: string): ReportGroup => {
        const list = (byGroup.get(g) || []).sort((a, b) => a.sort_order - b.sort_order);
        const first = (cats.data || []).find((c: any) => c.group_code === g);
        const totals = list.reduce(
          (s, c) => ({
            plan_year_tzs: s.plan_year_tzs + c.plan_year_tzs,
            plan_year_usd: s.plan_year_usd + c.plan_year_usd,
            plan_month_tzs: s.plan_month_tzs + c.plan_month_tzs,
            plan_month_usd: s.plan_month_usd + c.plan_month_usd,
            plan_month_grand_tzs: s.plan_month_grand_tzs + c.plan_month_grand_tzs,
            actual_tzs: s.actual_tzs + c.actual_tzs,
            actual_usd: s.actual_usd + c.actual_usd,
            actual_grand_tzs: s.actual_grand_tzs + c.actual_grand_tzs,
            remain_tzs: 0,
            remain_usd: 0,
            remain_grand_tzs: 0,
          }),
          { plan_year_tzs: 0, plan_year_usd: 0, plan_month_tzs: 0, plan_month_usd: 0, plan_month_grand_tzs: 0, actual_tzs: 0, actual_usd: 0, actual_grand_tzs: 0, remain_tzs: 0, remain_usd: 0, remain_grand_tzs: 0 },
        );
        totals.remain_tzs = totals.plan_month_tzs - totals.actual_tzs;
        totals.remain_usd = totals.plan_month_usd - totals.actual_usd;
        totals.remain_grand_tzs = totals.plan_month_grand_tzs - totals.actual_grand_tzs;
        return { code: g, name: first?.group_name || g, categories: list, totals };
      };

      const groups: ReportGroup[] = GROUP_ORDER.filter((g) => byGroup.has(g)).map(buildGroup);

      // Office → Collections tab entries (fin_other_incomes, source = "collection").
      // Signed: negative = cash collected (out of the wallet), positive = returned.
      // They are NOT income — they fold into the Collections categories so the
      // report breaks the group down per category (Collection / CAPEX / …).
      const collectionRows = ((incomes as any)?.data || []).filter(
        (r: any) => String(r.source || "") === "collection",
      );
      const collectionEntriesNet = -collectionRows.reduce((s: number, r: any) => s + toTzs(r), 0);

      let collections: ReportGroup | null =
        byGroup.has(COLLECTIONS_GROUP) || collectionRows.length > 0 ? buildGroup(COLLECTIONS_GROUP) : null;

      if (collections && collectionRows.length > 0) {
        const cats = [...collections.categories.map((c) => ({ ...c }))];
        const byId = new Map(cats.map((c) => [c.id, c]));
        const uncatId = "__collection_uncategorized__";
        collectionRows.forEach((r: any) => {
          const amt = -Number(r.amount || 0); // collected (negative entry) → positive collection
          const grandTzs = -toTzs(r);
          let cat = r.fin_category_id ? byId.get(String(r.fin_category_id)) : undefined;
          if (!cat) {
            cat = byId.get(uncatId);
            if (!cat) {
              cat = {
                id: uncatId,
                name: "Uncategorized",
                sort_order: 9999,
                is_income: false,
                plan_year_tzs: 0,
                plan_year_usd: 0,
                plan_month_tzs: 0,
                plan_month_usd: 0,
                plan_month_grand_tzs: 0,
                actual_tzs: 0,
                actual_usd: 0,
                actual_grand_tzs: 0,
                remain_tzs: 0,
                remain_usd: 0,
                remain_grand_tzs: 0,
                expenses: [],
              };
              cats.push(cat);
              byId.set(uncatId, cat);
            }
          }
          cat.actual_grand_tzs += grandTzs;
          if (r.currency === "USD") cat.actual_usd += amt;
          else cat.actual_tzs += amt;
          cat.remain_tzs = cat.plan_month_tzs - cat.actual_tzs;
          cat.remain_usd = cat.plan_month_usd - cat.actual_usd;
          cat.remain_grand_tzs = cat.plan_month_grand_tzs - cat.actual_grand_tzs;
        });
        cats.sort((a, b) => a.sort_order - b.sort_order);
        const totals = { ...collections.totals };
        totals.actual_grand_tzs = cats.reduce((s, c) => s + c.actual_grand_tzs, 0);
        totals.actual_tzs = cats.reduce((s, c) => s + c.actual_tzs, 0);
        totals.actual_usd = cats.reduce((s, c) => s + c.actual_usd, 0);
        totals.remain_tzs = totals.plan_month_tzs - totals.actual_tzs;
        totals.remain_usd = totals.plan_month_usd - totals.actual_usd;
        totals.remain_grand_tzs = totals.plan_month_grand_tzs - totals.actual_grand_tzs;
        collections = { ...collections, categories: cats, totals };
      }

      // CAPEX is a standalone category — pull it out of Collections into its
      // own block so owner withdrawals and capital expenditure never mix.
      let capex: ReportGroup | null = null;
      if (collections) {
        const isCapexCat = (c: ReportCategory) => c.name.trim().toUpperCase() === "CAPEX";
        const capexCats = collections.categories.filter(isCapexCat);
        if (capexCats.length > 0) {
          const restCats = collections.categories.filter((c) => !isCapexCat(c));
          capex = { code: "capex", name: "CAPEX", categories: capexCats, totals: sumCategoryTotals(capexCats) };
          collections = restCats.length > 0
            ? { ...collections, categories: restCats, totals: sumCategoryTotals(restCats) }
            : null;
        }
      }


      const grand = groups.reduce(
        (s, g) => ({
          plan_month_tzs: s.plan_month_tzs + g.totals.plan_month_tzs,
          plan_month_usd: s.plan_month_usd + g.totals.plan_month_usd,
          plan_month_grand_tzs: 0,
          actual_tzs: s.actual_tzs + g.totals.actual_tzs,
          actual_usd: s.actual_usd + g.totals.actual_usd,
          actual_grand_tzs: s.actual_grand_tzs + g.totals.actual_grand_tzs,
          remain_tzs: 0,
          remain_usd: 0,
          remain_grand_tzs: 0,
        }),
        { plan_month_tzs: 0, plan_month_usd: 0, plan_month_grand_tzs: 0, actual_tzs: 0, actual_usd: 0, actual_grand_tzs: 0, remain_tzs: 0, remain_usd: 0, remain_grand_tzs: 0 },
      );
      grand.plan_month_grand_tzs = grand.plan_month_tzs + (avgUsdTzs ? grand.plan_month_usd * avgUsdTzs : 0);
      grand.remain_tzs = grand.plan_month_tzs - grand.actual_tzs;
      grand.remain_usd = grand.plan_month_usd - grand.actual_usd;
      grand.remain_grand_tzs = grand.plan_month_grand_tzs - grand.actual_grand_tzs;

      // ── Cash adjustments & obligations (single source: fin_balance_snapshot) ──
      const bf = snap?.basic_float || null;
      const floatOpening = Number(bf?.opening_tzs || 0);
      const floatAdd = Number(bf?.add_tzs ?? addFloat);
      const floatCurrent = Number(bf?.current_tzs ?? floatOpening + floatAdd);
      const cardBalance = Number(snap?.incomes?.card_balance || 0);
      const missChips = Number(snap?.incomes?.missed_chips || 0);
      const missCards = Number(snap?.incomes?.missed_cards || 0);
      // RPC `transfers_total` is signed as "money that LEFT this casino",
      // so the cash effect is its negation.
      const intercompanyCash = -Number(snap?.transfers_total || 0);
      const icLiability = Number(snap?.intercompany?.liability_tzs || 0);
      const icReceivable = Number(snap?.intercompany?.receivable_tzs || 0);
      const expensesActual = grand.actual_grand_tzs;
      // Collections tab entries are already folded into the group categories
      // above; CAPEX keeps the same cash/profit effect, just reported apart.
      const collectionsActual =
        collections || capex
          ? (collections?.totals.actual_grand_tzs || 0) + (capex?.totals.actual_grand_tzs || 0)
          : collectionEntriesNet;
      // Obligations come from the DB: closing outstanding liabilities and the
      // Unplanned Expenses ledger (boss_report_extras). No zero adapters.
      const mf = monthFin;
      const liabilities = Number(mf?.liabilities?.closing_tzs || 0);
      const liabilityPayments = Number(mf?.liability_payments_cash ?? mf?.liabilities?.repaid_tzs ?? 0);
      const unplanned = Number(mf?.unplanned?.total || 0);
      const unplannedPaid = Number(mf?.unplanned?.paid || 0);
      const unplannedUnpaid = Number(mf?.unplanned?.unpaid || 0);
      const unplannedPaidCash = Number(mf?.unplanned?.paid_cash_effect || 0);
      const unplannedNotInActual = Number(mf?.unplanned?.not_in_actual ?? unplanned);

      const commissionsTotal = other;
      const totalIncome = liveGame + slotsIncome + barIncome + commissionsTotal;
      const budget = grand.plan_month_grand_tzs;
      const isClosed = mf?.status === "closed";
      /** Deposits — cage money owed to third parties (subtracted once from Cash Position). */
      const depositsTotal = calcDeposits({
        tipsBonus,
        jp,
        cardBalance,
        missChips,
        missCards,
      });
      // OPEN: Total Income − Budget − Unplanned − Liabilities − Collections.
      // CLOSED: frozen Final Profit from the RPC snapshot (collections never rewrite it).
      const expectedProfit = mf
        ? Number(mf.profit || 0)
        : calcExpectedProfit(
            totalIncome,
            forecastCostBase({ budget, unplannedTotal: unplanned, liabilitiesClosing: liabilities }),
            collectionsActual,
          );
      const cashPosition = mf
        ? Number(mf.cash_position || 0)
        : calcCashPosition({
            floatCurrent,
            totalIncome,
            investment,
            office,
            intercompanyCash,
            expensesActual,
            unplannedPaidCashNotInActual: unplannedPaidCash,
            liabilityPayments,
            collections: collectionsActual,
          });
      const managerBonus = mf
        ? Number(mf.manager_bonus || 0)
        : managerBonusForecast({ totalIncome, budget });
      const availableForCollection = mf
        ? Number(mf.available_for_collection || 0)
        : Math.max(0, expectedProfit);
      void isClosed;



      return {
        incomes: {
          live_game: liveGame,
          slots: slotsIncome,
          table_result: liveGame,
          slot_result: slotsIncome,
          bar_income: barIncome,
          commission,
          agent_commission: agentCommission,
          fee,
          commissions: commissionsTotal,
          other,
          tips_bonus: tipsBonus,
          movements,
          investment,
          office,
          add_float: floatAdd,
          jp,
          total: totalIncome,
        },
        cash: {
          basic_float_opening: floatOpening,
          basic_float_add: floatAdd,
          basic_float_current: floatCurrent,
          card_balance: cardBalance,
          miss_chips: missChips,
          miss_cards: missCards,
          intercompany_cash: intercompanyCash,
          intercompany_liability: icLiability,
          intercompany_receivable: icReceivable,
          expenses_actual: mf ? Number(mf.expenses_actual || 0) : expensesActual,
          collections_actual: mf ? Number(mf.collections || 0) : collectionsActual,
          liabilities,
          unplanned_expenses: unplanned,
          unplanned_paid: unplannedPaid,
          unplanned_not_in_actual: unplannedNotInActual,
          unplanned_unpaid: unplannedUnpaid,
          liability_payments: liabilityPayments,
          deposits: depositsTotal,
          available_for_collection: availableForCollection,
          investment_items: investmentItems,
        },
        month: mf,
        kpi: {
          total_income: totalIncome,
          expected_profit: expectedProfit,
          cash_position: cashPosition,
          manager_bonus: managerBonus,
        },

        groups,
        collections,
        capex,
        grand,
        usd_rate: avgUsdTzs,
      };
    },
    ...liveQueryOptionsWithFallback(60000),
  });
};

