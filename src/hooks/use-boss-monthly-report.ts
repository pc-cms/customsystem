/**
 * useBossMonthlyReport — MTD financial rollup across selected casinos.
 *
 * Sources:
 *   - Result (Live+Slots):   fin_day_closing.tables_result + slots_result
 *                            with live fallback for today when not yet closed
 *   - Other incomes:         fin_other_incomes.amount * fx_rate (→ TZS)
 *   - Collection:            expenses.amount_tzs joined w/ fin_categories.group_code='collections'
 *   - Extra Expenses:        boss_report_extras (manual per casino / month)
 *   - Estimated Expenses:    fin_budget.planned_amount (TZS rows only)
 *   - Bonus 5%:              synthetic 5% of max(0, Result − Estimated Expenses)
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getBusinessDate, businessDayHourUTC, businessDateOf } from "@/lib/business-day";

export type CasinoRef = { id: string; name: string; slug: string | null };

export type DailyRow = {
  date: string; // YYYY-MM-DD
  perCasino: Record<string, number>; // casino_id -> Live+Slots result
  jcResult: number;                  // sum across all
  collection: number;                // sum across all
  balance: number;                   // running (JC - Collection - proRata extras)
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
  /** Slots net of Players Card Balance (deposits on player cards). */
  slots:      Record<string, number>;
  /** Players Card Balance (latest entry of the month), always >= 0. */
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

