/**
 * Company → Daily Balance (Office Monthly Balance) — one row per business day,
 * company-wide, all figures TZS.
 *
 * Single model: "everything is Wallets". The money of the company sits in
 * three places and every one of them drills down to the very wallets shown on
 * the Wallets page:
 *
 *   Cage Casino  — live cage + slots cage at closing (money only, chips excluded)
 *   Cage Office  — wallets flagged `is_office` (currency safes + mobile money)
 *   Bank         — wallets of kind `bank`
 *
 * Daily control:
 *   Money yesterday + Result ± Diff − Expenses − OUT/IN − Money today = 0
 *
 * Transfers between the office and the casinos are INTERNAL for a company-wide
 * report (both legs live inside Money total), so they are shown for information
 * only and never enter the control formula.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchPaged } from "@/lib/fetch-paged";
import { signedWalletTxTzs } from "@/lib/wallet-tx-sign";
import { businessDateOf } from "@/lib/business-day";
import { enumerateDates, FALLBACK_USD_RATE } from "@/hooks/use-daily-balance-report";

export interface OfficeCasinoRef {
  id: string;
  name: string;
}

/** One line of any drill-down panel — same shape for every column. */
export interface DrillLine {
  label: string;
  /** Optional right-aligned context (currency, casino, wallet kind). */
  sub?: string;
  value: number;
}

export interface OfficeBalanceRow {
  date: string;
  weekday: string;
  /** Recorded = every active casino confirmed its wallets for that day. */
  status: "pending" | "recorded";
  /** Tables + Slots (net of card balance) + Bar + JP. */
  result: number;
  /** Chip difference + players card balance. */
  diff: number;
  cage_casino: number;
  cage_office: number;
  bank: number;
  expenses: number;
  /** Office → casino transfers (informational, internal move). */
  transfer_casino: number;
  /** Collections: positive = OUT (money left the company), negative = IN. */
  collections_net: number;
  /** Cage Casino + Cage Office + Bank at the end of the day. */
  money_total: number;
  /** Money yesterday + Result ± Diff − Expenses − OUT/IN − Money today (≈ 0). */
  balance: number;
  fin_result: number;
  // ---- drill-downs (same shape everywhere) --------------------------
  cage_casino_detail: DrillLine[];
  cage_office_detail: DrillLine[];
  bank_detail: DrillLine[];
  result_detail: DrillLine[];
  diff_detail: DrillLine[];
  expenses_detail: DrillLine[];
  transfer_detail: DrillLine[];
  collections_detail: DrillLine[];
}

/** Month aggregate per casino: gaming result, casino expenses, profit. */
export interface OfficeCasinoStat {
  result: number;
  expenses: number;
  profit: number;
}

export interface OfficeStart {
  cage_casino: number;
  cage_office: number;
  bank: number;
  /** Business day of the first Record — the report starts the day after Start. */
  started_on: string | null;
}

export interface OfficeBalanceData {
  casinos: OfficeCasinoRef[];
  rows: OfficeBalanceRow[];
  casino_stats: Record<string, OfficeCasinoStat>;
  /** Opening money of the month (Cage Casino + Office + Bank). */
  start_money: number;
  start: OfficeStart;
  /** True when the Start row is the manual one (first month of the report). */
  start_editable: boolean;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const dateOnly = (v: unknown) => String(v ?? "").slice(0, 10);

export const monthBoundsOf = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
};

const isBankKind = (k: string) => k === "bank" || k === "bank_account";
const CAGE_KINDS = new Set(["safe", "cage_table", "cage_slot", "main_cash"]);
const isTransferLeg = (t: any) =>
  t.kind === "transfer" || t.kind === "transfer_in" || t.kind === "transfer_out";

const sumProviders = (j: any) =>
  j && typeof j === "object" ? Object.values(j).reduce<number>((s, v) => s + num(v), 0) : 0;

