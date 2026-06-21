/**
 * Monthly Finance Report hook — aggregates plan vs actual per category,
 * with drill-down expense rows. Supports per-casino + network (premier only).
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCasino } from "@/lib/casino-context";

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
  /** Σ amount where currency='TZS' — native TZS spend, no conversion. */
  actual_tzs: number;
  /** Σ amount where currency='USD' — native USD spend, no conversion. */
  actual_usd: number;
  /** Σ amount_tzs across all currencies — for grand totals in TZS. */
  actual_grand_tzs: number;
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
    actual_tzs: number;
    actual_usd: number;
    actual_grand_tzs: number;
  };
};

export type MonthlyReport = {
  incomes: { live_game: number; slots: number; other: number; total: number };
  groups: ReportGroup[];
  /** Collections & Owner Withdrawals — rendered separately, excluded from grand. */
  collections: ReportGroup | null;
  grand: {
    plan_month_tzs: number;
    plan_month_usd: number;
    plan_month_grand_tzs: number;
    actual_tzs: number;
    actual_usd: number;
    actual_grand_tzs: number;
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
      let expQ = supabase
        .from("expenses")
        .select("id, business_date, description, amount, currency, amount_tzs, fin_category_id, wallet_id, player_id, player_name, source, casino_id, voided_at, fin_wallets(name), casinos(slug)")
        .gte("business_date", start)
        .lt("business_date", endExclusive)
        .not("fin_category_id", "is", null)
        .is("voided_at", null)
        .limit(5000);
      if (!network && casinoId) expQ = expQ.eq("casino_id", casinoId);

      // Incomes from fin_day_closing — ONLY closed business days count as income.
      let dayClosingsQ = supabase
        .from("fin_day_closing")
        .select("tables_result, slots_result, casino_id, business_date")
        .gte("business_date", start)
        .lt("business_date", endExclusive);
      // Other Incomes — dedicated fin_incomes table (replaces legacy expenses.is_income hack).
      const startMonth = ytd ? 1 : month;
      let incomesQ = (supabase as any)
        .from("fin_incomes")
        .select("fin_category_id, month, currency, amount, casino_id")
        .eq("year", year)
        .gte("month", startMonth)
        .lte("month", month);
      // USD→TZS rate for the period (correct column = rate_to_tzs, filtered to USD).
      let ratesQ = supabase
        .from("fin_daily_rates")
        .select("rate_to_tzs, business_date")
        .eq("currency", "USD")
        .gte("business_date", start)
        .lt("business_date", endExclusive);
      if (!network && casinoId) {
        dayClosingsQ = dayClosingsQ.eq("casino_id", casinoId);
        incomesQ = incomesQ.eq("casino_id", casinoId);
        ratesQ = ratesQ.eq("casino_id", casinoId);
      }

      const [cats, budgets, expenses, dayClosings, incomes, rates] = await Promise.all([catsQ, budgetQ, expQ, dayClosingsQ, incomesQ, ratesQ]);
      if (cats.error) throw cats.error;
      if (budgets.error) throw budgets.error;
      if (expenses.error) throw expenses.error;

      const liveGame = (dayClosings.data || []).reduce((s, r: any) => s + Number(r.tables_result || 0), 0);
      const slotsIncome = (dayClosings.data || []).reduce((s, r: any) => s + Number(r.slots_result || 0), 0);
      const rateList = ((rates as any)?.data || []).map((r: any) => Number(r.rate_to_tzs || 0)).filter((n: number) => n > 0);
      const avgUsdTzs = rateList.length ? rateList.reduce((s: number, n: number) => s + n, 0) / rateList.length : 0;
      const other = ((incomes as any)?.data || []).reduce((s: number, r: any) => {
        const amt = Number(r.amount || 0);
        if (r.currency === "USD") return s + (avgUsdTzs ? amt * avgUsdTzs : 0);
        return s + amt; // TZS
      }, 0);

      // Plan Year: if user entered only ONE month for (cat,currency), multiply by 12;
      // otherwise sum across entered months.
      // Plan Month = sum of selected month(s): single month, or 1..month for YTD.
      const planMap = new Map<string, { tzs: number; usd: number }>();
      // Per (catId, currency) → Map<month, amount>
      const planMonthly = new Map<string, { tzs: Map<number, number>; usd: Map<number, number> }>();
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
        const cat: ReportCategory = {
          id: c.id,
          name: c.name,
          sort_order: c.sort_order,
          is_income: false,
          plan_year_tzs: py.tzs,
          plan_year_usd: py.usd,
          plan_month_tzs: pm.tzs,
          plan_month_usd: pm.usd,
          actual_tzs: a.tzs,
          actual_usd: a.usd,
          actual_grand_tzs: a.grand,
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
            actual_tzs: s.actual_tzs + c.actual_tzs,
            actual_usd: s.actual_usd + c.actual_usd,
            actual_grand_tzs: s.actual_grand_tzs + c.actual_grand_tzs,
          }),
          { plan_year_tzs: 0, plan_year_usd: 0, plan_month_tzs: 0, plan_month_usd: 0, actual_tzs: 0, actual_usd: 0, actual_grand_tzs: 0 },
        );
        return { code: g, name: first?.group_name || g, categories: list, totals };
      };

      const groups: ReportGroup[] = GROUP_ORDER.filter((g) => byGroup.has(g)).map(buildGroup);
      const collections: ReportGroup | null = byGroup.has(COLLECTIONS_GROUP) ? buildGroup(COLLECTIONS_GROUP) : null;

      const grand = groups.reduce(
        (s, g) => ({
          plan_month_tzs: s.plan_month_tzs + g.totals.plan_month_tzs,
          plan_month_usd: s.plan_month_usd + g.totals.plan_month_usd,
          plan_month_grand_tzs: 0,
          actual_tzs: s.actual_tzs + g.totals.actual_tzs,
          actual_usd: s.actual_usd + g.totals.actual_usd,
          actual_grand_tzs: s.actual_grand_tzs + g.totals.actual_grand_tzs,
        }),
        { plan_month_tzs: 0, plan_month_usd: 0, plan_month_grand_tzs: 0, actual_tzs: 0, actual_usd: 0, actual_grand_tzs: 0 },
      );
      grand.plan_month_grand_tzs = grand.plan_month_tzs + (avgUsdTzs ? grand.plan_month_usd * avgUsdTzs : 0);

      return {
        incomes: { live_game: liveGame, slots: slotsIncome, other, total: liveGame + slotsIncome + other },
        groups,
        collections,
        grand,
        usd_rate: avgUsdTzs,
      };
    },
    staleTime: 60_000,
  });
};

