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
import { invalidateFinance } from "@/lib/fin-invalidate";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCasino } from "@/lib/casino-context";
import { fetchPaged } from "@/lib/fetch-paged";
import { businessDateOf } from "@/lib/business-day";
import { signedWalletTxTzs } from "@/lib/wallet-tx-sign";


export const FALLBACK_USD_RATE = 2600;
/**
 * Bank checks are entered in the cage GROSS — the amount that arrived is 3%
 * higher than the real money. Net = gross / 1.03, fee = gross − net.
 */
export const BANK_COMMISSION_RATE = 0.03;

/** Cage chips of the day, one entry per denomination. */
export interface ChipDetail {
  denomination: number;
  quantity: number;
  miss: number;
}

/** Money held by the cage at closing — cash by currency and cashless channels. */
export interface CageDetail {
  cash: { currency: string; denomination: number; quantity: number; tzs: number }[];
  cashless: { name: string; amount: number }[];
  /** Mobile money held by the cage at closing, per provider (TZS). */
  mobile: Record<string, number>;
  /** Slots cage closing total (no per-denomination breakdown available). */
  slots_total: number;
}


export interface TransferDetail {
  amount: number;
  from: string;
  to: string;
}



export interface WalletBalance {
  name: string;
  currency: string;
  /** Balance converted to TZS. */
  balance: number;
  /** Balance in the wallet's own currency (units). */
  units?: number;
}

/** Money bucket a wallet belongs to (drives the universal money drill). */
export type MoneyBucket = "cage" | "office" | "bank";

/**
 * One wallet as of a given day — the single source of every money figure in
 * the report (last physical count on or before that date).
 */
export interface MoneyWallet {
  name: string;
  kind: string;
  currency: string;
  /** Amount in the wallet's own currency. */
  units: number;
  /** Amount converted to TZS. */
  tzs: number;
  bucket: MoneyBucket;
  /** true for mobile-money / cashless channels (AirTell, Tigo, Halo, M-Pesa). */
  mobile: boolean;
}



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
  bank_account: number;
  bank_expenses: number;
  credit_deposit: number;
  expenses: number;
  chips_float: number;

  /** Σ incomes of the day: Tables + Slots + Bar + Credit/Deposit */
  day_total: number;
  /** Cash Desk − Day Total (cash vs declared result) */
  day_balance: number;
  // ---- Casino Monthly Balance model --------------------------------
  /** Live cage cash-desk result (cash side of live games). */
  live_cash_result: number;
  /** Slots Diff = players card balance of the day (fin_day_closing). */
  slots_diff: number;
  /** Cage Casino = ALL money in Live cage + Slots cage (cash + cashless). */
  cage_casino: number;
  /** Cash part of Cage Casino. */
  cage_cash_part: number;
  /** Cashless part of Cage Casino. */
  cage_cashless_part: number;
  /** true when Cage Casino was carried forward (no closing data that day). */
  cage_carried: boolean;
  /** Transfers cage → manager safe (positive leg into office_safe). */
  transfer_cage_manager: number;
  /** Manager (office) safe balance at end of day. */
  cage_manager: number;
  /** Transfers into bank accounts (positive leg). */
  transfer_bank: number;
  /** Other incomes / fees (non-JP) from fin_other_incomes. */
  other_income: number;
  /** Jackpot (JP) income from fin_other_incomes. */
  jp: number;
  /** Missed cards (negative = shortage) — Cage Slots cards miss. */
  missed_cards: number;
  /** Collections / owner withdrawals — shown as a reference column (part of Office Out). */
  collections: number;


  /** Bank account balances at end of day, split by currency (TZS-valued). */
  bank_tzs: number;
  bank_usd: number;
  /** Manual USD figure as entered (USD units). */
  bank_usd_raw: number;
  bank_tzs_manual: boolean;
  bank_usd_manual: boolean;
  /** Owner deposits into the business (external income). */
  money_in: number;
  /** Collections / owner withdrawals. */
  money_out: number;
  /** Cage Casino + Cage Manager + Bank (TZS + USD) + Terminal at end of day. */
  money_total: number;
  /** True for days before the recorded Start — money columns are not tracked. */
  money_hidden: boolean;
  /** Financial result = Casino result − expenses + office net (IN − OUT). */
  fin_result: number;
  /** Variance: Money (actual) − control figure (expected). Should tend to 0. */
  balance: number;
  /** Control figure: yesterday Money + Result + IN − OUT − Expenses. */
  balance_check: number;
  /** Chip Diff + Slots Diff (collapsed "Diff" column). */
  diff_total: number;
  /** Chip snapshot rows of the day (cage chips by denomination). */
  chips_detail: ChipDetail[];
  /** Cage money breakdown at closing (cash by currency/denomination + cashless). */
  cage_detail: CageDetail;
  /** Every wallet as of that day — feeds the universal money drill. */
  money_detail: MoneyWallet[];
  /** Transfers cage → manager safe of the day. */
  transfers_manager: TransferDetail[];
  /** Bank transfer legs of the day (signed). */
  transfers_bank: TransferDetail[];
  /** Manager / office safe wallets with their balance at end of day. */
  office_wallets: WalletBalance[];
  /** Bank wallets with their balance at end of day. */
  bank_wallets: WalletBalance[];
  /** Office money movements of the day (IN positive / OUT negative). */
  office_movements: TransferDetail[];
  /** Expenses of the day grouped by category. */
  expenses_detail: { label: string; value: number }[];
  /** Tips of the day (tables + slots). */
  tips_total: number;
  /** Virtual "Start" row (carried over from the previous month). */
  is_start?: boolean;

  /** true when the row came from the imported legacy sheet */
  legacy: boolean;
  /** true when at least one live source produced data for that date */
  hasSystemData: boolean;
  /** true when the business day is closed — open days show no figures. */
  day_closed: boolean;
  /** true when the money figures come from a recorded closing snapshot. */
  snapshot: boolean;
}




