/**
 * Office Monthly Balance — one row per day of the selected month, company-wide.
 *
 * Unlike Casino Monthly Balance (single casino), this report consolidates the
 * head-office side of the business:
 *   IN per casino  — collections sent from each casino to the office
 *   Cage Office    — running office cash after IN / expenses / transfers / OUT
 *   Bank           — bank wallet balances across all casinos (TZS-valued)
 *   Expenses       — office-source expenses only
 *   Transfer       — money sent back from the office to the casinos
 *   OUT            — payouts out of the company (owner / AK)
 * All figures TZS.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchPaged } from "@/lib/fetch-paged";
import { signedWalletTxTzs } from "@/lib/wallet-tx-sign";
import { enumerateDates, FALLBACK_USD_RATE } from "@/hooks/use-daily-balance-report";

export interface OfficeCasinoRef {
  id: string;
  name: string;
}

export interface OfficeBalanceRow {
  date: string;
  weekday: string;
  /** casino id → IN (collections received from that casino) */
  in_by_casino: Record<string, number>;
  in_total: number;
  cage_office: number;
  bank: number;
  expenses: number;
  transfer_casino: number;
  out_ak: number;
  fin_result: number;
  /** Cage + Bank at the end of the day. */
  money_total: number;
  /** Money yesterday + IN − Expenses − Transfer − OUT − Money today (≈ 0). */
  balance: number;
  /** Detail rows behind the drill-downs. */
  expenses_detail: { label: string; value: number }[];
  in_detail: { label: string; value: number }[];
  out_detail: { label: string; value: number }[];
  /** Cash denominations behind the office cage (demo / snapshot based). */
  cage_detail?: { currency: string; denomination: number; quantity: number; tzs: number }[];
  /** Mobile money per provider (TZS) at the end of the day. */
  mobile_detail?: Record<string, number>;
  /** Bank balances split by currency. */
  bank_detail?: { currency: string; amount: number; rate: number; tzs: number }[];



}

/** Month aggregate per casino: gaming result, casino expenses, profit. */
export interface OfficeCasinoStat {
  result: number;
  expenses: number;
  profit: number;
}

export interface OfficeBalanceData {
  casinos: OfficeCasinoRef[];
  rows: OfficeBalanceRow[];
  /** casino id → month totals (Result / Expenses / Profit) */
  casino_stats: Record<string, OfficeCasinoStat>;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export const monthBoundsOf = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
};