const nextDay = (iso: string): string => {
  const d = new Date(iso);
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
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
    queryKey: ["boss-monthly-report", ids, from, to],
    enabled: casinos.length > 0,
    refetchInterval: 30_000,
    staleTime: 15_000,
    queryFn: async (): Promise<BossMonthlyReport> => {

      const casinoIds = casinos.map(c => c.id);
      const zeroPer = (): Record<string, number> =>
        Object.fromEntries(casinoIds.map(id => [id, 0]));

      const { data: cats } = await supabase
        .from("fin_categories")
        .select("id, group_code, name, is_income");
      const catMap = new Map<string, { group: string; income: boolean }>();
      (cats || []).forEach((c: any) =>
        catMap.set(c.id, { group: c.group_code, income: c.is_income }));

      const [closingsRes, otherRes, expensesRes, budgetRes, extrasRes, ratesRes, shiftsRes, slotShiftsRes] = await Promise.all([
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
          .lte("business_date", to)
          .is("voided_at", null)
          .not("fin_category_id", "is", null)
          .limit(5000),
        supabase.from("fin_budget")
          .select("casino_id, year, month, planned_amount, currency, category_id")
          .in("casino_id", casinoIds)
          .eq("year", Number(from.slice(0, 4)))
          .eq("month", Number(from.slice(5, 7))),
        supabase.from("boss_report_extras")
          .select("casino_id, label, amount, sort_order")
          .in("casino_id", casinoIds)
          .eq("year", year)
          .eq("month", month)
          .order("sort_order", { ascending: true })
          .order("label", { ascending: true }),
        supabase.from("cage_slots_exchange_rates")
          .select("casino_id, currency_code, rate_to_tzs, created_at")
          .in("casino_id", casinoIds)
          .order("created_at", { ascending: false }),
        supabase.from("shifts")
          .select("casino_id, opened_at, tables_result")
          .in("casino_id", casinoIds)
          .gte("opened_at", businessDayHourUTC(from, 7))
          .lt("opened_at", businessDayHourUTC(nextDay(to), 7)),
        supabase.from("cage_slots_shifts")
          .select("casino_id, business_date, system_shift_result")
          .in("casino_id", casinoIds)
          .gte("business_date", from)
          .lte("business_date", to),
      ]);

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

      // Live fallback for days not yet closed
      const closedKeys = new Set(
        ((closingsRes.data || []) as any[]).map(r => `${r.casino_id}|${r.business_date}`),
      );
      const liveTables = new Map<string, number>();
      const liveSlots = new Map<string, number>();
      for (const s of (shiftsRes.data || []) as any[]) {
        const d = businessDateOf(s.opened_at);
        if (d < from || d > to) continue;
        const k = `${s.casino_id}|${d}`;
        liveTables.set(k, (liveTables.get(k) || 0) + Number(s.tables_result || 0));
      }
      for (const s of (slotShiftsRes.data || []) as any[]) {
        const k = `${s.casino_id}|${s.business_date}`;
        liveSlots.set(k, (liveSlots.get(k) || 0) + Number(s.system_shift_result || 0));
      }
      const openDays = new Set<string>();
      for (const s of (shiftsRes.data || []) as any[]) {
        if (s.tables_result !== null && s.tables_result !== undefined) continue;
        const d = businessDateOf(s.opened_at);
        if (d < from || d > to) continue;
        if (!closedKeys.has(`${s.casino_id}|${d}`)) openDays.add(`${s.casino_id}|${d}`);
      }
      if (openDays.size) {
        const snaps = await Promise.all(
          Array.from(openDays).map(async (k) => {
            const [casinoId, date] = k.split("|");
            const { data } = await (supabase as any).rpc("chip_snapshots_latest", {
              _casino_id: casinoId, _date: date,
            });
            const sum = ((data || []) as any[]).reduce((acc, r) => {
              if (r.location_type !== "table" || !r.location_id) return acc;
              return acc + (Number(r.actual_quantity || 0) - Number(r.expected_quantity || 0)) * Number(r.denomination || 0);
            }, 0);
            return [k, sum] as const;
          }),
        );
        for (const [k, sum] of snaps) {
          if (!sum) continue;
          liveTables.set(k, (liveTables.get(k) || 0) + sum);
        }
      }

      for (const k of new Set([...liveTables.keys(), ...liveSlots.keys()])) {
        if (closedKeys.has(k)) continue;
        const [casinoId, date] = k.split("|");
        if (!casinoIds.includes(casinoId)) continue;
        const tv = liveTables.get(k) || 0;
        const sv = liveSlots.get(k) || 0;
        const v = tv + sv;
        if (!v) continue;
        tables[casinoId] = (tables[casinoId] || 0) + tv;
        slotsRaw[casinoId] = (slotsRaw[casinoId] || 0) + sv;
        result[casinoId] = (result[casinoId] || 0) + v;
        const row = dailyMap.get(date);
        if (row) {
          row.perCasino[casinoId] = (row.perCasino[casinoId] || 0) + v;
          row.jcResult += v;
        }
      }

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

      // Collections from expenses (group_code = collections)
      const collection = zeroPer();
      for (const r of (expensesRes.data || []) as any[]) {
        const amt = Number(r.amount_tzs ?? r.amount ?? 0);
        if (!amt) continue;
        const cat = r.fin_category_id ? catMap.get(r.fin_category_id) : undefined;
        if (cat?.income || (cat?.group || "additional") !== "collections") continue;
        collection[r.casino_id] = (collection[r.casino_id] || 0) + amt;
        const row = dailyMap.get(r.business_date);
        if (row) row.collection += amt;
      }

      // Estimated Expenses
      const estimated = zeroPer();
      for (const b of (budgetRes.data || []) as any[]) {
        const rate = fxRate(b.casino_id, b.currency || "TZS");
        estimated[b.casino_id] = (estimated[b.casino_id] || 0) + Number(b.planned_amount || 0) * rate;
      }

      // Manual extras (per label)
      const labelMap = new Map<string, Record<string, number>>();
      for (const r of (extrasRes.data || []) as any[]) {
        const label = r.label || "Extra";
        if (!labelMap.has(label)) labelMap.set(label, zeroPer());
        const bucket = labelMap.get(label)!;
        bucket[r.casino_id] = (bucket[r.casino_id] || 0) + Number(r.amount || 0);
      }

      // Bonus 5% of (Result − Estimated Expenses); floor at 0
      const bonus5 = zeroPer();
      for (const id of casinoIds) {
        const base = (result[id] || 0) - (estimated[id] || 0);
        bonus5[id] = Math.max(0, base) * 0.05;
      }

      // Extras aggregate: manual rows + bonus5
      const extrasTotal = zeroPer();
      const extras: ExtraBucket[] = Array.from(labelMap.entries())
        .map(([label, per]) => {
          for (const id of casinoIds) extrasTotal[id] = (extrasTotal[id] || 0) + (per[id] || 0);
          return { key: label, label, perCasino: per, total: Object.values(per).reduce((a, b) => a + b, 0), editable: true };
        });
      const bonusTotal = Object.values(bonus5).reduce((a, b) => a + b, 0);
      if (bonusTotal > 0) {
        extras.push({ key: "bonus5", label: "Approx Bonus for Managers (5%)", perCasino: bonus5, total: bonusTotal, editable: false });
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
      const balance = tResult + tOther - tEstimated - tExtras - tCollection;

      // Expected profit: forecast average daily result to end of month
      const daysInMonth = lastDay;
      const daysElapsed = Math.max(1, Object.values(dailyMap).filter(d => d.jcResult !== 0 || d.collection !== 0).length || 1);
      const avgDailyResult = tResult / daysElapsed;
      const forecastResult = avgDailyResult * daysInMonth;
      const expectedProfit = forecastResult - tEstimated - tExtras - tCollection + tOther;
      const total = balance; // SAFE removed

      // Daily balance: fixed costs charged once on first row
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
            expectedProfit, balance, total,
            dailyBalance: days.length ? days[days.length - 1].balance : 0,
            daysElapsed, daysInMonth, forecastResult,
          },
        },
        daily: days,
      };
    },
  });
}
