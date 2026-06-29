/**
 * ShiftClosingReport — printable consolidating cash desk report.
 *
 * Mirrors the legacy paper form: tables (Open / Fill / Credit / Close / Drop /
 * Grand Total), Cash Flow Opener / Closer per currency + mobile, summary panel
 * (Tables Result, Fills, Credits, Miss Chips, Expenses, Tips, Shift Balance)
 * and signature lines.
 *
 * Fully self-contained: fetches chip baselines, cage transfers and table
 * tracker for the shift's business day on its own. Designed for window.print().
 */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { CHIP_DENOMS, CURRENCIES, formatNumberSpaces, CASH_DENOMS } from "@/lib/currency";
import { fmtDate } from "@/lib/format-date";
import { buildLatestTableSnapshot, chipSnapshotResult, type BaselineMap } from "@/lib/table-live-result";
// Authoritative Result is computed server-side via compute_shift_table_results RPC.
// Snapshot index is still loaded for backward-compatible fallback only.
import type { Tables } from "@/integrations/supabase/types";
import { splitTablesWindow, type NepTx } from "@/lib/nep-split";

interface Props {
  shift: Tables<"shifts">;
  tables: Tables<"gaming_tables">[];
  /** Closing snapshot from CloseShiftDialog (chips, cash, mobile, bank, totals) */
  closingCount: any;
  /** From shift.opening_float */
  openingFloat: any;
  exchangeRates: Record<string, number>;
  totalExpenses: number;
  missTotal: number;
  resultTable: number;
  balance: number;
  businessDate: string;
  /** Tips total of THIS shift (already deducted from `balance` by caller).
   *  When provided, the report uses it for the − Tips row instead of the
   *  business-day aggregate computed locally from `tipsByShift`. */
  tipsTotal?: number;
  cashierName?: string;
  managerName?: string;
  /** ===== Optional in-memory overrides for "Reprint with edits" =====
   *  When provided, replace internally-fetched values without touching DB. */
  tableRowOverrides?: Record<string, Partial<{ op: number; fl: number; cr: number; cl: number; inVal: number; res: number }>>;
  cashlessOverride?: { inByProv: Record<string, number>; outByProv: Record<string, number> };
  tipsByShiftOverride?: { day: number; night: number };
  cashFlowTransfersOverride?: { addFloat: number; slotsOut: number };
}

const sumChipsObj = (chips: Record<string | number, number> | undefined) => {
  if (!chips) return 0;
  return Object.entries(chips).reduce((s, [d, q]) => s + Number(d) * (Number(q) || 0), 0);
};