export const useOfficeBalanceReport = (month: string, enabled = true) => {
  const { from, to } = monthBoundsOf(month);

  return useQuery({
    queryKey: ["office-balance-report", month],
    enabled: enabled && !!month,
    staleTime: 30_000,
    queryFn: async (): Promise<OfficeBalanceData> => {
      const sb = supabase as any;

      const [casinos, wallets, expenses, tx, dayClosings] = await Promise.all([
        fetchPaged<any>((a, b) =>
          sb.from("casinos").select("id, name, is_active").order("name").range(a, b)),
        fetchPaged<any>((a, b) =>
          sb.from("fin_wallets").select("id, casino_id, name, kind, currency").range(a, b)),
        fetchPaged<any>((a, b) =>
          sb.from("expenses")
            .select("id, casino_id, business_date, amount, amount_tzs, description, source, voided_at, fin_category_id, fin_categories(name, group_code)")
            .gte("business_date", from).lte("business_date", to).range(a, b)),
        fetchPaged<any>((a, b) =>
          sb.from("fin_wallet_tx")
            .select("id, casino_id, wallet_id, kind, amount, amount_tzs, currency, fx_rate, business_date, note, posted_at")
            .gte("business_date", from).lte("business_date", to).range(a, b)),
        fetchPaged<any>((a, b) =>
          sb.from("fin_day_closing")
            .select("casino_id, business_date, tables_result, slots_result")
            .gte("business_date", from).lte("business_date", to).range(a, b)),
      ]);

      const casinoList: OfficeCasinoRef[] = casinos
        .filter((c: any) => c.is_active !== false)
        .map((c: any) => ({ id: c.id, name: c.name }));

      const walletKind: Record<string, string> = {};
      const walletName: Record<string, string> = {};
      wallets.forEach((w: any) => {
        walletKind[w.id] = w.kind;
        walletName[w.id] = w.name;
      });

      type Bucket = Record<string, number>;
      const add = (b: Bucket, d: string, v: number) => { b[d] = (b[d] || 0) + v; };

      const inByDate: Record<string, Record<string, number>> = {};
      const inDetail: Record<string, { label: string; value: number }[]> = {};
      const expByDate: Bucket = {};
      const expDetail: Record<string, Record<string, number>> = {};
      const outByDate: Bucket = {};
      const outDetail: Record<string, { label: string; value: number }[]> = {};
      const casinoName: Record<string, string> = {};
      /** Month expenses booked at the casino (non-office source, collections excluded). */
      const casinoExp: Record<string, number> = {};
      casinoList.forEach((c) => { casinoName[c.id] = c.name; });

      const tzsOf = (e: any) => (e.amount_tzs != null ? num(e.amount_tzs) : num(e.amount));

      expenses.filter((e: any) => !e.voided_at).forEach((e: any) => {
        const d = String(e.business_date).slice(0, 10);
        const v = tzsOf(e);
        const group = String(e.fin_categories?.group_code || "");
        const isCollection = group === "collections";
        const isOffice = e.source === "office";
        if (isCollection && !isOffice) {
          // Casino → office collection = money IN to the office.
          ((inByDate[d] ??= {}))[e.casino_id] = (inByDate[d]?.[e.casino_id] || 0) + v;
          (inDetail[d] ??= []).push({
            label: `${casinoName[e.casino_id] || "Casino"} · ${e.description || "Collection"}`,
            value: v,
          });
          return;
        }
        if (isCollection && isOffice) {
          add(outByDate, d, v);
          (outDetail[d] ??= []).push({ label: e.description || "Payout", value: v });
          return;
        }
        if (isOffice) {
          add(expByDate, d, v);
          const label = e.fin_categories?.name || e.description || "Other";
          ((expDetail[d] ??= {}))[label] = (expDetail[d]?.[label] || 0) + v;
          return;
        }
        // Casino-source expense → belongs to that casino's month P&L.
        if (e.casino_id) casinoExp[e.casino_id] = (casinoExp[e.casino_id] || 0) + v;
      });



      /** Money sent from the office back into a casino (booked as casino income). */
      const trfByDate: Bucket = {};
      /** Bank running balance across all casinos. */
      const bankRunning: Bucket = {};
      let bankBal = 0;
      const txByDate: Record<string, any[]> = {};
      tx.filter((t: any) => t.posted_at).forEach((t: any) => {
        (txByDate[String(t.business_date).slice(0, 10)] ??= []).push(t);
      });
      Object.keys(txByDate).sort().forEach((d) => {
        for (const t of txByDate[d]) {
          const kind = walletKind[t.wallet_id];
          const v = signedWalletTxTzs(t);
          if (kind === "bank") bankBal += v;
          if ((t.kind === "income" || t.kind === "external_income") && v > 0 && kind !== "bank") {
            add(trfByDate, d, v);
          }
        }
        bankRunning[d] = bankBal;
      });

      // Month gaming result per casino (tables + slots from day closing).
      const casinoRes: Record<string, number> = {};
      dayClosings.forEach((c: any) => {
        if (!c.casino_id) return;
        casinoRes[c.casino_id] =
          (casinoRes[c.casino_id] || 0) + num(c.tables_result) + num(c.slots_result);
      });
      const casinoStats: Record<string, OfficeCasinoStat> = {};
      casinoList.forEach((c) => {
        const result = casinoRes[c.id] || 0;
        const expensesV = casinoExp[c.id] || 0;
        casinoStats[c.id] = { result, expenses: expensesV, profit: result - expensesV };
      });

      let lastBank = 0;
      let office = 0;
      let prevMoney: number | null = null;
      return {
        casinos: casinoList,
        casino_stats: casinoStats,
        rows: enumerateDates(from, to).map((date) => {
          const ins = inByDate[date] ?? {};
          const inTotal = Object.values(ins).reduce((s, v) => s + v, 0);
          const exp = expByDate[date] ?? 0;
          const trf = trfByDate[date] ?? 0;
          const out = outByDate[date] ?? 0;
          office += inTotal - exp - trf - out;
          lastBank = bankRunning[date] ?? lastBank;
          const moneyTotal = office + lastBank;
          const balance =
            prevMoney == null ? 0 : prevMoney + inTotal - exp - trf - out - moneyTotal;
          prevMoney = moneyTotal;
          return {
            date,
            weekday: WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()],
            in_by_casino: ins,
            in_total: inTotal,
            cage_office: office,
            bank: lastBank,
            expenses: exp,
            transfer_casino: trf,
            out_ak: out,
            fin_result: inTotal - exp - out,
            money_total: moneyTotal,
            balance,
            expenses_detail: Object.entries(expDetail[date] ?? {})
              .map(([label, value]) => ({ label, value }))
              .sort((a, b) => b.value - a.value),
            in_detail: inDetail[date] ?? [],
            out_detail: outDetail[date] ?? [],
          };
        }),
      };
    },
  });
};

export const OFFICE_FALLBACK_RATE = FALLBACK_USD_RATE;