const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const dateOnly = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : "");

/** Previous calendar day of a YYYY-MM-DD string. */
export const prevDate = (d: string) =>
  new Date(new Date(`${d}T00:00:00Z`).getTime() - 86400000).toISOString().slice(0, 10);

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

export const useDailyBalanceReport = (
  from: string,
  to: string,
  opts?: { enabled?: boolean; startBalance?: number },
) => {
  const { activeCasinoId } = useCasino();
  /** Manual opening money (Starting Balance tile) — used when no fin_month_start row exists. */
  const manualStart = opts?.startBalance ?? 0;

  return useQuery({
    queryKey: ["daily-balance-report", activeCasinoId, from, to, manualStart],
    enabled: (opts?.enabled ?? true) && !!activeCasinoId && !!from && !!to,
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
        dayClosures,
        otherIncomeRows,
        daySnaps,
        monthStart,
        walletCounts,
      ] = await Promise.all([


        fetchPaged<any>((a, b) =>
          sb.from("fin_day_closing")
            .select("business_date, tables_result, slots_result, cashdesk_win, players_card_balance")
            .eq("casino_id", casino).gte("business_date", from).lte("business_date", to).range(a, b)),
        fetchPaged<any>((a, b) =>
          sb.from("shifts")
            .select("opened_at, closed_at, cash_desk_result, tables_result, shift_result, closing_cash, closing_count, cashless_in_providers, cashless_out_providers")
            .eq("casino_id", casino).gte("opened_at", fromIso).lte("opened_at", toIso).range(a, b)),

        fetchPaged<any>((a, b) =>
          sb.from("cage_slots_shifts")
            .select("business_date, cash_desk_result, slots_result, cards_miss, cashless_final, manual_slots_deposits")
            .eq("casino_id", casino).gte("business_date", from).lte("business_date", to).range(a, b)),
        fetchPaged<any>((a, b) =>
          sb.from("expenses")
            .select("business_date, amount, amount_tzs, currency, wallet_id, source, approved, voided_at, reversal_of, description, fin_category_id, fin_categories(name, group_code)")
            .eq("casino_id", casino).gte("business_date", from).lte("business_date", to).range(a, b)),

        fetchPaged<any>((a, b) =>
          sb.from("fin_wallet_tx")
            .select("business_date, wallet_id, kind, amount_tzs, amount, note, ref_table, posted_at, category_id, fin_categories(name, group_code)")
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
        // Chip float — aggregated server-side (last snapshot per date/location/denom).
        (async () => {
          const { data, error } = await sb.rpc("chip_float_daily", {
            _casino_id: casino, _from: from, _to: to,
          });
          if (error) throw error;
          return (data ?? []) as any[];
        })(),

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
            .select("total_tzs, inventory_type, created_at, cage_slots_shifts!inner(business_date, casino_id)")
            .eq("casino_id", casino).eq("inventory_type", "closing")
            .gte("cage_slots_shifts.business_date", from)
            .lte("cage_slots_shifts.business_date", to).range(a, b)),
        // Closed business days — open days must not display any figures.
        fetchPaged<any>((a, b) =>
          sb.from("business_day_closures")
            .select("business_date")
            .eq("casino_id", casino).gte("business_date", from).lte("business_date", to).range(a, b)),
        // All Other incomes (JP + non-JP) converted to TZS.
        fetchPaged<any>((a, b) =>
          sb.from("fin_other_incomes")
            .select("business_date, amount, currency, fx_rate, source, reversed_by_id, reverses_id")
            .eq("casino_id", casino)
            .gte("business_date", from).lte("business_date", to).range(a, b)),

        // Recorded closing snapshots (money frozen at day close).
        fetchPaged<any>((a, b) =>
          sb.from("fin_day_balance_snapshot")
            .select("business_date, data")
            .eq("casino_id", casino).gte("business_date", from).lte("business_date", to).range(a, b)),
        // "Start" row — carried over from the previous month.
        fetchPaged<any>((a, b) =>
          sb.from("fin_month_start")
            .select("*")
            .eq("casino_id", casino).eq("month", from).range(a, b)),
        // Physical counts — THE source of every wallet balance in this report.
        fetchPaged<any>((a, b) =>
          sb.from("cash_count_snapshots")
            .select("wallet_id, physical_total, physical_total_tzs, created_at")
            .eq("casino_id", casino).lte("created_at", toIso)
            .order("created_at", { ascending: true }).range(a, b)),
      ]);


      const closedDays = new Set<string>(
        (dayClosures as any[]).map((c) => String(c.business_date).slice(0, 10)),
      );


      // ---- daily USD rate (carry forward last known) --------------------
      const rateByDate: Bucket = {};
      rates.forEach((r) => { rateByDate[r.business_date] = num(r.rate_to_tzs); });

      // ---- wallet classification ---------------------------------------
      // NOTE: live data uses the short wallet kinds ("cash", "safe", "bank",
      // "mobile_money"); the long enum names are kept for legacy rows.
      const CAGE_KINDS = new Set(["safe", "cage_table", "cage_slot", "main_cash"]);
      const isOfficeKind = (k: string) =>
        k === "cash" || k === "mobile_money" || k === "office_safe" || String(k).endsWith("_reserve");
      const isBankKind = (k: string) => k === "bank" || k === "bank_account";
      const walletKind: Record<string, string> = {};
      wallets.forEach((w) => { walletKind[w.id] = w.kind; });

      const tzs = (row: { amount_tzs?: number | null; amount?: number | null }) =>
        row.amount_tzs != null ? num(row.amount_tzs) : num(row.amount);

      // ---- per-date aggregation buckets ---------------------------------
      const tablesRes: Bucket = {}, slotsRes: Bucket = {}, cardBal: Bucket = {}, manualClientBal: Bucket = {};
      closings.forEach((c) => {
        tablesRes[c.business_date] = num(c.tables_result);
        // Slots always come from the Close Day figures: CashDesk Win.
        slotsRes[c.business_date] = c.cashdesk_win != null ? num(c.cashdesk_win) : num(c.slots_result);
        cardBal[c.business_date] = num(c.players_card_balance);
      });

      // Cage Casino = ALL money held by the LIVE cage + SLOTS cage (cash + cashless)
      const cageClosing: Bucket = {}, cageCashless: Bucket = {};
      const cashDesk: Bucket = {}, shiftTables: Bucket = {};
      const liveCashDesk: Bucket = {}, slotsCashDesk: Bucket = {}, slotsDeclared: Bucket = {};
      const sumProviders = (j: any) =>
        j && typeof j === "object"
          ? Object.values(j).reduce<number>((s, v) => s + num(v), 0)
          : 0;
      /** Purely presentational breakdown used by the cell detail panels. */
      const cageDetail: Record<string, CageDetail> = {};
      const cageBucket = (d: string) =>
        (cageDetail[d] ??= { cash: [], cashless: [], mobile: {}, slots_total: 0 });
      /**
       * Cage figures are a SNAPSHOT at the end of the business day, never a sum
       * of the day's shifts: only the LAST closing of each day is kept.
       */
      const sortedShifts = [...shifts].sort((a, b) =>
        String(a.closed_at || a.opened_at).localeCompare(String(b.closed_at || b.opened_at)));
      sortedShifts.forEach((s) => {
        const d = dateOnly(s.closed_at || s.opened_at);
        // Cash-desk / tables results ARE per-shift flows → summed over the day.
        add(cashDesk, d, num(s.cash_desk_result));
        add(liveCashDesk, d, num(s.cash_desk_result));
        add(shiftTables, d, num(s.tables_result));
        // Cage Casino counts MONEY ONLY — chips are never part of the cage
        // figure (closing_count.totals.total_tzs includes them, so strip them).
        const ct = (s.closing_count as any)?.totals || {};
        const closingTotal = num(ct.total_tzs)
          ? num(ct.total_tzs) - num(ct.chips_tzs)
          : num(s.closing_cash?.actual) - num(ct.chips_tzs);
        cageClosing[d] = closingTotal;
        cageCashless[d] = sumProviders(s.cashless_in_providers) - sumProviders(s.cashless_out_providers);

        const b = cageBucket(d);
        // Snapshot semantics — the last shift of the day replaces the breakdown.
        b.cash = [];
        b.cashless = [];
        // Mobile money held by the cage at closing (per provider).
        b.mobile = Object.fromEntries(
          Object.entries(((s.closing_count as any)?.mobile || {}) as Record<string, unknown>)
            .map(([k, v]) => [k, num(v)]),
        );
        const cash = (s.closing_count as any)?.cash || {};

        for (const [currency, denoms] of Object.entries(cash)) {
          for (const [denom, qty] of Object.entries((denoms || {}) as Record<string, unknown>)) {
            const q = num(qty);
            if (!q) continue;
            const dn = num(denom);
            const rate = currency === "TZS" ? 1 : (rateByDate[d] || FALLBACK_USD_RATE);
            b.cash.push({
              currency,
              denomination: dn,
              quantity: q,
              tzs: currency === "TZS" ? dn * q : dn * q * rate,
            });
          }
        }
        const providers: Record<string, number> = {};
        for (const [k, v] of Object.entries((s.cashless_in_providers || {}) as Record<string, unknown>)) {
          providers[k] = (providers[k] || 0) + num(v);
        }
        for (const [k, v] of Object.entries((s.cashless_out_providers || {}) as Record<string, unknown>)) {
          providers[k] = (providers[k] || 0) - num(v);
        }
        for (const [name, amount] of Object.entries(providers)) {
          if (!amount) continue;
          b.cashless.push({ name, amount });
        }
      });

      slotShifts.forEach((s) => {
        // Flows of the day.
        add(cashDesk, s.business_date, num(s.cash_desk_result));
        add(slotsCashDesk, s.business_date, num(s.cash_desk_result));
        add(slotsDeclared, s.business_date, num(s.slots_result));
        // Client Balance — same source as Statistics → Slots (manual entry).
        add(manualClientBal, s.business_date, num(s.manual_slots_deposits));
        // Cashless balance of the slots cage — snapshot, last shift wins.
        cageCashless[s.business_date] = (cageCashless[s.business_date] ?? 0) + num(s.cashless_final);
        if (slotsRes[s.business_date] == null) add(slotsRes, s.business_date, num(s.slots_result));
      });
      // Statistics is the source of truth for Client Balance; fall back to the
      // Close Day figure only when no slots shift carries the manual value.
      for (const d of Object.keys(manualClientBal)) {
        if (manualClientBal[d] !== 0) cardBal[d] = manualClientBal[d];
      }

      // Slots cage closing inventory — snapshot: keep the LAST closing per day.
      const lastSlotsInv: Record<string, { at: string; total: number }> = {};
      slotsClosing.forEach((i) => {
        const d = i.cage_slots_shifts?.business_date;
        if (!d) return;
        const at = String(i.created_at || "");
        const prev = lastSlotsInv[d];
        if (!prev || at >= prev.at) lastSlotsInv[d] = { at, total: num(i.total_tzs) };
      });
      Object.entries(lastSlotsInv).forEach(([d, v]) => {
        add(cageClosing, d, v.total);
        cageBucket(d).slots_total = v.total;
      });




      /**
       * Expenses column = approved operating expenses only. "Collection" is a
       * payout to the owner and is shown as a reference column (Collections).
       * Wallets logic: approved, not voided, not a reversal, and either an
       * office expense or the business day is closed.
       */
      const isCollectionCat = (row: any) => {
        const gc = String(row?.fin_categories?.group_code || row?.category?.group_code || "").toLowerCase();
        const name = String(row?.fin_categories?.name || row?.category?.name || "").toLowerCase();
        return gc.includes("collection") || name.includes("collection");
      };
      const isApprovedExpense = (e: any) => e.approved === true && !e.voided_at && e.reversal_of === null;
      const isOfficeExpense = (e: any) => String(e.source || "") === "office";
      const expByDate: Bucket = {}, bankExpByDate: Bucket = {}, collectionsByDate: Bucket = {};
      const expDetail: Record<string, Record<string, number>> = {};
      expenses.filter((e) => isApprovedExpense(e) && (isOfficeExpense(e) || closedDays.has(e.business_date))).forEach((e) => {
        const v = tzs(e);
        if (isCollectionCat(e)) {
          add(collectionsByDate, e.business_date, v);
          return;
        }
        add(expByDate, e.business_date, v);
        const label = e.fin_categories?.name || e.description || "Other";
        ((expDetail[e.business_date] ??= {}))[label] =
          (expDetail[e.business_date]?.[label] || 0) + v;
        if (isBankKind(walletKind[e.wallet_id])) add(bankExpByDate, e.business_date, v);
      });


      const collections: Bucket = {}, officeIn: Bucket = {}, officeOut: Bucket = {};
      const trfToManager: Bucket = {}, trfToBank: Bucket = {}, ownerIn: Bucket = {};
      const officeMoves: Record<string, TransferDetail[]> = {};
      const cageCasinoRunning: Bucket = {};
      const cageRunning: Bucket = {}, officeRunning: Bucket = {}, bankRunning: Bucket = {};


      const bankTzsRunning: Bucket = {}, bankUsdRunning: Bucket = {};
      const walletCurrency: Record<string, string> = {};
      wallets.forEach((w) => { walletCurrency[w.id] = w.currency || "TZS"; });
      // Cage Casino wallets: the live/slots cage safes. Live data stores them as
      // the short kind "safe" (Safe Live / Safe Slots); the long enum names are
      // kept for legacy rows.
      const CASINO_CAGE_KINDS = new Set(["safe", "cage_table", "cage_slot"]);


      const walletName: Record<string, string> = {};
      wallets.forEach((w) => { walletName[w.id] = w.name; });
      const bankTransfers: Record<string, TransferDetail[]> = {};
      const managerTransfers: Record<string, TransferDetail[]> = {};

      const txByDate: Record<string, any[]> = {};
      const isTransferLeg = (t: any) =>
        t.kind === "transfer" || t.kind === "transfer_in" || t.kind === "transfer_out";
      walletTx
        // Only confirmed (posted) movements move money. Pending ones are ignored.
        .filter((t) => t.posted_at)
        .forEach((t) => {
          (txByDate[t.business_date] ??= []).push(t);
          const kind = walletKind[t.wallet_id];
          const v = signedWalletTxTzs(t);
          const collection = t.kind === "collection" || isCollectionCat(t);
          if (collection) add(collections, t.business_date, Math.abs(v));
          // Owner deposits into the business
          if ((t.kind === "external_income" || t.kind === "income") && v > 0) {
            add(ownerIn, t.business_date, v);
          }
          if (isTransferLeg(t) && isBankKind(kind)) {
            if (v > 0) add(trfToBank, t.business_date, v);
            (bankTransfers[t.business_date] ??= []).push({
              amount: v,
              from: v > 0 ? "Casino" : walletName[t.wallet_id] || "Bank",
              to: v > 0 ? walletName[t.wallet_id] || "Bank" : "Casino",
            });
          }
          if (isOfficeKind(kind) && !isTransferLeg(t)) {
            // Office receives money with "+" and sends it out with "−".
            if (v >= 0) add(officeIn, t.business_date, v);
            else add(officeOut, t.business_date, Math.abs(v));
            (officeMoves[t.business_date] ??= []).push({
              amount: v,
              from: v >= 0 ? t.note || "Income" : walletName[t.wallet_id] || "Office",
              to: v >= 0 ? walletName[t.wallet_id] || "Office" : t.note || "Payment",
            });
          }
        });

      /**
       * Transfer (Cage → Manager): an incoming transfer leg into office_safe is
       * only counted when the same day has a matching outgoing cage leg.
       */
      Object.entries(txByDate).forEach(([d, list]) => {
        const cageOut = list
          .filter((t) => isTransferLeg(t) && CAGE_KINDS.has(walletKind[t.wallet_id]) && signedWalletTxTzs(t) < 0)
          .map((t) => ({ amount: Math.abs(signedWalletTxTzs(t)), name: walletName[t.wallet_id] || "Cage" }));
        list
          .filter((t) => isTransferLeg(t) && isOfficeKind(walletKind[t.wallet_id]) && signedWalletTxTzs(t) > 0)
          .forEach((t) => {
            const v = signedWalletTxTzs(t);
            const i = cageOut.findIndex((x) => Math.abs(x.amount - v) < 1);
            if (i >= 0) {
              const src = cageOut[i].name;
              cageOut.splice(i, 1);
              add(trfToManager, d, v);
              (managerTransfers[d] ??= []).push({
                amount: v,
                from: src,
                to: walletName[t.wallet_id] || "Manager safe",
              });
            }
          });
      });



      /**
       * WALLET BALANCE = LAST PHYSICAL COUNT. Nothing else.
       * No starting floats, no ledger replay, no accumulation of movements:
       * the balance of a wallet on a given day is exactly the amount written
       * down at the most recent physical count on or before that day.
       */
      const countsByWallet: Record<string, { d: string; ts: number; tzs: number; units: number }[]> = {};
      /**
       * A count taken while the current business day is still OPEN actually
       * closes the previous (already closed) business day: the money is counted
       * after the shift ends, before the new day's results exist. Without this
       * the last closed row shows stale money and Variance never converges
       * until the next morning.
       */
      const moneyDateOf = (iso: string) => {
        const bd = businessDateOf(iso);
        if (closedDays.has(bd)) return bd;
        const prev = prevDate(bd);
        return closedDays.has(prev) ? prev : bd;
      };
      (walletCounts as any[]).forEach((c: any) => {
        if (!c.wallet_id) return;
        (countsByWallet[c.wallet_id] ??= []).push({
          d: moneyDateOf(c.created_at),
          ts: new Date(c.created_at).getTime(),
          tzs: num(c.physical_total_tzs) || num(c.physical_total),
          units: num(c.physical_total),
        });
      });
      // Several counts can happen on the same business day — order by the exact
      // timestamp so "last count of the day" is really the last one.
      Object.values(countsByWallet).forEach((l) =>
        l.sort((a, b) => (a.d === b.d ? a.ts - b.ts : a.d < b.d ? -1 : 1)),
      );
      /** Last recorded count of a wallet as of `d` (null when never counted). */
      const countAt = (wid: string, d: string) => {
        const l = countsByWallet[wid];
        if (!l) return null;
        let r: { d: string; ts: number; tzs: number; units: number } | null = null;
        for (const c of l) { if (c.d <= d) r = c; else break; }
        return r;
      };


      /** Per-wallet balance of the LAST day of the range (drill-down panels). */
      const perWallet: Record<string, number> = {};
      const perWalletUnits: Record<string, number> = {};
      const officeWalletsByDate: Record<string, WalletBalance[]> = {};
      const bankWalletsByDate: Record<string, WalletBalance[]> = {};
      const moneyByDate: Record<string, MoneyWallet[]> = {};
      const officeWallets = wallets.filter((w) => isOfficeKind(w.kind));
      const bankWallets = wallets.filter((w) => isBankKind(w.kind));
      /**
       * Every wallet lands in exactly one money bucket, so
       * Money = Cage Casino + Cage Manager + Bank always equals the Grand Total
       * of the Wallets screen for that date — nothing can fall between buckets.
       */
      const bucketOf = (kind: string): MoneyBucket =>
        isBankKind(kind) ? "bank" : isOfficeKind(kind) ? "office" : "cage";
      const isMobileKind = (kind: string, name: string) =>
        kind === "mobile_money" || /airtel|airtell|tigo|halo|mpesa|m-pesa|pesa/i.test(name);

      for (const d of enumerateDates(from, to)) {
        let cageCasinoBal = 0, cageBal = 0, officeBal = 0, bankTzsBal = 0, bankUsdBal = 0;
        const detail: MoneyWallet[] = [];
        wallets.forEach((w) => {
          const c = countAt(w.id, d);
          const v = c?.tzs ?? 0;
          const bucket = bucketOf(w.kind);
          detail.push({
            name: w.name,
            kind: w.kind,
            currency: w.currency || "TZS",
            units: c?.units ?? 0,
            tzs: v,
            bucket,
            mobile: isMobileKind(w.kind, w.name),
          });
          if (!c) return;
          perWallet[w.id] = v;
          perWalletUnits[w.id] = c.units;
          if (bucket === "cage") { cageCasinoBal += v; cageBal += v; }
          else if (bucket === "office") officeBal += v;
          else if ((walletCurrency[w.id] || "TZS") === "TZS") bankTzsBal += v;
          else bankUsdBal += v;
        });
        moneyByDate[d] = detail;
        cageCasinoRunning[d] = cageCasinoBal;
        cageRunning[d] = cageBal;
        officeRunning[d] = officeBal;
        bankRunning[d] = bankTzsBal + bankUsdBal;
        bankTzsRunning[d] = bankTzsBal;
        bankUsdRunning[d] = bankUsdBal;

        const snapshotOf = (list: typeof officeWallets) =>
          list.map((w) => {
            const c = countAt(w.id, d);
            return {
              name: w.name,
              currency: w.currency || "TZS",
              balance: c?.tzs ?? 0,
              units: c?.units ?? 0,
            };
          });
        officeWalletsByDate[d] = snapshotOf(officeWallets);
        bankWalletsByDate[d] = snapshotOf(bankWallets);
      }







      const chipMiss: Bucket = {}, chipFloat: Bucket = {};
      const chipsDetail: Record<string, ChipDetail[]> = {};
      // Chip float — already reduced server-side to the latest snapshot per
      // date/location/denomination (chip_float_daily RPC).
      const floatByDenom: Record<string, Record<number, number>> = {};
      chipSnaps.forEach((c: any) => {
        const d = String(c.date).slice(0, 10);
        const dn = num(c.denomination);
        const q = num(c.quantity);
        add(chipFloat, d, q * dn);
        const bucket = (floatByDenom[d] ??= {});
        bucket[dn] = (bucket[dn] || 0) + q;
      });


      /**
       * Chip Diff of a day = Miss Chips of that day, exactly as in the
       * /reports/miss-chips page: the sum of `closing_count.chip_miss_total`
       * of the shifts closed on that business day (EAT 07:00 rollover).
       * Per-day figure — never cumulative.
       */
      const missByDenomDate: Record<string, Record<number, number>> = {};
      const cardsMiss: Bucket = {};
      shifts
        .filter((s) => s.closed_at)
        .forEach((s) => {
          const d = businessDateOf(s.opened_at);
          const cc = (s.closing_count as any) || {};
          // Negative sign: miss chips reduce the expected balance.
          add(chipMiss, d, -num(cc.chip_miss_total));
          const by = (cc.chip_miss_by_denom || {}) as Record<string, unknown>;
          const bucket = (missByDenomDate[d] ??= {});
          Object.entries(by).forEach(([dn, q]) => {
            const den = num(dn);
            if (!den) return;
            bucket[den] = (bucket[den] || 0) + num(q);
          });
        });
      // Missed cards come from cage slots shifts — negative sign like miss chips.
      slotShifts.forEach((s) => {
        const d = String(s.business_date).slice(0, 10);
        add(cardsMiss, d, -num(s.cards_miss));
      });

      const chipDates = new Set([...Object.keys(missByDenomDate), ...Object.keys(floatByDenom)]);
      chipDates.forEach((date) => {
        const miss = missByDenomDate[date] || {};
        const fl = floatByDenom[date] || {};
        const denoms = new Set([...Object.keys(miss), ...Object.keys(fl)].map(Number));
        chipsDetail[date] = Array.from(denoms).map((dn) => ({
          denomination: dn,
          quantity: fl[dn] ?? 0,
          miss: miss[dn] ?? 0,
        }));
      });
      Object.values(chipsDetail).forEach((l) => l.sort((a, b) => b.denomination - a.denomination));



      const tipsTables: Bucket = {}, tipsSlots: Bucket = {};
      tips.filter((t) => !t.cancelled_at).forEach((t) => add(tipsTables, t.business_date, num(t.amount)));
      slotTips.forEach((t) => add(tipsSlots, dateOnly(t.created_at), num(t.amount)));

      const bar: Bucket = {};
      posOrders.filter((o) => o.status !== "void").forEach((o) => add(bar, o.business_date, num(o.total_tzs)));

      /**
       * Other incomes (JP + non-JP) converted to TZS. Reversed rows are excluded.
       * Non-JP incomes feed the OFFICE columns: positive → Office (+),
       * negative → Office (−) as an absolute value.
       */
      const otherIncPos: Bucket = {};
      const otherIncNeg: Bucket = {};
      const jpByDate: Bucket = {};
      (otherIncomeRows as any[]).filter((f) => !f.reversed_by_id && !f.reverses_id).forEach((f) => {
        const fx = num(f.fx_rate) || 1;
        const amt = String(f.currency || "TZS") === "TZS" ? num(f.amount) : num(f.amount) * fx;
        const d = String(f.business_date).slice(0, 10);
        if (String(f.source || "") === "jp") {
          add(jpByDate, d, amt);
        } else if (amt >= 0) {
          add(otherIncPos, d, amt);
        } else {
          add(otherIncNeg, d, -amt);
        }
      });



      const legacyByDate: Record<string, any> = {};
      legacy.forEach((l) => { legacyByDate[l.business_date] = l; });

      // ---- build rows ---------------------------------------------------
      let lastRate = 0, lastCage = 0, lastOffice = 0, lastBank = 0, lastChips = 0;
      /**
       * Daily Balance = opening money + result + diff + fees + office net
       *                 − expenses − closing money  → 0.
       * The opening money of the first day comes from the "Start" row
       * (fin_month_start), afterwards it is the previous day's Money total.
       */
      const ms = (monthStart as any[])[0] || null;
      const startRow = {
        cage: num(ms?.cage_casino),
        manager: num(ms?.cage_manager),
        bankTzs: num(ms?.bank_tzs),
        bankUsd: num(ms?.bank_usd),
        diff: num(ms?.diff_total),
        tips: num(ms?.tips_total),
      };
      const startingBalance = ms
        ? startRow.cage + startRow.manager + startRow.bankTzs + startRow.bankUsd
        : manualStart;
      /**
       * Money columns only exist from the recorded Start date onwards — the days
       * before it keep results and expenses only.
       */
      const moneyFrom: string = ms?.start_date ? String(ms.start_date).slice(0, 10) : "";

      const snapByDate: Record<string, any> = {};
      (daySnaps as any[]).forEach((s) => {
        snapByDate[String(s.business_date).slice(0, 10)] = s.data || {};
      });
      let lastBankTzs = 0, lastBankUsd = 0, prevMoney = startingBalance, firstRow = true;
      let lastOfficeWallets: WalletBalance[] = [];
      const bankWalletDefs = wallets.filter((w) => isBankKind(w.kind));


      return enumerateDates(from, to).map((date) => {
        const rate = rateByDate[date] || lastRate || FALLBACK_USD_RATE;
        lastRate = rate;

        const l = legacyByDate[date];
        const tables = tablesRes[date] ?? shiftTables[date] ?? 0;
        const slotsNet = (slotsRes[date] ?? 0) - (cardBal[date] ?? 0);
        const barV = bar[date] ?? 0;

        /**
         * STOCKS (safe / bank balances) are the state AT THAT MOMENT: the wallet
         * balance as of the end of that day. On a day with no movement the
         * balance simply stays the same — that is a snapshot, not an accumulation.
         * FLOWS (in / out / expenses / results) are strictly per-day and never
         * carried over.
         */
        lastCage = cageRunning[date] ?? lastCage;
        lastOffice = officeRunning[date] ?? lastOffice;
        lastOfficeWallets = officeWalletsByDate[date] ?? lastOfficeWallets;
        lastBank = bankRunning[date] ?? lastBank;
        lastBankTzs = bankTzsRunning[date] ?? lastBankTzs;
        lastBankUsd = bankUsdRunning[date] ?? lastBankUsd;
        lastChips = chipFloat[date] ?? lastChips;

        const hasSystemData =
          tablesRes[date] != null || slotsRes[date] != null || cashDesk[date] != null ||
          expByDate[date] != null || bar[date] != null || txByDate[date] != null;

        /** Credit / Deposit is a MANUAL field — stored in fin_legacy_balance. */
        const manualCredit = l?.credit_deposit != null ? num(l.credit_deposit) : 0;

        /** Casino Monthly Balance derived block (shared by legacy + live rows). */
        const cmb = (o: {
          cageCasino: number; cashPart: number; cashlessPart: number; carried: boolean;
          manager: number; bankTzs: number; bankUsd: number;
          expenses: number; inV: number; outV: number; result: number;
          live: number; slotsDiff: number; chipDiff: number;
          tips?: number; officeIn?: number; officeOut?: number; jp?: number;
          missedCards?: number; collections?: number;
        }) => {
          // Cage Casino = live ledger of cage_table + cage_slot only (no snap).
          const cageCasino = o.cageCasino;
          /**
           * Manager / Bank come from the SAME source as Cage Casino: the last
           * physical wallet count on or before that date. `countAt` is already
           * date-aware, so a later count never changes a past day — the old
           * `fin_day_balance_snapshot` freeze is not used any more (it mixed
           * two sources and made Money differ from the Wallets Grand Total).
           */
          const snap = snapByDate[date];
          const manager = o.manager;
          const bankTzs = o.bankTzs;
          const bankUsd = o.bankUsd;
          // bank_usd is ALREADY stored converted to TZS (ledger uses amount_tzs).
          const bankTotal = bankTzs + bankUsd;
          // Money hidden for the days that precede the recorded Start.
          const hidden = !!moneyFrom && date < moneyFrom;
          const moneyTotal = hidden ? 0 : cageCasino + manager + bankTotal;
          const opening = firstRow ? startingBalance : prevMoney;
          firstRow = false;
          const jpV = o.jp ?? 0;
          const missedCardsV = o.missedCards ?? 0;
          // Diff = Miss Chips + Missed Cards + Slots Diff.
          const diffTotal = o.chipDiff + o.slotsDiff + missedCardsV;
          // OFFICE (+ / −) comes from Other Incomes, split by sign.
          const officeInV = o.officeIn ?? 0;
          const officeOutV = o.officeOut ?? 0;
          const officeNet = officeInV - officeOutV;

          // JP is part of the Casino Result block.
          const resultV = o.result + jpV;
          const collectionsV = o.collections ?? 0;
          // Variance = Money yesterday + Result ± Diff − Expenses ± Office − Money today.
          const variance = hidden
            ? 0
            : opening + resultV + diffTotal - o.expenses + officeNet - moneyTotal;
          // Carry the last recorded money forward when a day has no record at all.
          if (!hidden && moneyTotal !== 0) prevMoney = moneyTotal;
          return {
            casino_result: resultV,
            live_cash_result: o.live,
            slots_diff: o.slotsDiff,
            diff_total: diffTotal,
            cage_casino: hidden ? 0 : cageCasino,
            cage_cash_part: o.cashPart,
            cage_cashless_part: o.cashlessPart,
            cage_carried: o.carried,
            // Manual figure until the Wallets transfer screen exists.
            transfer_cage_manager: num(l?.office_transfer),
            cage_manager: hidden ? 0 : manager,
            transfer_bank: num(l?.collection_bank),
            bank_tzs: hidden ? 0 : bankTzs,
            bank_usd: hidden ? 0 : bankUsd,
            bank_usd_raw: rate ? (hidden ? 0 : bankUsd) / rate : 0,
            bank_tzs_manual: false,
            bank_usd_manual: false,
            money_in: officeInV,
            money_out: officeOutV,
            other_income: 0,
            jp: jpV,
            missed_cards: missedCardsV,
            collections: collectionsV,
            money_total: moneyTotal,
            money_hidden: hidden,
            // P&L of the day — Casino Result − Expenses ± Diff.
            fin_result: resultV + diffTotal - o.expenses,
            balance: variance,
            balance_check: opening + resultV + diffTotal + officeNet - o.expenses,

            chips_detail: chipsDetail[date] ?? [],
            cage_detail: cageDetail[date] ?? { cash: [], cashless: [], mobile: {}, slots_total: 0 },
            money_detail: hidden ? [] : (moneyByDate[date] ?? []),
            transfers_manager: managerTransfers[date] ?? [],
            transfers_bank: bankTransfers[date] ?? [],
            office_wallets: lastOfficeWallets,
            bank_wallets: bankWalletsByDate[date] ?? bankWalletDefs.map((w) => ({
              name: w.name,
              currency: w.currency || "TZS",
              balance: 0,
              units: 0,
            })),
            office_movements: officeMoves[date] ?? [],
            expenses_detail: Object.entries(expDetail[date] ?? {})
              .map(([label, value]) => ({ label, value }))
              .sort((a, b) => b.value - a.value),
            tips_total: o.tips ?? 0,
            snapshot: !!snap,
          };
        };






        if (!hasSystemData && l) {
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
            bank_account: num(l.bank_account),
            bank_expenses: num(l.bank_expenses),
            credit_deposit: manualCredit,
            expenses: num(l.expenses),
            chips_float: num(l.chips_float),
            day_total: lTotal,
            day_balance: num(l.cash_desk_result) - lTotal,
            ...cmb({
              cageCasino: num(l.cage_cash), cashPart: num(l.cage_cash), cashlessPart: 0, carried: false,
              manager: num(l.office_cash),
              bankTzs: num(l.bank_account), bankUsd: 0,
              expenses: num(l.expenses) + num(l.bank_expenses),
              inV: num(l.office_in), outV: num(l.office_out) + num(l.collection_bank),
              result: num(l.casino_result),
              live: num(l.cash_desk_result), slotsDiff: 0,
              chipDiff: num(l.chip_difference),
              tips: num(l.tips_tables) + num(l.tips_slots),
              officeIn: num(l.office_in), officeOut: num(l.office_out),
              jp: 0, missedCards: 0, collections: num(l.collection_bank),

            }),
            legacy: true,
            hasSystemData: false,
            day_closed: true,
          } satisfies DailyBalanceRow;
        }


        const dayTotal = tables + slotsNet + barV + manualCredit;
        const cdr = cashDesk[date] ?? 0;
        // Cage Casino = running ledger of cage_table + cage_slot wallets only.
        const cashPart = cageClosing[date] ?? null;
        const cashlessPart = cageCashless[date] ?? 0;
        const carried = false;
        const cageCasino = cageCasinoRunning[date] ?? 0;
        const expensesV = expByDate[date] ?? 0;
        return {
          date,
          weekday: WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()],
          rate_usd: rate,
          casino_result: tables + slotsNet + barV,
          cash_desk_result: cdr,
          tables_result: tables,
          slots_result: slotsNet,
          bar_result: barV,
          // Cage Cash = closing cash of LIVE + SLOTS cage shifts (reference only)
          cage_cash: (cashPart ?? 0) + cashlessPart,
          collection_bank: collectionsByDate[date] ?? 0,
          chip_difference: chipMiss[date] ?? 0,
          tips_tables: tipsTables[date] ?? 0,
          tips_slots: tipsSlots[date] ?? 0,
          office_cash: lastOffice,
          office_transfer: (officeIn[date] ?? 0) - (officeOut[date] ?? 0),
          office_in: officeIn[date] ?? 0,
          office_out: officeOut[date] ?? 0,
          bank_account: lastBank,
          bank_expenses: bankExpByDate[date] ?? 0,
          credit_deposit: manualCredit,
          expenses: expensesV,
          chips_float: lastChips,
          day_total: dayTotal,
          day_balance: cdr - dayTotal,
          ...cmb({
            cageCasino,
            cashPart: cashPart ?? 0,
            cashlessPart,
            carried,
            manager: lastOffice,
            bankTzs: lastBankTzs, bankUsd: lastBankUsd,
            expenses: expensesV,
            inV: officeIn[date] ?? 0,
            outV: officeOut[date] ?? 0,
            result: tables + slotsNet + barV,
            live: liveCashDesk[date] ?? 0,
            slotsDiff: cardBal[date] ?? 0,
            chipDiff: chipMiss[date] ?? 0,
            tips: (tipsTables[date] ?? 0) + (tipsSlots[date] ?? 0),
            officeIn: otherIncPos[date] ?? 0,
            officeOut: otherIncNeg[date] ?? 0,

            jp: jpByDate[date] ?? 0,
            missedCards: cardsMiss[date] ?? 0,
            collections: collectionsByDate[date] ?? 0,
          }),
          legacy: false,
          hasSystemData,
          day_closed: closedDays.has(date),
        } satisfies DailyBalanceRow;

      });


    },
  });
};

