/**
 * Daily Balance Sheet report — one row per business date of the selected period.
 *
 * Rebuilds the legacy "БАЛАНС" spreadsheet layout purely from live system data
 * (day closings, shifts, wallets, expenses, bank checks, chips, tips, POS).
 * Everything is expressed in TZS (project rule); USD-denominated sources are
 * converted with the daily rate from `fin_daily_rates` (fallback 2600).
 *
 * Rows for months that predate the system are filled from `fin_legacy_balance`
 * (imported Excel) — system data always wins where it exists.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCasino } from "@/lib/casino-context";
import { fetchPaged } from "@/lib/fetch-paged";

export const FALLBACK_USD_RATE = 2600;
/**
 * Bank checks are entered in the cage GROSS — the amount that arrived is 3%
 * higher than the real money. Net = gross / 1.03, fee = gross − net.
 */
export const BANK_COMMISSION_RATE = 0.03;

export interface DailyBalanceRow {
  date: string;
  weekday: string;
  rate_usd: number;
  casino_result: number;
  cash_desk_result: number;
  tables_result: number;
  slots_result: number;
  bar_result: number;
  cage_cash: number;
  collection_bank: number;
  chip_difference: number;
  tips_tables: number;
  tips_slots: number;
  office_cash: number;
  office_transfer: number;
  office_in: number;
  office_out: number;
  bank_terminal: number;
  bank_fee: number;
  bank_account: number;
  bank_expenses: number;
  credit_deposit: number;
  expenses: number;
  chips_float: number;
  /** Σ incomes of the day: Tables + Slots + Bar + Credit/Deposit */
  day_total: number;
  /** Cash Desk − Day Total (cash vs declared result) */
  day_balance: number;
  /** true when the row came from the imported legacy sheet */
  legacy: boolean;
  /** true when at least one live source produced data for that date */
  hasSystemData: boolean;
}


const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const dateOnly = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : "");