/** Company-wide daily balance. `month` = YYYY-MM. */
export const useOfficeBalanceReport = (month: string, enabled = true) => {
  const { from, to } = monthBoundsOf(month);

  return useQuery({
    queryKey: ["office-balance-report", month],
    enabled: enabled && !!month,
    staleTime: 30_000,
    queryFn: async (): Promise<OfficeBalanceData> => {
      const sb = supabase as any;

      const [
        casinos, wallets, startRows, expenses, tx, dayClosings,
        shifts, slotsInv, posOrders, jpRows, snaps,
      ] = await Promise.all([
        fetchPaged<any>((a, b) =>
          sb.from("casinos").select("id, name, is_active").order("name").range(a, b)),
        fetchPaged<any>((a, b) =>
          sb.from("fin_wallets")
            .select("id, casino_id, name, kind, currency, is_office, starting_float_amount, starting_float_date")
            .range(a, b)),
        fetchPaged<any>((a, b) =>
          sb.from("fin_report_start").select("*").eq("scope", "company").range(a, b)),
        fetchPaged<any>((a, b) =>
          sb.from("expenses")
            .select("id, casino_id, business_date, amount, amount_tzs, description, source, voided_at, fin_category_id, fin_categories(name, group_code)")
            .gte("business_date", from).lte("business_date", to).range(a, b)),
        fetchPaged<any>((a, b) =>
          sb.from("fin_wallet_tx")
            .select("id, casino_id, wallet_id, kind, amount, amount_tzs, business_date, note, posted_at")
            .lte("business_date", to).range(a, b)),
        fetchPaged<any>((a, b) =>
          sb.from("fin_day_closing")
            .select("casino_id, business_date, tables_result, slots_result, players_card_balance")
            .gte("business_date", from).lte("business_date", to).range(a, b)),
        fetchPaged<any>((a, b) =>
          sb.from("shifts")
            .select("casino_id, opened_at, closed_at, closing_count, closing_cash, cashless_in_providers, cashless_out_providers")
            .not("closed_at", "is", null)
            .gte("opened_at", `${from}T00:00:00Z`)
            .lte("opened_at", `${to}T23:59:59Z`).range(a, b)),
        fetchPaged<any>((a, b) =>
          sb.from("cage_slots_cash_inventory")
            .select("casino_id, total_tzs, inventory_type, created_at, cage_slots_shifts!inner(business_date)")
            .eq("inventory_type", "closing")
            .gte("cage_slots_shifts.business_date", from)
            .lte("cage_slots_shifts.business_date", to).range(a, b)),
        fetchPaged<any>((a, b) =>
          sb.from("pos_orders")
            .select("casino_id, business_date, total_tzs, status")
            .gte("business_date", from).lte("business_date", to).range(a, b)),
        fetchPaged<any>((a, b) =>
          sb.from("fin_other_incomes")
            .select("casino_id, business_date, amount, currency, fx_rate, source, reversed_by_id")
            .eq("source", "jp")
            .gte("business_date", from).lte("business_date", to).range(a, b)),
        fetchPaged<any>((a, b) =>
          sb.from("fin_day_balance_snapshot")
            .select("casino_id, business_date, data")
            .gte("business_date", from).lte("business_date", to).range(a, b)),
      ]);

      const casinoList: OfficeCasinoRef[] = casinos
        .filter((c: any) => c.is_active !== false)
        .map((c: any) => ({ id: c.id, name: c.name }));
      const casinoName: Record<string, string> = {};
      casinoList.forEach((c) => { casinoName[c.id] = c.name; });

      const startRow = (startRows as any[])[0] || null;
      const start: OfficeStart = {
        cage_casino: num(startRow?.cage_casino),
        cage_office: num(startRow?.cage_office),
        bank: num(startRow?.bank),
        started_on: startRow?.started_on ? dateOnly(startRow.started_on) : null,
      };

      const wById: Record<string, any> = {};
      wallets.forEach((w: any) => { wById[w.id] = w; });
      const isOfficeWallet = (w: any) => !!w?.is_office;

      type Bucket = Record<string, number>;
      const add = (b: Bucket, d: string, v: number) => { b[d] = (b[d] || 0) + v; };
      const push = (m: Record<string, DrillLine[]>, d: string, line: DrillLine) => {
        (m[d] ??= []).push(line);
      };

      // ---- Result: tables + slots (net of card balance) + bar + JP -------
      const resultByDate: Bucket = {}, diffByDate: Bucket = {};
      const resultDetail: Record<string, DrillLine[]> = {};
      const diffDetail: Record<string, DrillLine[]> = {};
      const casinoRes: Record<string, number> = {};
      dayClosings.forEach((c: any) => {
        const d = dateOnly(c.business_date);
        const tables = num(c.tables_result);
        const card = num(c.players_card_balance);
        const slotsNet = num(c.slots_result) - card;
        const name = casinoName[c.casino_id] || "Casino";
        if (tables) push(resultDetail, d, { label: `${name} · Tables`, value: tables });
        if (slotsNet) push(resultDetail, d, { label: `${name} · Slots`, value: slotsNet });
        add(resultByDate, d, tables + slotsNet);
        if (card) {
          add(diffByDate, d, card);
          push(diffDetail, d, { label: `${name} · Card balance`, value: card });
        }
        if (c.casino_id) casinoRes[c.casino_id] = (casinoRes[c.casino_id] || 0) + tables + slotsNet;
      });
      posOrders.filter((o: any) => o.status !== "void").forEach((o: any) => {
        const d = dateOnly(o.business_date);
        const v = num(o.total_tzs);
        if (!v) return;
        add(resultByDate, d, v);
        if (o.casino_id) casinoRes[o.casino_id] = (casinoRes[o.casino_id] || 0) + v;
        push(resultDetail, d, { label: `${casinoName[o.casino_id] || "Casino"} · Bar`, value: v });
      });
      jpRows.filter((j: any) => !j.reversed_by_id).forEach((j: any) => {
        const d = dateOnly(j.business_date);
        const fx = num(j.fx_rate) || 1;
        const v = String(j.currency || "TZS") === "TZS" ? num(j.amount) : num(j.amount) * fx;
        if (!v) return;
        add(resultByDate, d, v);
        if (j.casino_id) casinoRes[j.casino_id] = (casinoRes[j.casino_id] || 0) + v;
        push(resultDetail, d, { label: `${casinoName[j.casino_id] || "Casino"} · JP`, value: v });
      });

      // ---- Diff: chip miss of the day (per closed shift) -----------------
      shifts.forEach((s: any) => {
        const d = businessDateOf(s.opened_at);
        const miss = num((s.closing_count as any)?.chip_miss_total);
        if (!miss) return;
        add(diffByDate, d, miss);
        push(diffDetail, d, { label: `${casinoName[s.casino_id] || "Casino"} · Miss chips`, value: miss });
      });

      // ---- Cage Casino: last closing of the day, per casino --------------
      /** casino → date → { live, slots } */
      const cagePerCasino: Record<string, Record<string, { live?: number; slots?: number }>> = {};
      const cageBucket = (casino: string, d: string) =>
        ((cagePerCasino[casino] ??= {})[d] ??= {});
      [...shifts]
        .sort((a, b) => String(a.closed_at || a.opened_at).localeCompare(String(b.closed_at || b.opened_at)))
        .forEach((s: any) => {
          const d = businessDateOf(s.opened_at);
          const ct = (s.closing_count as any)?.totals || {};
          const closing = num(ct.total_tzs)
            ? num(ct.total_tzs) - num(ct.chips_tzs)
            : num((s.closing_cash as any)?.actual) - num(ct.chips_tzs);
          const cashless =
            sumProviders(s.cashless_in_providers) - sumProviders(s.cashless_out_providers);
          cageBucket(s.casino_id, d).live = closing + cashless;
        });
      const lastSlots: Record<string, Record<string, { at: string; total: number }>> = {};
      slotsInv.forEach((i: any) => {
        const d = dateOnly(i.cage_slots_shifts?.business_date);
        if (!d) return;
        const at = String(i.created_at || "");
        const per = (lastSlots[i.casino_id] ??= {});
        if (!per[d] || at >= per[d].at) per[d] = { at, total: num(i.total_tzs) };
      });
      Object.entries(lastSlots).forEach(([casino, byDate]) => {
        Object.entries(byDate).forEach(([d, v]) => { cageBucket(casino, d).slots = v.total; });
      });

      // ---- Expenses / collections ---------------------------------------
      const expByDate: Bucket = {};
      const expDetail: Record<string, Record<string, number>> = {};
      const colByDate: Bucket = {};
      const colDetail: Record<string, DrillLine[]> = {};
      const casinoExp: Record<string, number> = {};
      const tzsOf = (e: any) => (e.amount_tzs != null ? num(e.amount_tzs) : num(e.amount));

      expenses.filter((e: any) => !e.voided_at).forEach((e: any) => {
        const d = dateOnly(e.business_date);
        const v = tzsOf(e);
        const isCollection = String(e.fin_categories?.group_code || "") === "collections";
        if (isCollection) {
          // Positive = OUT (money left the company), negative = IN (money back).
          add(colByDate, d, v);
          push(colDetail, d, {
            label: e.description || "Collection",
            sub: casinoName[e.casino_id],
            value: v,
          });
          return;
        }
        add(expByDate, d, v);
        const label = e.fin_categories?.name || e.description || "Other";
        ((expDetail[d] ??= {}))[label] = (expDetail[d]?.[label] || 0) + v;
        if (e.casino_id) casinoExp[e.casino_id] = (casinoExp[e.casino_id] || 0) + v;
      });

      // ---- Wallet running balances (office / bank / cage wallets) --------
      const posted = tx.filter((t: any) => t.posted_at);
      const txByDate: Record<string, any[]> = {};
      posted.forEach((t: any) => { (txByDate[dateOnly(t.business_date)] ??= []).push(t); });

      /** wallet id → running balance in TZS */
      const perWallet: Record<string, number> = {};
      wallets.forEach((w: any) => {
        const f = num(w.starting_float_amount);
        if (!f) return;
        const fd = w.starting_float_date ? dateOnly(w.starting_float_date) : "";
        if (fd && fd > to) return;
        perWallet[w.id] =
          (perWallet[w.id] || 0) + ((w.currency || "TZS") === "TZS" ? f : f * FALLBACK_USD_RATE);
      });
      const officeRunning: Bucket = {}, bankRunning: Bucket = {};
      const officeLines: Record<string, DrillLine[]> = {};
      const bankLines: Record<string, DrillLine[]> = {};
      const transferByDate: Bucket = {};
      const transferDetail: Record<string, DrillLine[]> = {};

      const officeWallets = wallets.filter(isOfficeWallet);
      const bankWallets = wallets.filter((w: any) => isBankKind(w.kind));
      const snapshotLines = (list: any[]) =>
        list.map((w) => ({
          label: `${w.name}${casinoName[w.casino_id] ? ` · ${casinoName[w.casino_id]}` : ""}`,
          sub: w.currency || "TZS",
          value: perWallet[w.id] || 0,
        }));

      Object.keys(txByDate).sort().forEach((d) => {
        for (const t of txByDate[d]) {
          const w = wById[t.wallet_id];
          if (!w) continue;
          perWallet[t.wallet_id] = (perWallet[t.wallet_id] || 0) + signedWalletTxTzs(t);
        }
        // Office → casino transfers: the outgoing leg of an office wallet that
        // has a matching cage incoming leg the same day.
        const cageIn = txByDate[d]
          .filter((t) => isTransferLeg(t) && CAGE_KINDS.has(wById[t.wallet_id]?.kind) && signedWalletTxTzs(t) > 0)
          .map((t) => ({ amount: signedWalletTxTzs(t), name: wById[t.wallet_id]?.name || "Cage" }));
        txByDate[d]
          .filter((t) => isTransferLeg(t) && isOfficeWallet(wById[t.wallet_id]) && signedWalletTxTzs(t) < 0)
          .forEach((t) => {
            const v = Math.abs(signedWalletTxTzs(t));
            const i = cageIn.findIndex((x) => Math.abs(x.amount - v) < 1);
            if (i < 0) return;
            const target = cageIn[i].name;
            cageIn.splice(i, 1);
            add(transferByDate, d, v);
            push(transferDetail, d, {
              label: `${wById[t.wallet_id]?.name || "Office"} → ${target}`,
              sub: casinoName[t.casino_id],
              value: v,
            });
          });
        officeRunning[d] = officeWallets.reduce((s, w) => s + (perWallet[w.id] || 0), 0);
        bankRunning[d] = bankWallets.reduce((s, w) => s + (perWallet[w.id] || 0), 0);
        officeLines[d] = snapshotLines(officeWallets);
        bankLines[d] = snapshotLines(bankWallets);
      });

      // ---- Recorded snapshots (Record button in Wallets) -----------------
      const snapByDate: Record<string, Record<string, any>> = {};
      (snaps as any[]).forEach((s) => {
        ((snapByDate[dateOnly(s.business_date)] ??= {}))[s.casino_id] = s.data || {};
      });

      const casinoStats: Record<string, OfficeCasinoStat> = {};
      casinoList.forEach((c) => {
        const result = casinoRes[c.id] || 0;
        const expensesV = casinoExp[c.id] || 0;
        casinoStats[c.id] = { result, expenses: expensesV, profit: result - expensesV };
      });

      // ---- build the rows -------------------------------------------------
      /** casino → last known cage figures (carried forward). */
      const lastCage: Record<string, { live: number; slots: number }> = {};
      let lastOffice = start.cage_office;
      let lastOfficeLines: DrillLine[] = snapshotLines(officeWallets);
      let lastBank = start.bank;
      let lastBankLines: DrillLine[] = snapshotLines(bankWallets);
      let cageSeeded = false;

      const startMoney = start.cage_casino + start.cage_office + start.bank;
      let prevMoney = startMoney;

      const rows = enumerateDates(from, to).map((date) => {
        // ---- Cage Casino: last closing per casino, carried forward -------
        const cageLines: DrillLine[] = [];
        let cageTotal = 0;
        casinoList.forEach((c) => {
          const today = cagePerCasino[c.id]?.[date];
          const prev = lastCage[c.id] || { live: 0, slots: 0 };
          const live = today?.live != null ? today.live : prev.live;
          const slots = today?.slots != null ? today.slots : prev.slots;
          lastCage[c.id] = { live, slots };
          if (live) cageLines.push({ label: `${c.name} · Live cage`, value: live });
          if (slots) cageLines.push({ label: `${c.name} · Slots cage`, value: slots });
          cageTotal += live + slots;
        });
        // Before the first closing of the report the manual Start figure stands.
        if (!cageTotal && !cageSeeded) cageTotal = start.cage_casino;
        else cageSeeded = true;

        // ---- Cage Office / Bank: recorded snapshot wins ------------------
        lastOffice = officeRunning[date] ?? lastOffice;
        lastOfficeLines = officeLines[date] ?? lastOfficeLines;
        lastBank = bankRunning[date] ?? lastBank;
        lastBankLines = bankLines[date] ?? lastBankLines;

        const daySnaps = snapByDate[date] || {};
        const recordedCasinos = Object.keys(daySnaps);
        const recorded =
          casinoList.length > 0 && casinoList.every((c) => recordedCasinos.includes(c.id));
        let office = lastOffice;
        let bank = lastBank;
        if (recordedCasinos.length) {
          office = recordedCasinos.reduce((s, id) => s + num(daySnaps[id].cage_manager), 0);
          bank = recordedCasinos.reduce(
            (s, id) => s + num(daySnaps[id].bank_tzs) + num(daySnaps[id].bank_usd), 0);
        }

        const result = resultByDate[date] ?? 0;
        const diff = diffByDate[date] ?? 0;
        const exp = expByDate[date] ?? 0;
        const col = colByDate[date] ?? 0;
        const trf = transferByDate[date] ?? 0;
        const moneyTotal = cageTotal + office + bank;
        const balance = prevMoney + result + diff - exp - col - moneyTotal;
        prevMoney = moneyTotal;

        return {
          date,
          weekday: WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()],
          status: (recorded ? "recorded" : "pending") as "recorded" | "pending",
          result,
          diff,
          cage_casino: cageTotal,
          cage_office: office,
          bank,
          expenses: exp,
          transfer_casino: trf,
          collections_net: col,
          money_total: moneyTotal,
          balance,
          fin_result: result + diff - exp,
          cage_casino_detail: cageLines,
          cage_office_detail: lastOfficeLines,
          bank_detail: lastBankLines,
          result_detail: resultDetail[date] ?? [],
          diff_detail: diffDetail[date] ?? [],
          expenses_detail: Object.entries(expDetail[date] ?? {})
            .map(([label, value]) => ({ label, value }))
            .sort((a, b) => b.value - a.value),
          transfer_detail: transferDetail[date] ?? [],
          collections_detail: colDetail[date] ?? [],
        } satisfies OfficeBalanceRow;
      });

      return {
        casinos: casinoList,
        casino_stats: casinoStats,
        rows,
        start_money: startMoney,
        start,
        // The Start figures are typed by hand only until the first Record;
        // afterwards every month carries over from the previous one.
        start_editable: !start.started_on || start.started_on >= from,
      };
    },
  });
};

export const OFFICE_FALLBACK_RATE = FALLBACK_USD_RATE;
