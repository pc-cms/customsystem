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
  wallet_name: string | null;
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
  actual_tzs: number;
  actual_usd: number;
  expenses: ReportExpense[];
  per_casino?: Record<string, { actual_tzs: number; actual_usd: number }>;
};

export type ReportGroup = {
  code: string;
  name: string;
  categories: ReportCategory[];
  totals: { plan_year_tzs: number; plan_year_usd: number; plan_month_tzs: number; plan_month_usd: number; actual_tzs: number; actual_usd: number };
};

export type MonthlyReport = {
  incomes: { live_game: number; slots: number; other: number; total: number };
  groups: ReportGroup[];
  grand: { plan_month_tzs: number; plan_month_usd: number; actual_tzs: number; actual_usd: number };
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
        .select("id, business_date, description, amount, currency, amount_tzs, fin_category_id, casino_id, voided_at, fin_wallets(name), casinos(slug)")
        .gte("business_date", start)
        .lt("business_date", endExclusive)
        .not("fin_category_id", "is", null)
        .is("voided_at", null)
        .limit(5000);
      if (!network && casinoId) expQ = expQ.eq("casino_id", casinoId);

      // Incomes from shifts + cage_slots_shifts
      const startUtc = `${start}T04:00:00.000Z`;
      const endUtc = `${endExclusive}T04:00:00.000Z`;
      let shiftsQ = supabase.from("shifts").select("tables_result, casino_id").gte("opened_at", startUtc).lt("opened_at", endUtc);
      let slotsQ = supabase.from("cage_slots_shifts").select("system_shift_result, casino_id").gte("opened_at", startUtc).lt("opened_at", endUtc);
      // Other Incomes — dedicated fin_incomes table (replaces legacy expenses.is_income hack).
      const startMonth = ytd ? 1 : month;
      let incomesQ = (supabase as any)
        .from("fin_incomes")
        .select("fin_category_id, month, currency, amount, casino_id")
        .eq("year", year)
        .gte("month", startMonth)
        .lte("month", month);
      // Avg USD→TZS rate for the period (for USD income conversion)
      let ratesQ = supabase
        .from("fin_daily_rates")
        .select("usd_to_tzs, business_date")
        .gte("business_date", start)
        .lt("business_date", endExclusive);
      if (!network && casinoId) {
        shiftsQ = shiftsQ.eq("casino_id", casinoId);
        slotsQ = slotsQ.eq("casino_id", casinoId);
        incomesQ = incomesQ.eq("casino_id", casinoId);
        ratesQ = ratesQ.eq("casino_id", casinoId);
      }

      const [cats, budgets, expenses, shifts, slots, incomes, rates] = await Promise.all([catsQ, budgetQ, expQ, shiftsQ, slotsQ, incomesQ, ratesQ]);
      if (cats.error) throw cats.error;
      if (budgets.error) throw budgets.error;
      if (expenses.error) throw expenses.error;

      const liveGame = (shifts.data || []).reduce((s, r: any) => s + Number(r.tables_result || 0), 0);
      const slotsIncome = (slots.data || []).reduce((s, r: any) => s + Number(r.system_shift_result || 0), 0);
      const rateList = ((rates as any)?.data || []).map((r: any) => Number(r.usd_to_tzs || 0)).filter((n: number) => n > 0);
      const avgUsdTzs = rateList.length ? rateList.reduce((s: number, n: number) => s + n, 0) / rateList.length : 0;
      const other = ((incomes as any)?.data || []).reduce((s: number, r: any) => {
        const amt = Number(r.amount || 0);
        if (r.currency === "USD") return s + (avgUsdTzs ? amt * avgUsdTzs : 0);
        return s + amt; // TZS
      }, 0);

      // Plan Year = sum of all 12 months per category.
      // Plan Month = sum of selected month(s): single month, or 1..month for YTD.
      const planMap = new Map<string, { tzs: number; usd: number }>();
      const planYearMap = new Map<string, { tzs: number; usd: number }>();
      const endMonth = month;
      (budgets.data || []).forEach((b: any) => {
        const key = b.category_id;
        const py = planYearMap.get(key) || { tzs: 0, usd: 0 };
        const pm = planMap.get(key) || { tzs: 0, usd: 0 };
        const isUsd = b.currency === "USD";
        const amt = Number(b.planned_amount || 0);
        py[isUsd ? "usd" : "tzs"] += amt;
        if (b.month >= startMonth && b.month <= endMonth) {
          pm[isUsd ? "usd" : "tzs"] += amt;
        }
        planYearMap.set(key, py);
        planMap.set(key, pm);
      });

      // Index actuals per category
      const actualMap = new Map<string, { tzs: number; usd: number; perCasino: Record<string, { tzs: number; usd: number }>; list: ReportExpense[] }>();
      (expenses.data || []).forEach((e: any) => {
        const cid = e.fin_category_id;
        if (!cid) return;
        const cur = actualMap.get(cid) || { tzs: 0, usd: 0, perCasino: {}, list: [] };
        cur.tzs += Number(e.amount_tzs || 0);
        if (e.currency === "USD") cur.usd += Number(e.amount || 0);
        const cKey = e.casino_id;
        cur.perCasino[cKey] = cur.perCasino[cKey] || { tzs: 0, usd: 0 };
        cur.perCasino[cKey].tzs += Number(e.amount_tzs || 0);
        if (e.currency === "USD") cur.perCasino[cKey].usd += Number(e.amount || 0);
        cur.list.push({
          id: e.id,
          business_date: e.business_date,
          description: e.description,
          amount: Number(e.amount || 0),
          currency: e.currency,
          amount_tzs: Number(e.amount_tzs || 0),
          wallet_name: e.fin_wallets?.name ?? null,
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
        const a = actualMap.get(c.id) || { tzs: 0, usd: 0, perCasino: {}, list: [] };
        const py = planYearMap.get(c.id) || { tzs: 0, usd: 0 };
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
          expenses: a.list.sort((x, y) => x.business_date.localeCompare(y.business_date)),
          per_casino: a.perCasino as any,
        };
        const arr = byGroup.get(c.group_code) || [];
        arr.push(cat);
        byGroup.set(c.group_code, arr);
      });

      const groups: ReportGroup[] = GROUP_ORDER.filter((g) => byGroup.has(g)).map((g) => {
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
          }),
          { plan_year_tzs: 0, plan_year_usd: 0, plan_month_tzs: 0, plan_month_usd: 0, actual_tzs: 0, actual_usd: 0 },
        );
        return { code: g, name: first?.group_name || g, categories: list, totals };
      });

      const grand = groups.reduce(
        (s, g) => ({
          plan_month_tzs: s.plan_month_tzs + g.totals.plan_month_tzs,
          plan_month_usd: s.plan_month_usd + g.totals.plan_month_usd,
          actual_tzs: s.actual_tzs + g.totals.actual_tzs,
          actual_usd: s.actual_usd + g.totals.actual_usd,
        }),
        { plan_month_tzs: 0, plan_month_usd: 0, actual_tzs: 0, actual_usd: 0 },
      );

      return {
        incomes: { live_game: liveGame, slots: slotsIncome, other, total: liveGame + slotsIncome + other },
        groups,
        grand,
      };
    },
    staleTime: 60_000,
  });
};