export const enumerateDates = (from: string, to: string): string[] => {
  const out: string[] = [];
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  for (let d = start; d <= end; d = new Date(d.getTime() + 86400000)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
};

type Bucket = Record<string, number>;
const add = (b: Bucket, key: string, v: number) => {
  if (!key) return;
  b[key] = (b[key] || 0) + v;
};

export const useDailyBalanceReport = (from: string, to: string) => {
  const { activeCasinoId } = useCasino();

  return useQuery({
    queryKey: ["daily-balance-report", activeCasinoId, from, to],
    enabled: !!activeCasinoId && !!from && !!to,
    staleTime: 30_000,
    queryFn: async (): Promise<DailyBalanceRow[]> => {
      const casino = activeCasinoId!;
      const fromIso = `${from}T00:00:00.000Z`;
      const toIso = `${to}T23:59:59.999Z`;
      const sb = supabase as any;

      const [
        closings,
        shifts,
        slotShifts,
        expenses,
        walletTx,
        wallets,
        rates,
        bankChecks,
        chipSnaps,
        tips,
        slotTips,
        posOrders,
        legacy,
        slotsClosing,
      ] = await Promise.all([
        fetchPaged<any>((a, b) =>
          sb.from("fin_day_closing")
            .select("business_date, tables_result, slots_result, players_card_balance")
            .eq("casino_id", casino).gte("business_date", from).lte("business_date", to).range(a, b)),
        fetchPaged<any>((a, b) =>
          sb.from("shifts")
            .select("opened_at, closed_at, cash_desk_result, tables_result, shift_result, closing_cash")
            .eq("casino_id", casino).gte("opened_at", fromIso).lte("opened_at", toIso).range(a, b)),

        fetchPaged<any>((a, b) =>
          sb.from("cage_slots_shifts")
            .select("business_date, cash_desk_result, slots_result, cards_miss")
            .eq("casino_id", casino).gte("business_date", from).lte("business_date", to).range(a, b)),
        fetchPaged<any>((a, b) =>
          sb.from("expenses")
            .select("business_date, amount, amount_tzs, currency, wallet_id, voided_at")
            .eq("casino_id", casino).gte("business_date", from).lte("business_date", to).range(a, b)),
        fetchPaged<any>((a, b) =>
          sb.from("fin_wallet_tx")
            .select("business_date, wallet_id, kind, amount_tzs, amount")
            .eq("casino_id", casino).lte("business_date", to).range(a, b)),
        fetchPaged<any>((a, b) =>
          sb.from("fin_wallets")
            .select("id, name, kind, currency, starting_float_amount, starting_float_date")
            .eq("casino_id", casino).range(a, b)),
        fetchPaged<any>((a, b) =>
          sb.from("fin_daily_rates")
            .select("business_date, currency, rate_to_tzs")
            .eq("casino_id", casino).eq("currency", "USD")
            .gte("business_date", from).lte("business_date", to).range(a, b)),
        fetchPaged<any>((a, b) =>
          sb.from("bank_checks")
            .select("check_date, amount, currency")
            .eq("casino_id", casino).gte("check_date", from).lte("check_date", to).range(a, b)),
        fetchPaged<any>((a, b) =>
          sb.from("chip_snapshots")
            .select("date, denomination, actual_quantity, miss")
            .eq("casino_id", casino).gte("date", from).lte("date", to).range(a, b)),
        fetchPaged<any>((a, b) =>
          sb.from("transactions")
            .select("business_date, type, amount, cancelled_at")
            .eq("casino_id", casino).in("type", ["tips_live", "tips_floor", "tips_poker"])
            .gte("business_date", from).lte("business_date", to).range(a, b)),
        fetchPaged<any>((a, b) =>
          sb.from("cage_slots_tips_cd")
            .select("created_at, amount")
            .eq("casino_id", casino).gte("created_at", fromIso).lte("created_at", toIso).range(a, b)),
        fetchPaged<any>((a, b) =>
          sb.from("pos_orders")
            .select("business_date, total_tzs, status")
            .eq("casino_id", casino).gte("business_date", from).lte("business_date", to).range(a, b)),
        fetchPaged<any>((a, b) =>
          sb.from("fin_legacy_balance")
            .select("*")
            .eq("casino_id", casino).gte("business_date", from).lte("business_date", to).range(a, b)),
        // Slots cage closing cash inventory (per shift) → Cage Cash (SLOTS part)
        fetchPaged<any>((a, b) =>
          sb.from("cage_slots_cash_inventory")
            .select("total_tzs, inventory_type, cage_slots_shifts!inner(business_date, casino_id)")
            .eq("casino_id", casino).eq("inventory_type", "closing")
            .gte("cage_slots_shifts.business_date", from)
            .lte("cage_slots_shifts.business_date", to).range(a, b)),
      ]);


      // ---- daily USD rate (carry forward last known) --------------------
      const rateByDate: Bucket = {};
      rates.forEach((r) => { rateByDate[r.business_date] = num(r.rate_to_tzs); });

      // ---- wallet classification ---------------------------------------
      const CAGE_KINDS = new Set(["cage_table", "cage_slot", "main_cash"]);
      const walletKind: Record<string, string> = {};
      wallets.forEach((w) => { walletKind[w.id] = w.kind; });

      const tzs = (row: { amount_tzs?: number | null; amount?: number | null }) =>
        row.amount_tzs != null ? num(row.amount_tzs) : num(row.amount);

      // ---- per-date aggregation buckets ---------------------------------
      const tablesRes: Bucket = {}, slotsRes: Bucket = {}, cardBal: Bucket = {};
      closings.forEach((c) => {
        tablesRes[c.business_date] = num(c.tables_result);
        slotsRes[c.business_date] = num(c.slots_result);
        cardBal[c.business_date] = num(c.players_card_balance);
      });

      // Cage Cash = closing cash of LIVE cage shifts + closing cash of SLOTS cage shifts
      const cageClosing: Bucket = {};
      const cashDesk: Bucket = {}, shiftTables: Bucket = {};
      shifts.forEach((s) => {
        const d = dateOnly(s.closed_at || s.opened_at);
        add(cashDesk, d, num(s.cash_desk_result));
        add(shiftTables, d, num(s.tables_result));
        add(cageClosing, d, num(s.closing_cash?.actual));
      });
      slotShifts.forEach((s) => {
        add(cashDesk, s.business_date, num(s.cash_desk_result));
        if (slotsRes[s.business_date] == null) add(slotsRes, s.business_date, num(s.slots_result));
      });
      slotsClosing.forEach((i) => {
        add(cageClosing, i.cage_slots_shifts?.business_date, num(i.total_tzs));
      });


      const expByDate: Bucket = {}, bankExpByDate: Bucket = {};
      expenses.filter((e) => !e.voided_at).forEach((e) => {
        const v = tzs(e);
        add(expByDate, e.business_date, v);
        if (walletKind[e.wallet_id] === "bank_account") add(bankExpByDate, e.business_date, v);
      });

      const collections: Bucket = {}, officeIn: Bucket = {}, officeOut: Bucket = {};
      const cageRunning: Bucket = {}, officeRunning: Bucket = {}, bankRunning: Bucket = {};
      // running balances start from wallet starting floats
      let cageBal = 0, officeBal = 0, bankBal = 0;
      wallets.forEach((w) => {
        const f = num(w.starting_float_amount);
        if (!f) return;
        if (CAGE_KINDS.has(w.kind)) cageBal += f;
        else if (w.kind === "office_safe") officeBal += f;
        else if (w.kind === "bank_account") bankBal += f;
      });

      const txByDate: Record<string, any[]> = {};
      walletTx.forEach((t) => {
        (txByDate[t.business_date] ??= []).push(t);
        if (t.kind === "collection") add(collections, t.business_date, Math.abs(tzs(t)));
        if (walletKind[t.wallet_id] === "office_safe") {
          const v = tzs(t);
          if (v >= 0) add(officeIn, t.business_date, v);
          else add(officeOut, t.business_date, Math.abs(v));
        }
      });

      const allTxDates = Object.keys(txByDate).sort();
      for (const d of allTxDates) {
        for (const t of txByDate[d]) {
          const k = walletKind[t.wallet_id];
          const v = tzs(t);
          if (CAGE_KINDS.has(k)) cageBal += v;
          else if (k === "office_safe") officeBal += v;
          else if (k === "bank_account") bankBal += v;
        }
        cageRunning[d] = cageBal;
        officeRunning[d] = officeBal;
        bankRunning[d] = bankBal;
      }

      const terminal: Bucket = {};
      bankChecks.forEach((b) => {
        const rate = rateByDate[b.check_date] || FALLBACK_USD_RATE;
        const v = b.currency === "USD" ? num(b.amount) * rate : num(b.amount);
        add(terminal, b.check_date, v);
      });

      const chipMiss: Bucket = {}, chipFloat: Bucket = {};
      chipSnaps.forEach((c) => {
        add(chipMiss, c.date, num(c.miss) * num(c.denomination));
        add(chipFloat, c.date, num(c.actual_quantity) * num(c.denomination));
      });

      const tipsTables: Bucket = {}, tipsSlots: Bucket = {};
      tips.filter((t) => !t.cancelled_at).forEach((t) => add(tipsTables, t.business_date, num(t.amount)));
      slotTips.forEach((t) => add(tipsSlots, dateOnly(t.created_at), num(t.amount)));

      const bar: Bucket = {};
      posOrders.filter((o) => o.status !== "void").forEach((o) => add(bar, o.business_date, num(o.total_tzs)));

      const legacyByDate: Record<string, any> = {};
      legacy.forEach((l) => { legacyByDate[l.business_date] = l; });

      // ---- build rows ---------------------------------------------------
      let lastRate = 0, lastCage = 0, lastOffice = 0, lastBank = 0, lastChips = 0;
      return enumerateDates(from, to).map((date) => {
        const rate = rateByDate[date] || lastRate || FALLBACK_USD_RATE;
        lastRate = rate;

        const l = legacyByDate[date];
        const tables = tablesRes[date] ?? shiftTables[date] ?? 0;
        const slotsNet = (slotsRes[date] ?? 0) - (cardBal[date] ?? 0);
        const barV = bar[date] ?? 0;

        if (cageRunning[date] != null) lastCage = cageRunning[date];
        if (officeRunning[date] != null) lastOffice = officeRunning[date];
        if (bankRunning[date] != null) lastBank = bankRunning[date];
        if (chipFloat[date] != null) lastChips = chipFloat[date];

        const hasSystemData =
          tablesRes[date] != null || slotsRes[date] != null || cashDesk[date] != null ||
          expByDate[date] != null || bar[date] != null || txByDate[date] != null;

        /** Credit / Deposit is a MANUAL field — stored in fin_legacy_balance. */
        const manualCredit = l?.credit_deposit != null ? num(l.credit_deposit) : 0;

        if (!hasSystemData && l) {
          const gross = num(l.bank_terminal);
          const net = gross / (1 + BANK_COMMISSION_RATE);
          const lTotal = num(l.tables_result) + num(l.slots_result) + num(l.bar_result) + manualCredit;
          return {
            date,
            weekday: WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()],
            rate_usd: num(l.rate_usd) || rate,
            casino_result: num(l.casino_result),
            cash_desk_result: num(l.cash_desk_result),
            tables_result: num(l.tables_result),
            slots_result: num(l.slots_result),
            bar_result: num(l.bar_result),
            cage_cash: num(l.cage_cash),
            collection_bank: num(l.collection_bank),
            chip_difference: num(l.chip_difference),
            tips_tables: num(l.tips_tables),
            tips_slots: num(l.tips_slots),
            office_cash: num(l.office_cash),
            office_transfer: num(l.office_transfer),
            office_in: num(l.office_in),
            office_out: num(l.office_out),
            bank_terminal: net,
            bank_fee: gross - net,
            bank_account: num(l.bank_account),
            bank_expenses: num(l.bank_expenses),
            credit_deposit: manualCredit,
            expenses: num(l.expenses),
            chips_float: num(l.chips_float),
            day_total: lTotal,
            day_balance: num(l.cash_desk_result) - lTotal,
            legacy: true,
            hasSystemData: false,
          } satisfies DailyBalanceRow;
        }

        // Bank checks are entered GROSS (3% on top) — strip the commission.
        const gross = terminal[date] ?? 0;
        const net = gross / (1 + BANK_COMMISSION_RATE);
        const dayTotal = tables + slotsNet + barV + manualCredit;
        const cdr = cashDesk[date] ?? 0;
        return {
          date,
          weekday: WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()],
          rate_usd: rate,
          casino_result: tables + slotsNet + barV,
          cash_desk_result: cdr,
          tables_result: tables,
          slots_result: slotsNet,
          bar_result: barV,
          // Cage Cash = closing cash of LIVE + SLOTS cage shifts (falls back to wallet balance)
          cage_cash: cageClosing[date] ?? lastCage,
          collection_bank: collections[date] ?? 0,
          chip_difference: chipMiss[date] ?? 0,
          tips_tables: tipsTables[date] ?? 0,
          tips_slots: tipsSlots[date] ?? 0,
          office_cash: lastOffice,
          office_transfer: (officeIn[date] ?? 0) - (officeOut[date] ?? 0),
          office_in: officeIn[date] ?? 0,
          office_out: officeOut[date] ?? 0,
          bank_terminal: net,
          bank_fee: gross - net,
          bank_account: lastBank,
          bank_expenses: bankExpByDate[date] ?? 0,
          credit_deposit: manualCredit,
          expenses: expByDate[date] ?? 0,
          chips_float: lastChips,
          day_total: dayTotal,
          day_balance: cdr - dayTotal,
          legacy: false,
          hasSystemData,
        } satisfies DailyBalanceRow;
      });

    },
  });
};