const ShiftClosingReport = ({
  shift, tables, closingCount, openingFloat, exchangeRates,
  totalExpenses, missTotal, resultTable, balance, businessDate,
  tipsTotal, cashierName, managerName,
  tableRowOverrides, cashlessOverride, tipsByShiftOverride, cashFlowTransfersOverride,
}: Props) => {

  const { casinoId } = useAuth();
  const [casinoName, setCasinoName] = useState("Casino");
  const [baselines, setBaselines] = useState<Record<string, number>>({}); // tableId -> TZS value
  const [baselineByDenom, setBaselineByDenom] = useState<BaselineMap>({}); // tableId -> denom -> qty (Pit baseline)
  const [snapshotIndex, setSnapshotIndex] = useState<ReturnType<typeof buildLatestTableSnapshot>>({});
  const [fillCredits, setFillCredits] = useState<Record<string, { fill: number; credit: number }>>({});
  const [cashFlowTransfers, setCashFlowTransfers] = useState({ addFloat: 0, slotsOut: 0 });
  /** Drop NEP per table — peak-NEP per (player, business-day) distributed
   *  proportionally to each table's IN share within the SHIFT window.
   *  Authoritative formula used everywhere (Player Statistics, Tables,
   *  Dashboard) — keeps the printed shift report in sync with on-screen totals
   *  instead of inflating by recycled buy-ins (raw Σ buy/in). */
  const [inByTable, setInByTable] = useState<Record<string, number>>({});
  /** Imported daily results (legacy import path) — when present, take precedence
   *  for Open/Fill/Credit/Close columns; Result still comes from snapshot. */
  const [dailyResults, setDailyResults] = useState<Record<string, {
    open: number; fill: number; credit: number; close: number; drop: number; result: number;
  }>>({});
  /** Authoritative per-table Result computed by DB RPC
   *  `compute_shift_table_results` — formula (Σ(actual−baseline)·denom) − Fill + Credit. */
  const [serverResults, setServerResults] = useState<Record<string, number>>({});
  /** Tips for the business day, split by shift_type. Informational only —
   *  tips are NOT part of Shift Balance. */
  const [tipsByShift, setTipsByShift] = useState<{ day: number; night: number }>({ day: 0, night: 0 });
  /** Cashless IN / OUT per provider, scoped to THIS shift's window. */
  const [cashlessIO, setCashlessIO] = useState<{
    inByProv: Record<string, number>;
    outByProv: Record<string, number>;
  }>({ inByProv: {}, outByProv: {} });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!casinoId || !shift) return;
      const [{ data: c }, { data: bl }, { data: tr }, { data: tdr }, { data: tx }, { data: snaps }] = await Promise.all([
        supabase.from("casinos").select("name").eq("id", casinoId).maybeSingle(),
        supabase.from("chip_baseline").select("location_id, denomination, expected_quantity")
          .eq("casino_id", casinoId).eq("location_type", "table"),
        supabase.from("cage_transfers").select("table_id, transfer_type, amount")
          .eq("shift_id", shift.id).in("transfer_type", ["fill", "credit", "add_float", "slots_out"]),
        businessDate
          ? supabase.from("table_daily_results")
              .select("table_id, open, fill, credit, close, drop_amount, result")
              .eq("casino_id", casinoId).eq("date", businessDate)
          : Promise.resolve({ data: [] as any[] } as any),
        supabase.from("transactions").select("table_id, player_id, type, amount, created_at, cancelled_at")
          .eq("shift_id", shift.id).is("cancelled_at", null),
        // Pit's Chip Count snapshots for this shift's business day. Result =
        // (latest snapshot.actual − chip_baseline.expected) × denom per table.
        businessDate
          ? supabase.from("chip_snapshots")
              .select("location_type, location_id, denomination, expected_quantity, actual_quantity, created_at")
              .eq("casino_id", casinoId).eq("date", businessDate).eq("location_type", "table")
          : Promise.resolve({ data: [] as any[] } as any),
      ]);
      if (cancelled) return;
      if (c?.name) setCasinoName(c.name);
      const blMap: Record<string, number> = {};
      const blByDenom: BaselineMap = {};
      (bl || []).forEach((r: any) => {
        if (!r.location_id) return;
        blMap[r.location_id] = (blMap[r.location_id] || 0) + Number(r.denomination) * Number(r.expected_quantity);
        blByDenom[r.location_id] = blByDenom[r.location_id] || {};
        blByDenom[r.location_id][Number(r.denomination)] = Number(r.expected_quantity);
      });
      setBaselines(blMap);
      setBaselineByDenom(blByDenom);
      setSnapshotIndex(buildLatestTableSnapshot((snaps || []) as any));
      const fc: Record<string, { fill: number; credit: number }> = {};
      let addFloat = 0;
      let slotsOut = 0;
      (tr || []).forEach((r: any) => {
        if (r.transfer_type === "add_float") { addFloat += Number(r.amount); return; }
        if (r.transfer_type === "slots_out") { slotsOut += Number(r.amount); return; }
        if (!r.table_id) return;
        fc[r.table_id] = fc[r.table_id] || { fill: 0, credit: 0 };
        if (r.transfer_type === "fill") fc[r.table_id].fill += Number(r.amount);
        else if (r.transfer_type === "credit") fc[r.table_id].credit += Number(r.amount);
      });
      setFillCredits(fc);
      setCashFlowTransfers({ addFloat, slotsOut });
      // DROP NEP per table = peak-NEP per (player, business-day) split by
      // each table's IN share within the shift window. Matches Player
      // Statistics / Tables / Dashboard exactly.
      const fromIso = (shift as any).opened_at as string | null;
      const toIso = ((shift as any).closed_at as string | null) ?? new Date().toISOString();
      const inMap: Record<string, number> = {};
      if (fromIso) {
        const nepTxs: NepTx[] = (tx || []).map((r: any) => ({
          id: undefined,
          player_id: r.player_id,
          table_id: r.table_id,
          type: r.type,
          amount: Number(r.amount) || 0,
          created_at: r.created_at,
          cancelled_at: r.cancelled_at,
        }));
        const split = splitTablesWindow(nepTxs, fromIso, toIso);
        for (const [tid, v] of split) inMap[tid] = v.dropR;
      }
      setInByTable(inMap);
      const dr: Record<string, any> = {};
      (tdr || []).forEach((r: any) => {
        dr[r.table_id] = {
          open: Number(r.open || 0),
          fill: Number(r.fill || 0),
          credit: Number(r.credit || 0),
          close: Number(r.close || 0),
          drop: Number(r.drop_amount || 0),
          result: Number(r.result || 0),
        };
      });
      setDailyResults(dr);

      // Authoritative Result from server-side RPC.
      const { data: srv } = await (supabase as any).rpc("compute_shift_table_results", { p_shift_id: shift.id });
      if (cancelled) return;
      const sr: Record<string, number> = {};
      (srv || []).forEach((r: any) => { if (r?.table_id) sr[r.table_id] = Number(r.result || 0); });
      setServerResults(sr);

      // Tips for this business day, grouped by shift_type (day / night).
      if (businessDate) {
        const fromUtc = `${businessDate}T02:00:00Z`;
        const nx = new Date(`${businessDate}T00:00:00Z`);
        nx.setUTCDate(nx.getUTCDate() + 1);
        const toUtc = `${nx.toISOString().slice(0, 10)}T02:00:00Z`;
        const { data: bdShifts } = await supabase
          .from("shifts")
          .select("id, shift_type")
          .eq("casino_id", casinoId)
          .gte("opened_at", fromUtc)
          .lt("opened_at", toUtc);
        const idMap = new Map<string, string>();
        (bdShifts || []).forEach((s: any) => idMap.set(s.id, s.shift_type));
        if (bdShifts && bdShifts.length) {
          const { data: tipTx } = await supabase
            .from("transactions")
            .select("amount, shift_id, type")
            .in("shift_id", bdShifts.map((s: any) => s.id))
            .in("type", ["tips_live", "tips_poker", "tips_floor"] as any)
            .is("cancelled_at", null);
          let day = 0, night = 0;
          (tipTx || []).forEach((t: any) => {
            const st = idMap.get(t.shift_id);
            const a = Number(t.amount || 0);
            if (st === "day") day += a;
            else if (st === "night") night += a;
          });
          if (!cancelled) setTipsByShift({ day, night });
        }
      }

      // Cashless IN / OUT scoped to THIS shift's window (live_game cage only).
      {
        const fromIso = (shift as any).opened_at as string | null;
        const toIso = ((shift as any).closed_at as string | null) ?? new Date().toISOString();
        if (fromIso) {
          let q = (supabase as any)
            .from("cashless_transactions")
            .select("direction, provider, amount, created_at")
            .eq("casino_id", casinoId)
            .eq("cage_type", "live_game")
            .gte("created_at", fromIso)
            .lte("created_at", toIso);
          const { data: cl } = await q;
          if (!cancelled) {
            const inP: Record<string, number> = {};
            const outP: Record<string, number> = {};
            (cl || []).forEach((r: any) => {
              const p = String(r.provider || "").toUpperCase();
              const a = Number(r.amount || 0);
              if (r.direction === "IN") inP[p] = (inP[p] || 0) + a;
              else if (r.direction === "OUT") outP[p] = (outP[p] || 0) + a;
            });
            setCashlessIO({ inByProv: inP, outByProv: outP });
          }
        }
      }
    })();
    return () => { cancelled = true; };
  }, [casinoId, shift?.id, businessDate]);

  // Tables ordered: visible (non-archived), name asc
  const reportTables = useMemo(
    () => tables.filter(t => !t.is_archived).sort((a, b) => a.name.localeCompare(b.name)),
    [tables],
  );

  /** Column data sources:
   *  - Open       = standard chip baseline sum per table (chip_baseline)
   *  - Fill/Credit= cage_transfers for this shift
   *  - Close      = latest Pit chip snapshot Σ(actual·denom)
   *  - DROP (NEP) = peak-NEP per (player, business-day) split by per-table IN
   *  - Result     = authoritative DB RPC `compute_shift_table_results`
   *                 (formula: (Σ(actual−baseline)·denom) − Fill + Credit) */
  const rowFor = (t: Tables<"gaming_tables">) => {
    const op = baselines[t.id] || 0;
    const fl = fillCredits[t.id]?.fill || 0;
    const cr = fillCredits[t.id]?.credit || 0;
    const snap = snapshotIndex[t.id]?.perDenom;
    const cl = snap
      ? Object.entries(snap).reduce((s, [d, q]) => s + Number(d) * (Number(q) || 0), 0)
      : 0;
    const inVal = inByTable[t.id] || 0;
    const res = serverResults[t.id] ?? 0;
    const ov = tableRowOverrides?.[t.id];
    if (ov) {
      return {
        op: ov.op ?? op,
        fl: ov.fl ?? fl,
        cr: ov.cr ?? cr,
        cl: ov.cl ?? cl,
        inVal: ov.inVal ?? inVal,
        res: ov.res ?? res,
      };
    }
    return { op, fl, cr, cl, inVal, res };
  };

  const totals = useMemo(() => {
    let open = 0, fill = 0, credit = 0, close = 0, inSum = 0, result = 0;
    reportTables.forEach(t => {
      const { op, fl, cr, cl, inVal, res } = rowFor(t);
      open += op; fill += fl; credit += cr; close += cl; inSum += inVal; result += res;
    });
    return { open, fill, credit, close, in: inSum, result };
  }, [reportTables, baselines, fillCredits, dailyResults, inByTable, serverResults, tableRowOverrides]);

  // Effective values — overrides win when provided.
  const effCashlessIO = cashlessOverride ?? cashlessIO;
  const effTipsByShift = tipsByShiftOverride ?? tipsByShift;
  const effCashFlowTransfers = cashFlowTransfersOverride ?? cashFlowTransfers;

  // Cash flow opener (per currency cash + mobile from opening_float)
  const openerCash = (openingFloat?.cash || {}) as Record<string, Record<string | number, number>>;
  const openerMobile = (openingFloat?.mobile || {}) as Record<string, number>;
  const openerBank = (openingFloat?.bank || {}) as { tzs?: number; usd?: number };

  // Closer from closingCount snapshot
  const closerCash = (closingCount?.cash || {}) as Record<string, Record<string | number, number>>;
  const closerMobile = (closingCount?.mobile || {}) as Record<string, number>;
  const closerBank = (closingCount?.bank || {}) as { tzs?: number; usd?: number };

  const cashCurrencyTotal = (cash: Record<string | number, number> | undefined) =>
    cash ? Object.entries(cash).reduce((s, [d, q]) => s + Number(d) * (Number(q) || 0), 0) : 0;

  // Per-currency totals for opener/closer (in native currency, not TZS)
  const openerByCurrency = Object.fromEntries(CURRENCIES.map(c => [c, cashCurrencyTotal(openerCash[c])]));
  const closerByCurrency = Object.fromEntries(CURRENCIES.map(c => [c, cashCurrencyTotal(closerCash[c])]));

  const openerCashTzs = CURRENCIES.reduce((s, c) => {
    const t = openerByCurrency[c]; return s + t * (c === "TZS" ? 1 : (exchangeRates[c] || 0));
  }, 0);
  const closerCashTzs = CURRENCIES.reduce((s, c) => {
    const t = closerByCurrency[c]; return s + t * (c === "TZS" ? 1 : (exchangeRates[c] || 0));
  }, 0);
  const openerOtherTzs = (openerBank.tzs || 0) + (openerBank.usd || 0) * (exchangeRates["USD"] || 0);
  const closerOtherTzs = (closerBank.tzs || 0) + (closerBank.usd || 0) * (exchangeRates["USD"] || 0);

  const openerMobileTotal = Object.values(openerMobile).reduce((s, v) => s + (Number(v) || 0), 0);
  const closerMobileTotal = Object.values(closerMobile).reduce((s, v) => s + (Number(v) || 0), 0);

  const openerTotal = openerCashTzs + openerOtherTzs;
  const closerTotal = closerCashTzs + closerOtherTzs;

  const num = (n: number) => (n === 0 ? "" : formatNumberSpaces(n));
  const numAlways = (n: number) => formatNumberSpaces(n);

  // Mobile providers ordered as per legacy form
  const MP = ["Mpesa", "Tigo", "Halo", "AirTel"] as const;

  const compact = reportTables.length > 14;
  const rootFontSize = compact ? "9.5px" : "10.5px";
  const rootLineHeight = compact ? 1.15 : 1.25;
  const cellPadY = compact ? "1px" : "2px";

  return (
    <div
      id="shift-print-area"
      className="bg-white text-black"
      style={{
        fontFamily: "Arial, sans-serif",
        fontSize: rootFontSize,
        lineHeight: rootLineHeight,
        width: "194mm",
        boxSizing: "border-box",
        padding: 0,
      }}
    >
      <style>{`
        #shift-print-area td, #shift-print-area th {
          padding-top: ${cellPadY} !important;
          padding-bottom: ${cellPadY} !important;
        }
      `}</style>
      {/* ============ TITLE ROW ============ */}
      <table className="w-full border-collapse mb-1" style={{ tableLayout: "fixed" }}>
        <colgroup>
          <col />
          <col style={{ width: "22mm" }} />
          <col style={{ width: "34mm" }} />
        </colgroup>
        <tbody>
          <tr>
            <td className="border border-black px-1.5 py-0.5 font-bold text-lg">
              {casinoName} Live Game Cash Desk Report
            </td>
            <td className="border border-black px-1.5 py-0.5 font-semibold text-center">Date</td>
            <td className="border border-black px-1.5 py-0.5 text-center">{fmtDate(businessDate)}</td>
          </tr>
        </tbody>
      </table>

      {/* ============ TABLES GRID ============ */}
      <table className="w-full border-collapse mb-1 tabular-nums" style={{ tableLayout: "fixed" }}>
        <colgroup>
          <col style={{ width: "18%" }} />
          <col style={{ width: "13.6%" }} />
          <col style={{ width: "13.6%" }} />
          <col style={{ width: "13.6%" }} />
          <col style={{ width: "13.6%" }} />
          <col style={{ width: "13.6%" }} />
          <col style={{ width: "14%" }} />
        </colgroup>
        <thead>
          <tr className="bg-gray-200">
            {["Table", "Open", "Fill", "Credit", "Close", "DROP (NEP)", "Result"].map(h => (
              <th key={h} className="border border-black px-1.5 py-0.5 text-left font-semibold">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {reportTables.map(t => {
            const { op, fl, cr, cl, inVal, res } = rowFor(t);
            return (
              <tr key={t.id}>
                <td className="border border-black px-1.5 py-0.5 font-semibold truncate">{t.name}</td>
                <td className="border border-black px-1.5 py-0.5 text-right">{num(op)}</td>
                <td className="border border-black px-1.5 py-0.5 text-right">{num(fl)}</td>
                <td className="border border-black px-1.5 py-0.5 text-right">{num(cr)}</td>
                <td className="border border-black px-1.5 py-0.5 text-right">{num(cl)}</td>
                <td className="border border-black px-1.5 py-0.5 text-right">{num(inVal)}</td>
                <td className="border border-black px-1.5 py-0.5 text-right font-semibold">
                  {res === 0 ? "" : (res > 0 ? numAlways(res) : `-${numAlways(Math.abs(res))}`)}
                </td>
              </tr>
            );
          })}
          <tr className="bg-gray-200 font-bold">
            <td className="border border-black px-1.5 py-0.5">Total</td>
            <td className="border border-black px-1.5 py-0.5 text-right">{numAlways(totals.open)}</td>
            <td className="border border-black px-1.5 py-0.5 text-right">{numAlways(totals.fill)}</td>
            <td className="border border-black px-1.5 py-0.5 text-right">{numAlways(totals.credit)}</td>
            <td className="border border-black px-1.5 py-0.5 text-right">{numAlways(totals.close)}</td>
            <td className="border border-black px-1.5 py-0.5 text-right">{numAlways(totals.in)}</td>
            <td className="border border-black px-1.5 py-0.5 text-right">
              {totals.result >= 0 ? numAlways(totals.result) : `-${numAlways(Math.abs(totals.result))}`}
            </td>
          </tr>
        </tbody>
      </table>


      {/* ============ CASH FLOW: OPENER | CLOSER (as a table) ============ */}
      <table className="w-full border-collapse mb-1 tabular-nums" style={{ tableLayout: "fixed" }}>
        <colgroup>
          <col style={{ width: "40%" }} />
          <col style={{ width: "30%" }} />
          <col style={{ width: "30%" }} />
        </colgroup>
        <thead>
          <tr>
            <th colSpan={3} className="border border-black bg-gray-200 px-1.5 py-0.5 text-left">
              Cash Flow (Opener / Closer)
            </th>
          </tr>
          <tr className="bg-gray-100">
            <th className="border border-black px-1.5 py-0.5 text-left">Item</th>
            <th className="border border-black px-1.5 py-0.5 text-right">Opener</th>
            <th className="border border-black px-1.5 py-0.5 text-right">Closer</th>
          </tr>

        </thead>
        <tbody>
          {CURRENCIES.map(c => {
            const o = openerByCurrency[c] || 0;
            const cl = closerByCurrency[c] || 0;
            return (
              <tr key={c}>
                <td className="border border-black px-1.5 py-0.5">{c}</td>
                <td className="border border-black px-1.5 py-0.5 text-right">{o ? numAlways(o) : "—"}</td>
                <td className="border border-black px-1.5 py-0.5 text-right">{cl ? numAlways(cl) : "—"}</td>
              </tr>
            );
          })}
          <tr>
            <td className="border border-black px-1.5 py-0.5">Other in TZS</td>
            <td className="border border-black px-1.5 py-0.5 text-right">{openerOtherTzs ? numAlways(openerOtherTzs) : "—"}</td>
            <td className="border border-black px-1.5 py-0.5 text-right">{closerOtherTzs ? numAlways(closerOtherTzs) : "—"}</td>
          </tr>
          <tr className="bg-gray-100 font-semibold">
            <td className="border border-black px-1.5 py-0.5">Total Cash (TZS)</td>
            <td className="border border-black px-1.5 py-0.5 text-right">{numAlways(openerCashTzs + openerOtherTzs)}</td>
            <td className="border border-black px-1.5 py-0.5 text-right">{numAlways(closerCashTzs + closerOtherTzs)}</td>
          </tr>
          <tr className="bg-gray-200 font-bold">
            <td className="border border-black px-1.5 py-0.5">Total</td>
            <td className="border border-black px-1.5 py-0.5 text-right">{numAlways(openerTotal)}</td>
            <td className="border border-black px-1.5 py-0.5 text-right">{numAlways(closerTotal)}</td>
          </tr>
        </tbody>
      </table>

      {/* ============ CASH LESS SHIFT TRANSACTIONS ============ */}
      {(() => {
        const PROV: Array<{ key: string; label: string }> = [
          { key: "MPESA",   label: "M Pesa" },
          { key: "TIGO",    label: "T Pesa" },
          { key: "HALOTEL", label: "H Pesa" },
          { key: "AIRTEL",  label: "Airtel Money" },
        ];
        const finalProvKey = (p: string) => {
          // Closer mobile is keyed by "Mpesa | Tigo | Halo | AirTel".
          if (p === "MPESA") return "Mpesa";
          if (p === "TIGO") return "Tigo";
          if (p === "HALOTEL") return "Halo";
          return "AirTel";
        };
        const totIn  = PROV.reduce((s, p) => s + Number(effCashlessIO.inByProv[p.key]  || 0), 0);
        const totOut = PROV.reduce((s, p) => s + Number(effCashlessIO.outByProv[p.key] || 0), 0);
        const totBalRaw = closerMobile;
        const hasAnyBal = PROV.some(p => {
          const v = (totBalRaw as any)?.[finalProvKey(p.key)];
          return v !== undefined && v !== null && Number(v) !== 0;
        });
        const totBal = hasAnyBal
          ? PROV.reduce((s, p) => s + Number((totBalRaw as any)?.[finalProvKey(p.key)] || 0), 0)
          : null;
        return (
          <table className="w-full border-collapse mb-1 tabular-nums" style={{ tableLayout: "fixed" }}>
            <colgroup>
              <col style={{ width: "24%" }} />
              <col style={{ width: "19%" }} />
              <col style={{ width: "19%" }} />
              <col style={{ width: "19%" }} />
              <col style={{ width: "19%" }} />
            </colgroup>
            <thead>
              <tr><th colSpan={5} className="border border-black bg-gray-200 px-1.5 py-0.5 text-left">Cash Less Shift Transactions</th></tr>
              <tr className="bg-gray-100">
                <th className="border border-black px-1.5 py-0.5 text-left">Provider</th>
                <th className="border border-black px-1.5 py-0.5 text-right">Deposit (IN)</th>
                <th className="border border-black px-1.5 py-0.5 text-right">Withdraw (OUT)</th>
                <th className="border border-black px-1.5 py-0.5 text-right">NET (IN − OUT)</th>
                <th className="border border-black px-1.5 py-0.5 text-right">End Day</th>
              </tr>
            </thead>

            <tbody>
              {PROV.map(p => {
                const i = Number(effCashlessIO.inByProv[p.key]  || 0);
                const o = Number(effCashlessIO.outByProv[p.key] || 0);
                const n = i - o;
                const rawB = (closerMobile as any)?.[finalProvKey(p.key)];
                const hasBal = rawB !== undefined && rawB !== null && String(rawB) !== "";
                return (
                  <tr key={p.key}>
                    <td className="border border-black px-1.5 py-0.5">{p.label}</td>
                    <td className="border border-black px-1.5 py-0.5 text-right">{i ? numAlways(i) : ""}</td>
                    <td className="border border-black px-1.5 py-0.5 text-right">{o ? numAlways(o) : ""}</td>
                    <td className="border border-black px-1.5 py-0.5 text-right font-semibold">
                      {n !== 0 ? (n > 0 ? "+" : "") + numAlways(n) : ""}
                    </td>
                    <td className="border border-black px-1.5 py-0.5 text-right font-semibold">
                      {hasBal ? numAlways(Number(rawB)) : "—"}
                    </td>
                  </tr>
                );
              })}
              <tr className="bg-gray-100 font-bold">
                <td className="border border-black px-1.5 py-0.5">Total</td>
                <td className="border border-black px-1.5 py-0.5 text-right">{numAlways(totIn)}</td>
                <td className="border border-black px-1.5 py-0.5 text-right">{numAlways(totOut)}</td>
                <td className="border border-black px-1.5 py-0.5 text-right">
                  {(totIn - totOut) > 0 ? "+" : ""}{numAlways(totIn - totOut)}
                </td>
                <td className="border border-black px-1.5 py-0.5 text-right">
                  {totBal === null ? "—" : numAlways(totBal)}
                </td>
              </tr>
              {/* Manual Input @ Close — immutable per-provider snapshot of the
                  cashier's End Day entry captured at shift closing. Lets
                  managers verify the printed End Day above against the
                  original manual input. */}
              {hasAnyBal && (
                <tr style={{ backgroundColor: "#fff8c4" }}>
                  <td className="border border-black px-1.5 py-0.5 italic" colSpan={4}>
                    Manual Input @ Close
                  </td>
                  <td className="border border-black px-1.5 py-0.5 text-right font-semibold">
                    {numAlways(totBal || 0)}
                  </td>
                </tr>
              )}
              {hasAnyBal && PROV.map(p => {
                const rawB = (closerMobile as any)?.[finalProvKey(p.key)];
                const hasBal = rawB !== undefined && rawB !== null && String(rawB) !== "";
                if (!hasBal) return null;
                return (
                  <tr key={`mic-${p.key}`} style={{ backgroundColor: "#fff8c4" }}>
                    <td className="border border-black px-1.5 py-0.5 pl-4 italic text-xs">↳ {p.label}</td>
                    <td className="border border-black px-1.5 py-0.5" colSpan={3}></td>
                    <td className="border border-black px-1.5 py-0.5 text-right">{numAlways(Number(rawB))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        );
      })()}



      {/* ============ SUMMARY PANEL (full width 4-col table) ============ */}
      <table className="w-full border-collapse mb-1" style={{ tableLayout: "fixed" }}>
        <colgroup>
          <col style={{ width: "25%" }} />
          <col style={{ width: "25%" }} />
          <col style={{ width: "25%" }} />
          <col style={{ width: "25%" }} />
        </colgroup>
        <tbody>
          <tr>
            <td className="border border-black bg-gray-200 px-1.5 py-0.5 font-semibold">Tables Result</td>
            <td className="border border-black px-1.5 py-0.5 text-right font-bold">
              {totals.result >= 0 ? numAlways(totals.result) : `-${numAlways(Math.abs(totals.result))}`}
            </td>
            <td className="border border-black bg-gray-200 px-1.5 py-0.5 font-semibold">Casino Expenses</td>
            <td className="border border-black px-1.5 py-0.5 text-right">{num(totalExpenses)}</td>
          </tr>

          <tr>
            <td className="border border-black px-1.5 py-0.5">Cash Flow FILL</td>
            <td className="border border-black px-1.5 py-0.5 text-right">{num(effCashFlowTransfers.addFloat)}</td>
            <td className="border border-black px-1.5 py-0.5">Tips Day</td>
            <td className="border border-black px-1.5 py-0.5 text-right">{num(effTipsByShift.day)}</td>
          </tr>
          <tr>
            <td className="border border-black px-1.5 py-0.5">Cash Flow CREDIT</td>
            <td className="border border-black px-1.5 py-0.5 text-right">{num(effCashFlowTransfers.slotsOut)}</td>
            <td className="border border-black px-1.5 py-0.5">Tips Night</td>
            <td className="border border-black px-1.5 py-0.5 text-right">{num(effTipsByShift.night)}</td>
          </tr>
          <tr>
            <td className="border border-black px-1.5 py-0.5">Cash Desk Chips FILL</td>
            <td className="border border-black px-1.5 py-0.5 text-right"></td>
            <td className="border border-black px-1.5 py-0.5">− Tips (this shift)</td>
            <td className="border border-black px-1.5 py-0.5 text-right">
              {(() => {
                const v = tipsTotal ?? (effTipsByShift.day + effTipsByShift.night);
                return v === 0 ? "" : `-${numAlways(Math.abs(v))}`;
              })()}
            </td>
          </tr>
          <tr>
            <td className="border border-black px-1.5 py-0.5">Cash Desk Chips CREDIT</td>
            <td className="border border-black px-1.5 py-0.5 text-right"></td>
            <td className="border border-black px-1.5 py-0.5 font-semibold">Miss Chips</td>
            <td className="border border-black px-1.5 py-0.5 text-right font-bold">
              {(() => {
                const v = -missTotal; // invert storage convention: + surplus / − deficit
                if (v === 0) return "";
                return (v > 0 ? "+" : "−") + numAlways(Math.abs(v));
              })()}
            </td>
          </tr>
          <tr>
            <td className="border border-black bg-gray-300 px-1.5 py-0.5 font-bold" colSpan={3}>Shift Balance</td>
            <td className="border border-black bg-gray-300 px-1.5 py-0.5 text-right font-bold">
              {balance === 0 ? "0" : (balance > 0 ? numAlways(balance) : `-${numAlways(Math.abs(balance))}`)}
            </td>
          </tr>
        </tbody>
      </table>


      {/* ============ SIGNATURES ============ */}
      <table className="w-full border-collapse mt-2 pt-2">
        <tbody>
          <tr>
            <td className="px-1.5 py-0.5 w-1/2 align-top">
              <div className="font-semibold mb-0.5">Closing Shift Cashier:</div>
              <div>Name: {cashierName ? <span className="font-semibold uppercase">{cashierName}</span> : "____________________________"}</div>
              <div className="mt-3">Signature: ________________________</div>
            </td>
            <td className="px-1.5 py-0.5 w-1/2 align-top">
              <div className="font-semibold mb-0.5">Closing Shift Manager:</div>
              <div>Name: {managerName ? <span className="font-semibold uppercase">{managerName}</span> : "____________________________"}</div>
              <div className="mt-3">Signature: ________________________</div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};

const CashFlowColumn = ({
  title, cash, mobile, mp, otherTzs, totalCash, totalMobile, totalLabel, totalValue,
}: {
  title: string;
  cash: Record<string, number>;
  mobile: Record<string, number>;
  mp: string[];
  otherTzs: number;
  totalCash: number;
  totalMobile: number;
  totalLabel: string;
  totalValue: number;
}) => {
  const num = (n: number) => (n === 0 ? "" : formatNumberSpaces(n));
  return (
    <div>
      <p className="font-semibold border-b border-black pb-0.5 mb-1">{title}</p>
      <div className="space-y-0.5">
        {CURRENCIES.map(c => (
          <Row key={c} label={c} value={num(cash[c] || 0)} />
        ))}
        <Row label="Other in TZS" value={num(otherTzs)} />
        <Row label="Total Cash" value={formatNumberSpaces(totalCash)} bold framed />
      </div>
      <div className="mt-2 pt-1 border-t border-black flex justify-between font-bold">
        <span>{totalLabel}</span>
        <span className="border border-black px-2 tabular-nums min-w-[100px] text-right">
          {formatNumberSpaces(totalValue)}
        </span>
      </div>
    </div>
  );
};

const Row = ({ label, value, bold, framed }: { label: string; value: string | number; bold?: boolean; framed?: boolean }) => (
  <div className={`flex justify-between items-center ${bold ? "font-bold" : ""}`}>
    <span>{label}</span>
    <span className={`tabular-nums text-right min-w-[90px] ${framed ? "border border-black px-2" : "border-b border-dotted border-black px-1"}`}>
      {value}
    </span>
  </div>
);

const SummaryRow = ({ label, value, bold, negative }: { label: string; value: number; bold?: boolean; negative?: boolean }) => {
  const signed = negative && value > 0 ? -value : value;
  const display = signed === 0 ? "0" : signed > 0 ? formatNumberSpaces(signed) : `-${formatNumberSpaces(Math.abs(signed))}`;
  return (
    <div className={`flex justify-between items-center ${bold ? "font-bold" : ""}`}>
      <span>{label}</span>
      <span className="border-b border-dotted border-black px-2 tabular-nums min-w-[100px] text-right">{display}</span>
    </div>
  );
};

const SignatureBlock = ({ label, name }: { label: string; name?: string }) => (
  <div>
    <div className="flex items-end gap-3">
      <span className="font-semibold whitespace-nowrap">{label}:</span>
      <span className="flex-1 border-b border-black pb-0.5 font-semibold uppercase">{name || ""}</span>
    </div>
    <div className="flex items-end gap-3 mt-5">
      <span className="font-semibold whitespace-nowrap">Signature:</span>
      <span className="flex-1 border-b border-black h-5" />
    </div>
  </div>
);

export default ShiftClosingReport;
