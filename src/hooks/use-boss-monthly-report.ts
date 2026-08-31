/**
 * useBossMonthlyReport — monthly financial rollup across selected casinos.
 *
 * All aggregation happens server-side in the RPC `boss_monthly_report`.
 *
 * Sources:
 *   - Result (Live+Slots):   fin_day_closing.tables_result + slots_result,
 *                            CLOSED business days only (business_day_closures)
 *   - Slots:                 slots_result − players_card_balance (cash desk win minus money on the cards)
 *   - Players Card Balance:  kept in data but no longer shown as a separate Boss report row
 *   - Other incomes:         fin_other_incomes.amount * fx_rate (→ TZS)
 *   - Collection:            expenses in fin_categories.group_code = 'collections'
 *   - Estimated Expenses:    fin_budget.planned_amount converted with dated FX
 *   - Extra Expenses:        boss_report_extras (manual per casino / month)
 *   - Bonus 5%:              synthetic 5% of max(0, Result − Estimated Expenses)
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
  balance: number;                   // running (JC - Collection - fixed costs)
  closed: boolean;                   // whether any casino closed this business day
};

export type ExtraBucket = {
  key: string;
  label: string;
  perCasino: Record<string, number>;
  total: number;
  editable?: boolean;
};

export type Summary = {
  estimated:  Record<string, number>; // per casino
  result:     Record<string, number>;
  tables:     Record<string, number>;
  slots:      Record<string, number>;
  /** Players Card Balance (latest entry of the month), informational only. */
  playersCards: Record<string, number>;
  other:      Record<string, number>;
  collection: Record<string, number>;
  extras:     ExtraBucket[];          // manual extras + synthetic bonus5
  extrasTotal: Record<string, number>;
  bonus5:     Record<string, number>;
  totals: {
    estimated: number; result: number; other: number; collection: number;
    tables: number; slots: number; playersCards: number;
    extras: number; bonus5: number;
    expectedProfit: number; balance: number; total: number; dailyBalance: number;
    daysElapsed: number; daysInMonth: number; forecastResult: number;
  };
};

