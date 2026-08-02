/**
 * useBossMonthlyReport — MTD financial rollup across selected casinos.
 * Mirrors the manager Excel report: per-casino totals + daily rows.
 *
 * Sources:
 *   - Result (Live+Slots):   fin_day_closing.tables_result + slots_result
 *   - Other incomes:         fin_other_incomes.amount * fx_rate (→ TZS)
 *   - Collection:            expenses.amount_tzs joined w/ fin_categories.group_code='collections'
 *   - Extra Expenses buckets by fin_categories.group_code (fixed/tax/salary/…)
 *   - Estimated Expenses:    fin_budget.planned_amount (TZS rows only)
 *   - SAFE snapshot:         Σ fin_wallet_tx.amount_tzs (kind-signed) per casino
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getBusinessDate } from "@/lib/business-day";

export type CasinoRef = { id: string; name: string; slug: string | null };

export type DailyRow = {
  date: string; // YYYY-MM-DD
  perCasino: Record<string, number>; // casino_id -> Live+Slots result
  jcResult: number;                  // sum across all
  collection: number;                // sum across all
  balance: number;                   // running (JC - Collection - proRata extras)
};

export type ExtraBucket = {
  key: string;   // group_code
  label: string;
  perCasino: Record<string, number>;
  total: number;
};

export type Summary = {
  estimated:  Record<string, number>; // per casino
  result:     Record<string, number>;
  tables:     Record<string, number>;
  /** Slots net of Players Card Balance (deposits on player cards). */
  slots:      Record<string, number>;
  /** Players Card Balance (latest entry of the month), always >= 0. */
  playersCards: Record<string, number>;
  other:      Record<string, number>;
  collection: Record<string, number>;
  extras:     ExtraBucket[];          // detailed by group_code (excl. collections + income)
  extrasTotal: Record<string, number>;
  bonus5:     Record<string, number>; // 5% of Result
  safe:       Record<string, number>;
  totals: {
    estimated: number; result: number; other: number; collection: number;
    tables: number; slots: number; playersCards: number;
    extras: number; bonus5: number; safe: number;
    expectedProfit: number; balance: number; total: number; dailyBalance: number;
  };
};


export type BossMonthlyReport = {
  summary: Summary;
  daily: DailyRow[];
  monthStart: string;
  today: string;
};