/**
 * Credit / Deposit is a manual figure — persisted per casino+date in
 * `fin_legacy_balance` (upsert), so it survives alongside live data.
 */
export const useSetCreditDeposit = () => {
  const qc = useQueryClient();
  const { activeCasinoId } = useCasino();
  return useMutation({
    mutationFn: async ({ date, value }: { date: string; value: number }) => {
      if (!activeCasinoId) throw new Error("No casino");
      const { error } = await (supabase as any)
        .from("fin_legacy_balance")
        .upsert(
          { casino_id: activeCasinoId, business_date: date, credit_deposit: value, source: "manual" },
          { onConflict: "casino_id,business_date" },
        );
      if (error) throw error;
    },
    onSuccess: () => invalidateFinance(qc),
    onError: (e: any) => toast.error(e.message),
  });
};

/**
 * Bank balances (TZS / USD) are manual end-of-day figures, edited inline in the
 * Casino Monthly Balance grid and stored in `fin_legacy_balance`.
 */
/** Manual columns of the report, stored per day in `fin_legacy_balance`. */
export type ManualLegacyField =
  | "bank_account"
  | "bank_account_usd"
  | "tips_tables"
  | "office_transfer"
  | "office_in"
  | "office_out"
  | "collection_bank";


export const useSetBankBalance = () => {
  const qc = useQueryClient();
  const { activeCasinoId } = useCasino();
  return useMutation({
    mutationFn: async (
      { date, field, value }: { date: string; field: ManualLegacyField; value: number },
    ) => {
      if (!activeCasinoId) throw new Error("No casino");
      const { error } = await (supabase as any)
        .from("fin_legacy_balance")
        .upsert(
          { casino_id: activeCasinoId, business_date: date, [field]: value, source: "manual" },
          { onConflict: "casino_id,business_date" },
        );
      if (error) throw error;
    },
    onSuccess: () => invalidateFinance(qc),
    onError: (e: any) => toast.error(e.message),
  });
};

/** Opening money of the month ("Start" row) — stored in `fin_month_start`. */
export type MonthStartField = "cage_casino" | "cage_manager" | "bank_tzs" | "bank_usd";

export const useMonthStart = (month: string) => {
  const { activeCasinoId } = useCasino();
  return useQuery({
    queryKey: ["fin-month-start", activeCasinoId, month],
    enabled: !!activeCasinoId && !!month,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("fin_month_start")
        .select("*")
        .eq("casino_id", activeCasinoId)
        .eq("month", `${month}-01`)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });
};

export const useSetMonthStart = (month: string) => {
  const qc = useQueryClient();
  const { activeCasinoId } = useCasino();
  return useMutation({
    mutationFn: async ({ field, value }: { field: MonthStartField; value: number }) => {
      if (!activeCasinoId) throw new Error("No casino");
      const { error } = await (supabase as any)
        .from("fin_month_start")
        .upsert(
          { casino_id: activeCasinoId, month: `${month}-01`, [field]: value },
          { onConflict: "casino_id,month" },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fin-month-start"] });
      invalidateFinance(qc);
    },
    onError: (e: any) => toast.error(e.message),
  });
};