export type BossMonthlyReport = {
  summary: Summary;
  daily: DailyRow[];
  monthStart: string;
  today: string;
  year: number;
  month: number;
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

type RpcPayload = {
  from: string;
  to: string;
  closed_days: string[];
  closed_days_count: number;
  per_casino: Array<{
    casino_id: string; tables: number; slots: number; players_cards: number;
    other: number; collection: number; estimated: number;
  }>;
  daily: Array<{ date: string; casino_id: string; result: number }>;
  daily_collection: Array<{ date: string; collection: number }>;
  extras: Array<{ casino_id: string; label: string; amount: number; sort_order: number }>;
};

export function useBossMonthlyReport(casinos: CasinoRef[], opts?: { year?: number; month?: number }) {
  const today = getBusinessDate();
  const now = new Date(today);
  const year = opts?.year ?? now.getFullYear();
  const month = opts?.month ?? (now.getMonth() + 1);
  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const monthEnd = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  const isCurrentMonth = from.slice(0, 7) === today.slice(0, 7);
  const to = isCurrentMonth ? today : monthEnd;
  const ids = casinos.map(c => c.id).sort().join(",");

  return useQuery({
    queryKey: ["boss-monthly-report", ids, year, month],
    enabled: casinos.length > 0,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    staleTime: 30_000,
    // Fail fast instead of hanging on "Loading…" for minutes.
    retry: 1,
    retryDelay: 2_000,
    queryFn: async ({ signal }): Promise<BossMonthlyReport> => {
      const casinoIds = casinos.map(c => c.id);
      const zeroPer = (): Record<string, number> =>
        Object.fromEntries(casinoIds.map(id => [id, 0]));

      // Hard 25s ceiling — a stuck request aborts and surfaces the Retry UI.
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 25_000);
      signal?.addEventListener("abort", () => ctrl.abort());
      const { data, error } = await (supabase as any)
        .rpc("boss_monthly_report", { _casino_ids: casinoIds, _year: year, _month: month })
        .abortSignal(ctrl.signal)
        .then((r: any) => r, (e: any) => ({ data: null, error: e }))
        .finally(() => clearTimeout(timer));
      if (error) throw error;

      const payload = (data || {}) as RpcPayload;

      const estimated = zeroPer();
      const result = zeroPer();
      const tables = zeroPer();
      const slots = zeroPer();
      const playersCards = zeroPer();
      const other = zeroPer();
      const collection = zeroPer();

      for (const p of payload.per_casino || []) {
        const id = p.casino_id;
        tables[id] = Number(p.tables || 0);
        // CANON: Slot Result = Σ per closed day (CashDesk Win − Card Balance),
        // computed server-side. `players_cards` is the monthly sum, shown for
        // reference only — never subtracted again here.
        playersCards[id] = Number(p.players_cards || 0);
        slots[id] = Number(p.slots || 0);

        other[id] = Number(p.other || 0);
        collection[id] = Number(p.collection || 0);
        estimated[id] = Number(p.estimated || 0);
        result[id] = tables[id] + slots[id];
      }

      // Daily rows
      const closedDays = new Set<string>((payload.closed_days || []).map(String));
      const dailyMap = new Map<string, DailyRow>();
      for (const d of enumerateDays(from, to)) {
        dailyMap.set(d, {
          date: d,
          perCasino: zeroPer(),
          jcResult: 0,
          collection: 0,
          balance: 0,
          closed: closedDays.has(d),
        });
      }
      for (const r of payload.daily || []) {
        const row = dailyMap.get(String(r.date));
        if (!row) continue;
        const v = Number(r.result || 0);
        row.perCasino[r.casino_id] = (row.perCasino[r.casino_id] || 0) + v;
        row.jcResult += v;
      }
      for (const r of payload.daily_collection || []) {
        const row = dailyMap.get(String(r.date));
        if (row) row.collection += Number(r.collection || 0);
      }

      // Manual extras grouped by label
      const labelMap = new Map<string, Record<string, number>>();
      for (const r of payload.extras || []) {
        const label = r.label || "Extra";
        if (!labelMap.has(label)) labelMap.set(label, zeroPer());
        const bucket = labelMap.get(label)!;
        bucket[r.casino_id] = (bucket[r.casino_id] || 0) + Number(r.amount || 0);
      }

      // Bonus 5% of (Result − Estimated Expenses); floor at 0
      const bonus5 = zeroPer();
      for (const id of casinoIds) {
        bonus5[id] = Math.max(0, (result[id] || 0) - (estimated[id] || 0)) * 0.05;
      }

      const extrasTotal = zeroPer();
      const extras: ExtraBucket[] = Array.from(labelMap.entries()).map(([label, per]) => {
        for (const id of casinoIds) extrasTotal[id] = (extrasTotal[id] || 0) + (per[id] || 0);
        return {
          key: label, label, perCasino: per,
          total: Object.values(per).reduce((a, b) => a + b, 0),
          editable: true,
        };
      });
      const bonusTotal = Object.values(bonus5).reduce((a, b) => a + b, 0);
      if (bonusTotal > 0) {
        extras.push({ key: "bonus5", label: "Approx Bonus for Managers (5%)", perCasino: bonus5, total: bonusTotal, editable: false });
        for (const id of casinoIds) extrasTotal[id] = (extrasTotal[id] || 0) + (bonus5[id] || 0);
      }

      const sumRec = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);
      const tEstimated = sumRec(estimated);
      const tResult = sumRec(result);
      const tOther = sumRec(other);
      const tCollection = sumRec(collection);
      const tExtras = sumRec(extrasTotal);
      const tBonus = sumRec(bonus5);
      const balance = tResult - tEstimated - tExtras - tCollection;

      // Forecast: average of CLOSED business days only
      const daysInMonth = lastDay;
      const daysElapsed = Math.max(1, Number(payload.closed_days_count || 0));
      const forecastResult = (tResult / daysElapsed) * daysInMonth;
      const expectedProfit = forecastResult - tEstimated - tExtras - tCollection;

      // Daily balance: fixed costs charged once on the first row
      const days = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));
      let running = -(tEstimated + tExtras);
      for (const d of days) {
        running += d.jcResult - d.collection;
        d.balance = running;
      }

      return {
        monthStart: from,
        today: isCurrentMonth ? today : monthEnd,
        year,
        month,
        summary: {
          estimated, result, tables, slots, playersCards, other, collection, extras, extrasTotal, bonus5,
          totals: {
            estimated: tEstimated, result: tResult, other: tOther, collection: tCollection,
            tables: sumRec(tables), slots: sumRec(slots), playersCards: sumRec(playersCards),
            extras: tExtras, bonus5: tBonus,
            expectedProfit, balance, total: balance,
            dailyBalance: days.length ? days[days.length - 1].balance : 0,
            daysElapsed, daysInMonth, forecastResult,
          },
        },
        daily: days,
      };
    },
  });
}