const monthStartDate = (todayStr: string): string => {
  const d = new Date(todayStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
};

const enumerateDays = (fromISO: string, toISO: string): string[] => {
  const out: string[] = [];
  const start = new Date(fromISO);
  const end = new Date(toISO);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
};

// Human labels for the group_code buckets shown as "Extra Expenses"
const GROUP_LABELS: Record<string, string> = {
  fixed:      "Fixed Costs & Licences",
  tax:        "Government Taxes",
  salary:     "Salary Expenses",
  variable:   "Variable Expenses",
  petrol:     "Petrol Expenses",
  additional: "Additional Expenses",
};
const GROUP_ORDER = ["fixed", "tax", "salary", "variable", "petrol", "additional"];

// kinds that reduce wallet balance
const NEG_KINDS = new Set(["expense", "change_out", "transfer_out"]);

export function useBossMonthlyReport(casinos: CasinoRef[], opts?: { year?: number; month?: number }) {
  const today = getBusinessDate();
  const now = new Date(today);
  const year = opts?.year ?? now.getFullYear();
  const month = opts?.month ?? (now.getMonth() + 1);
  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  // Last day of the selected month
  const lastDay = new Date(year, month, 0).getDate();
  const monthEnd = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  // If viewing current month → cap at today; otherwise use month end
  const isCurrentMonth = from.slice(0, 7) === today.slice(0, 7);
  const to = isCurrentMonth ? today : monthEnd;
  const ids = casinos.map(c => c.id).sort().join(",");

  return useQuery({
    queryKey: ["boss-monthly-report", ids, from, to],
    enabled: casinos.length > 0,
    refetchInterval: 30_000,
    staleTime: 15_000,
    queryFn: async (): Promise<BossMonthlyReport> => {

      const casinoIds = casinos.map(c => c.id);
      const zeroPer = (): Record<string, number> =>
        Object.fromEntries(casinoIds.map(id => [id, 0]));

      // fin_categories map (for grouping expenses)
      const { data: cats } = await supabase
        .from("fin_categories")
        .select("id, group_code, name, is_income");
      const catMap = new Map<string, { group: string; income: boolean }>();
      (cats || []).forEach((c: any) =>
        catMap.set(c.id, { group: c.group_code, income: c.is_income }));

      // Parallel fetches
      const [closingsRes, otherRes, expensesRes, budgetRes, walletTxRes, ratesRes] = await Promise.all([
        supabase.from("fin_day_closing")
          .select("casino_id, business_date, tables_result, slots_result, players_card_balance")
          .in("casino_id", casinoIds)
          .gte("business_date", from)
          .lte("business_date", to),
        supabase.from("fin_other_incomes")
          .select("casino_id, business_date, amount, fx_rate, reverses_id")
          .in("casino_id", casinoIds)
          .gte("business_date", from)
          .lte("business_date", to),
        supabase.from("expenses")
          .select("casino_id, business_date, amount_tzs, amount, currency, fin_category_id, approved")
          .in("casino_id", casinoIds)
          .gte("business_date", from)
          .lte("business_date", to),
        supabase.from("fin_budget")
          .select("casino_id, year, month, planned_amount, currency, category_id")
          .in("casino_id", casinoIds)
          .eq("year", Number(from.slice(0, 4)))
          .eq("month", Number(from.slice(5, 7))),
        supabase.from("fin_wallet_tx")
          .select("casino_id, amount_tzs, kind")
          .in("casino_id", casinoIds)
          .lte("business_date", to),
        supabase.from("cage_slots_exchange_rates")
          .select("casino_id, currency_code, rate_to_tzs, created_at")
          .in("casino_id", casinoIds)
          .order("created_at", { ascending: false }),
      ]);

      // Build per-casino latest FX map from Cage rates, with sensible fallbacks
      const FX_FALLBACK: Record<string, number> = { TZS: 1, USD: 2600, EUR: 2800, GBP: 3000, KES: 17 };
      const fxByCasino = new Map<string, Record<string, number>>();
      for (const r of (ratesRes.data || []) as any[]) {
        const m = fxByCasino.get(r.casino_id) || {};
        if (!m[r.currency_code]) m[r.currency_code] = Number(r.rate_to_tzs) || 0;
        fxByCasino.set(r.casino_id, m);
      }
      const fxRate = (casinoId: string, cur: string): number => {
        const c = (cur || "TZS").toUpperCase();
        if (c === "TZS") return 1;
        const m = fxByCasino.get(casinoId) || {};
        return m[c] || FX_FALLBACK[c] || 1;
      };

      // Result per casino + daily
      const result = zeroPer();
      const tables = zeroPer();
      const slotsRaw = zeroPer();
      // Players Card Balance is a balance (latest entry of the month), not a flow.
      const cardsLatestDate = new Map<string, string>();
      const playersCards = zeroPer();
      const dailyMap = new Map<string, DailyRow>();
      for (const d of enumerateDays(from, to)) {
        dailyMap.set(d, {
          date: d,
          perCasino: Object.fromEntries(casinoIds.map(id => [id, 0])),
          jcResult: 0, collection: 0, balance: 0,
        });
      }
      for (const r of (closingsRes.data || []) as any[]) {
        const v = Number(r.tables_result || 0) + Number(r.slots_result || 0);
        tables[r.casino_id] = (tables[r.casino_id] || 0) + Number(r.tables_result || 0);
        slotsRaw[r.casino_id] = (slotsRaw[r.casino_id] || 0) + Number(r.slots_result || 0);
        const cb = Math.abs(Number(r.players_card_balance || 0));
        if (cb > 0) {
          const prev = cardsLatestDate.get(r.casino_id);
          if (!prev || r.business_date > prev) {
            cardsLatestDate.set(r.casino_id, r.business_date);
            playersCards[r.casino_id] = cb;
          }
        }
        result[r.casino_id] = (result[r.casino_id] || 0) + v;
        const row = dailyMap.get(r.business_date);
        if (row) {
          row.perCasino[r.casino_id] = (row.perCasino[r.casino_id] || 0) + v;
          row.jcResult += v;
        }
      }
      // Net out player card deposits once per month: Result = Tables + (Slots − Cards)
      const slots = zeroPer();
      for (const id of casinoIds) {
        slots[id] = (slotsRaw[id] || 0) - (playersCards[id] || 0);
        result[id] = (result[id] || 0) - (playersCards[id] || 0);
      }


      // Other incomes
      const other = zeroPer();
      for (const r of (otherRes.data || []) as any[]) {
        if (r.reverses_id) continue;
        const v = Number(r.amount || 0) * Number(r.fx_rate || 1);
        other[r.casino_id] = (other[r.casino_id] || 0) + v;
      }

      // Expenses → collection + extras by group_code
      const collection = zeroPer();
      const extrasMap = new Map<string, Record<string, number>>();
      for (const r of (expensesRes.data || []) as any[]) {
        const amt = Number(r.amount_tzs ?? r.amount ?? 0);
        if (!amt) continue;
        const cat = r.fin_category_id ? catMap.get(r.fin_category_id) : undefined;
        const group = cat?.group || "additional";
        if (cat?.income) continue;
        if (group === "collections") {
          collection[r.casino_id] = (collection[r.casino_id] || 0) + amt;
          const row = dailyMap.get(r.business_date);
          if (row) row.collection += amt;
        } else if (group !== "income") {
          const key = GROUP_ORDER.includes(group) ? group : "additional";
          if (!extrasMap.has(key)) extrasMap.set(key, zeroPer());
          const bucket = extrasMap.get(key)!;
          bucket[r.casino_id] = (bucket[r.casino_id] || 0) + amt;
        }
      }

      // Estimated Expenses — convert non-TZS via latest Cage rates
      const estimated = zeroPer();
      for (const b of (budgetRes.data || []) as any[]) {
        const rate = fxRate(b.casino_id, b.currency || "TZS");
        estimated[b.casino_id] = (estimated[b.casino_id] || 0) + Number(b.planned_amount || 0) * rate;
      }

      // SAFE snapshot per casino
      const safe = zeroPer();
      for (const t of (walletTxRes.data || []) as any[]) {
        const raw = Number(t.amount_tzs || 0);
        const signed = NEG_KINDS.has(t.kind) ? -Math.abs(raw) : Math.abs(raw);
        safe[t.casino_id] = (safe[t.casino_id] || 0) + signed;
      }

      // Bonus 5% of (Result − Estimated Expenses); floor at 0
      const bonus5 = zeroPer();
      for (const id of casinoIds) {
        const base = (result[id] || 0) - (estimated[id] || 0);
        bonus5[id] = Math.max(0, base) * 0.05;
      }

      // Extras aggregate per casino
      const extrasTotal = zeroPer();
      const extras: ExtraBucket[] = GROUP_ORDER
        .filter(k => extrasMap.has(k))
        .map(k => {
          const per = extrasMap.get(k)!;
          const total = Object.values(per).reduce((a, b) => a + b, 0);
          for (const id of casinoIds) extrasTotal[id] = (extrasTotal[id] || 0) + (per[id] || 0);
          return { key: k, label: GROUP_LABELS[k] || k, perCasino: per, total };
        });
      // add bonus 5% as synthetic bucket
      const bonusTotal = Object.values(bonus5).reduce((a, b) => a + b, 0);
      if (bonusTotal > 0) {
        extras.push({ key: "bonus5", label: "Approx Bonus for Managers (5%)", perCasino: bonus5, total: bonusTotal });
        for (const id of casinoIds) extrasTotal[id] = (extrasTotal[id] || 0) + (bonus5[id] || 0);
      }

      // Totals
      const sumRec = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);
      const tEstimated = sumRec(estimated);
      const tResult = sumRec(result);
      const tOther = sumRec(other);
      const tCollection = sumRec(collection);
      const tExtras = sumRec(extrasTotal);
      const tBonus = sumRec(bonus5);
      const tSafe = sumRec(safe);
      const balance = tResult + tOther - tEstimated - tExtras - tCollection;
      const expectedProfit = tResult - tEstimated - tExtras - tCollection + tOther;
      const total = tSafe + balance;

      // Daily balance: monthly fixed costs (Estimated + Extras) are charged ONCE
      // on the first row of the period; each following day only adds the day's
      // result and subtracts the day's collection.
      const days = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));
      let running = -(tEstimated + tExtras);
      for (const d of days) {
        running += d.jcResult - d.collection;
        d.balance = running;
      }

      return {
        monthStart: from, today: isCurrentMonth ? today : monthEnd,

        summary: {
          estimated, result, tables, slots, playersCards, other, collection, extras, extrasTotal, bonus5, safe,
          totals: {
            estimated: tEstimated, result: tResult, other: tOther, collection: tCollection,
            tables: sumRec(tables), slots: sumRec(slots), playersCards: sumRec(playersCards),
            extras: tExtras, bonus5: tBonus, safe: tSafe,
            expectedProfit, balance, total,
            dailyBalance: days.length ? days[days.length - 1].balance : 0,
          },
        },
        daily: days,
      };
    },
  });
}
