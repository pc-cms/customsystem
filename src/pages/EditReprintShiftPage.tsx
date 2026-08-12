/**
 * EditReprintShiftPage — full-page version of "Reprint with edits".
 *
 * Loads a closed shift's snapshot data, surfaces editable fields for cash
 * open/close (per currency, native totals), chips open/close (per
 * denomination), tips, expenses, table results, cashless IN/OUT and balance.
 * Edits are kept in local React state only — NOTHING is written to the
 * database. The Print button renders the printable area with the edited
 * values via overrides on ShiftClosingReport / ChipMovementReport.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Printer, ArrowLeft, RotateCcw } from "lucide-react";
import { CHIP_DENOMS, CURRENCIES, formatNumberSpaces, formatChipLabel } from "@/lib/currency";
import { useVisibleChipDenoms } from "@/hooks/use-chip-colors";
import { computeMissByDenom } from "@/components/cage/CageHelpers";
import { computeShiftBalance } from "@/lib/cage-balance";
import ShiftClosingReport from "@/components/cage/ShiftClosingReport";
import ChipMovementReport from "@/components/cage/ChipMovementReport";
import PrintPortal from "@/components/cage/PrintPortal";
import { printLiveGameReport } from "@/components/cage/printLiveGameReport";
import { fetchTotalDrop } from "@/lib/drop-source";
import { useAuth } from "@/lib/auth-context";
import type { Tables } from "@/integrations/supabase/types";

const businessDateForEAT = (iso: string): string => {
  const d = new Date(iso);
  const eatHour = parseInt(
    d.toLocaleString("en-GB", { timeZone: "Africa/Dar_es_Salaam", hour: "2-digit", hour12: false }),
    10,
  );
  const target = eatHour < 7 ? new Date(d.getTime() - 24 * 60 * 60 * 1000) : d;
  return target.toLocaleDateString("en-CA", { timeZone: "Africa/Dar_es_Salaam" });
};

type ChipMap = Record<number, number>;
type CashByCurrency = Record<string, number>;
type CashlessIO = { inByProv: Record<string, number>; outByProv: Record<string, number> };

const PROV_KEYS = ["MPESA", "TIGO", "HALOTEL", "AIRTEL"];
const PROV_LABELS: Record<string, string> = { MPESA: "M Pesa", TIGO: "T Pesa", HALOTEL: "H Pesa", AIRTEL: "Airtel" };

const formatSpaces = (n: number): string => {
  if (!Number.isFinite(n) || n === 0) return n === 0 ? "0" : "";
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n).toString();
  return sign + abs.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
};
const parseSpaces = (s: string): number => {
  const cleaned = s.replace(/[^\d-]/g, "").replace(/(?!^)-/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
};

const NumInput = ({ value, onChange, className = "" }: { value: number; onChange: (n: number) => void; className?: string }) => {
  const [text, setText] = useState(() => formatSpaces(value));
  const lastExternal = useRef(value);
  useEffect(() => {
    if (value !== lastExternal.current && value !== parseSpaces(text)) {
      setText(formatSpaces(value));
      lastExternal.current = value;
    }
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Input
      type="text"
      inputMode="numeric"
      className={`h-7 text-right font-mono tabular-nums text-[11px] px-1.5 ${className}`}
      value={text}
      onChange={(e) => {
        const raw = e.target.value;
        // Allow a lone "-" (or "-0") while user is typing a negative number.
        const isPartialNegative = /^-\d*$/.test(raw.replace(/\s/g, "")) && !/\d/.test(raw);
        if (raw === "" || isPartialNegative) {
          setText(raw);
          lastExternal.current = 0;
          onChange(0);
          return;
        }
        const n = parseSpaces(raw);
        setText(formatSpaces(n));
        lastExternal.current = n;
        onChange(n);
      }}
    />
  );
};

const Section = ({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) => (
  <div className={`cms-panel p-2 space-y-1.5 ${className}`}>
    <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</div>
    {children}
  </div>
);

const EditReprintShiftPage = () => {
  const { id: shiftId = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { casinoId } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["edit-reprint-shift", shiftId],
    enabled: !!shiftId && !!casinoId,
    queryFn: async () => {
      const { data: shift } = await supabase.from("shifts").select("*").eq("id", shiftId).maybeSingle();
      const fromIso = (shift as any)?.opened_at ?? "1970-01-01T00:00:00Z";
      const toIso = (shift as any)?.closed_at ?? new Date().toISOString();
      const [
        { data: tables },
        { data: exp },
        { data: transfers },
        { data: cashless },
        { data: tableResRpc },
        { data: snapshots },
        { data: inTx },
      ] = await Promise.all([
        supabase.from("gaming_tables").select("*").eq("casino_id", casinoId!),
        supabase.from("expenses").select("amount").eq("shift_id", shiftId),
        supabase.from("cage_transfers").select("transfer_type, amount, chips, table_id").eq("shift_id", shiftId),
        (supabase as any).from("cashless_transactions")
          .select("direction, provider, amount, created_at")
          .eq("casino_id", casinoId!)
          .eq("cage_type", "live_game")
          .gte("created_at", fromIso)
          .lte("created_at", toIso),
        (supabase as any).rpc("compute_shift_table_results", { p_shift_id: shiftId }),
        supabase.from("chip_snapshots")
          .select("location_id, denomination, expected_quantity, actual_quantity, created_at")
          .eq("casino_id", casinoId!)
          .eq("location_type", "table")
          .gte("created_at", fromIso)
          .lte("created_at", toIso)
          .order("created_at", { ascending: true }),
        supabase.from("transactions")
          .select("table_id, amount, type, cancelled_at")
          .eq("shift_id", shiftId)
          .in("type", ["in", "buy"])
          .is("cancelled_at", null),
      ]);
      // Per-table Drop = raw Σ IN transactions for this shift (same rule as the report).
      const tableDrop: Record<string, number> = {};
      (inTx || []).forEach((r: any) => {
        if (!r?.table_id) return;
        tableDrop[r.table_id] = (tableDrop[r.table_id] || 0) + Number(r.amount || 0);
      });
      const bDate = (shift as any)?.closed_at ? businessDateForEAT((shift as any).closed_at) : "";
      const totalDrop = bDate ? await fetchTotalDrop({ casinoId: casinoId!, fromDate: bDate }) : 0;
      const totalExpenses = (exp || []).reduce((s: number, r: any) => s + Number(r.amount || 0), 0);
      const tableResults: Record<string, number> = {};
      (tableResRpc || []).forEach((r: any) => {
        if (r?.table_id) tableResults[r.table_id] = Number(r.result ?? 0);
      });
      // Latest snapshot per (table_id, denomination): iterating ascending, later overwrites.
      const tableChips: Record<string, Record<number, { expected: number; actual: number }>> = {};
      (snapshots || []).forEach((r: any) => {
        if (!r?.location_id) return;
        const tid = String(r.location_id);
        const denom = Number(r.denomination || 0);
        if (!denom) return;
        (tableChips[tid] ||= {})[denom] = {
          expected: Number(r.expected_quantity || 0),
          actual: Number(r.actual_quantity || 0),
        };
      });
      return { shift, tables: tables || [], totalExpenses, transfers: transfers || [], cashless: cashless || [], tableResults, tableChips, tableDrop, totalDrop };
    },
  });

  const shift = data?.shift as Tables<"shifts"> | undefined;
  const tables = (data?.tables || []) as Tables<"gaming_tables">[];
  const businessDate = useMemo(
    () => (shift?.closed_at ? businessDateForEAT(shift.closed_at) : ""),
    [shift?.closed_at],
  );

  const initial = useMemo(() => {
    if (!shift) return null;
    const closing: any = shift.closing_count || {};
    const opening: any = shift.opening_float || {};
    const cashTotal = (m: any): number =>
      m ? Object.entries(m).reduce((s, [d, q]) => s + Number(d) * (Number(q) || 0), 0) : 0;
    const openCashByCcy: CashByCurrency = Object.fromEntries(
      CURRENCIES.map(c => [c, cashTotal((opening.cash || {})[c])]),
    );
    const closeCashByCcy: CashByCurrency = Object.fromEntries(
      CURRENCIES.map(c => [c, cashTotal((closing.cash || {})[c])]),
    );
    const openChips: ChipMap = {};
    const closeChips: ChipMap = {};
    const missByDenom: ChipMap = {};
    const storedMiss = (closing.chip_miss_by_denom || closing.chip_miss || {}) as Record<string, number>;
    CHIP_DENOMS.forEach(d => {
      openChips[d] = Number((opening.chips || {})[d] ?? (opening.chips || {})[String(d)] ?? 0);
      closeChips[d] = Number((closing.chips || {})[d] ?? (closing.chips || {})[String(d)] ?? 0);
      missByDenom[d] = Number((storedMiss as any)[d] ?? (storedMiss as any)[String(d)] ?? 0);
    });
    const cashlessIO: CashlessIO = { inByProv: {}, outByProv: {} };
    (data?.cashless || []).forEach((r: any) => {
      const p = String(r.provider || "").toUpperCase();
      const a = Number(r.amount || 0);
      if (r.direction === "IN") cashlessIO.inByProv[p] = (cashlessIO.inByProv[p] || 0) + a;
      else if (r.direction === "OUT") cashlessIO.outByProv[p] = (cashlessIO.outByProv[p] || 0) + a;
    });
    let addFloat = 0, slotsOut = 0;
    const fillByDenom: ChipMap = {};
    const creditByDenom: ChipMap = {};
    const tableFill: Record<string, number> = {};
    const tableCredit: Record<string, number> = {};
    (data?.transfers || []).forEach((r: any) => {
      if (r.transfer_type === "add_float") addFloat += Number(r.amount || 0);
      else if (r.transfer_type === "slots_out") slotsOut += Number(r.amount || 0);
      else if (r.transfer_type === "fill") {
        Object.entries((r.chips || {}) as Record<string, number>).forEach(([d, q]) => {
          fillByDenom[Number(d)] = (fillByDenom[Number(d)] || 0) + Number(q || 0);
        });
        if (r.table_id) tableFill[r.table_id] = (tableFill[r.table_id] || 0) + Number(r.amount || 0);
      } else if (r.transfer_type === "credit") {
        Object.entries((r.chips || {}) as Record<string, number>).forEach(([d, q]) => {
          creditByDenom[Number(d)] = (creditByDenom[Number(d)] || 0) + Number(q || 0);
        });
        if (r.table_id) tableCredit[r.table_id] = (tableCredit[r.table_id] || 0) + Number(r.amount || 0);
      }
    });
    return {
      openCashByCcy, closeCashByCcy, openChips, closeChips,
      totalExpenses: data?.totalExpenses || 0,
      tipsTotal: 0, addFloat, slotsOut, fillByDenom, creditByDenom, cashlessIO,
      resultTable: Number((shift as any).tables_result ?? closing.result_table ?? 0),
      balance: Number((shift as any).balance ?? closing.cash_desk_balance ?? 0),
      missTotal: Number((shift as any).miss_total ?? -(closing.chip_miss_total ?? 0)),
      missByDenom,
      exchangeRates: ((shift as any).exchange_rates || {}) as Record<string, number>,
      tableRes: { ...(data?.tableResults || {}) } as Record<string, number>,
      tableFill, tableCredit,
      tableDrop: { ...(data?.tableDrop || {}) } as Record<string, number>,
      totalDrop: Number(data?.totalDrop || 0),
      tableChips: JSON.parse(JSON.stringify(data?.tableChips || {})) as Record<string, Record<number, { expected: number; actual: number }>>,
    };
  }, [shift, data]);

  const [state, setState] = useState<typeof initial>(null);
  const [resultAuto, setResultAuto] = useState(true);
  const [chipsAuto, setChipsAuto] = useState(false);
  // Shift Balance is the certified value from close time. Reprint is a
  // print-only sandbox — we NEVER auto-recompute or overwrite it, only allow
  // manual edits that stay in local state.
  useEffect(() => { if (initial) setState(initial); }, [initial]);

  const baselineChipDelta = useMemo(() => {
    if (!initial) return 0;
    return (CHIP_DENOMS as any).reduce(
      (s: number, d: number) => s + d * ((initial.closeChips[d] || 0) - (initial.openChips[d] || 0)),
      0,
    );
  }, [initial]);

  const redistributeCloseChips = (targetResult: number): ChipMap => {
    if (!initial) return {} as ChipMap;
    const out: ChipMap = { ...initial.closeChips };
    let remaining = initial.resultTable - targetResult;
    const denoms = [...(CHIP_DENOMS as readonly number[])].sort((a, b) => b - a);
    for (const d of denoms) {
      if (remaining === 0) break;
      const q = remaining > 0 ? Math.floor(remaining / d) : Math.ceil(remaining / d);
      if (q !== 0) { out[d] = (out[d] || 0) + q; remaining -= q * d; }
    }
    return out;
  };

  useEffect(() => {
    if (!resultAuto || !state || !initial) return;
    const cur = (CHIP_DENOMS as any).reduce(
      (s: number, d: number) => s + d * ((state.closeChips[d] || 0) - (state.openChips[d] || 0)),
      0,
    );
    const next = initial.resultTable - (cur - baselineChipDelta);
    if (next !== state.resultTable) setState({ ...state, resultTable: next });
  }, [state?.openChips, state?.closeChips, resultAuto, initial, baselineChipDelta]); // eslint-disable-line react-hooks/exhaustive-deps

  const reset = () => { if (initial) { setState({ ...initial }); setResultAuto(true); setChipsAuto(false); } };

  const recomputedMiss = useMemo(() => {
    if (!state) return { perDenom: {} as ChipMap, total: 0 };
    // Miss is the physical count recorded at shift close — independent of the
    // cash-desk closing chip count edited here. Freeze it to the stored value
    // so edits to open/close chips don't leak into Miss on the printed report.
    const perDenom: ChipMap = {};
    (CHIP_DENOMS as any).forEach((d: number) => { perDenom[d] = Number((state as any).missByDenom?.[d] || 0); });
    const total = (CHIP_DENOMS as any).reduce((s: number, d: number) => s + d * (perDenom[d] || 0), 0);
    return { perDenom, total };
  }, [state?.missByDenom]);

  // Convert per-currency cash totals into TZS using state.exchangeRates.
  const cashTzs = (byCcy: CashByCurrency, rates: Record<string, number>) =>
    CURRENCIES.reduce((s, c) => s + (Number(byCcy[c] || 0) * (c === "TZS" ? 1 : Number(rates[c] || 0))), 0);

  // Canonical shift balance from formula (mirrors DB compute_shift_balance).
  const computedBalance = useMemo(() => {
    if (!state) return 0;
    const cashlessIn = Object.values(state.cashlessIO.inByProv || {}).reduce((s, v) => s + Number(v || 0), 0);
    const cashlessOut = Object.values(state.cashlessIO.outByProv || {}).reduce((s, v) => s + Number(v || 0), 0);
    return computeShiftBalance({
      openingCash: cashTzs(state.openCashByCcy, state.exchangeRates),
      closingCash: cashTzs(state.closeCashByCcy, state.exchangeRates),
      expenses: Number(state.totalExpenses || 0),
      collection: 0,
      addFloat: Number(state.addFloat || 0),
      slotsIn: 0,
      slotsOut: Number(state.slotsOut || 0),
      cashlessIn,
      cashlessOut,
      miss: recomputedMiss.total,
      tablesResult: Number(state.resultTable || 0),
    }).shiftBalance;
  }, [state, recomputedMiss.total]);

  // NOTE: `computedBalance` is available for reference only. We intentionally
  // do NOT push it into `state.balance` — the reprint must default to the
  // certified value stored at close time.



  const built = useMemo(() => {
    if (!state || !shift) return null;
    const buildCashObj = (byCcy: CashByCurrency) => {
      const out: Record<string, Record<string, number>> = {};
      CURRENCIES.forEach(c => { out[c] = { "1": Number(byCcy[c] || 0) }; });
      return out;
    };
    const openingFloat = { ...(shift.opening_float as any || {}), cash: buildCashObj(state.openCashByCcy), chips: state.openChips };
    const closingCount = { ...(shift.closing_count as any || {}), cash: buildCashObj(state.closeCashByCcy), chips: state.closeChips };
    return { openingFloat, closingCount };
  }, [state, shift]);

  const tableRowOverrides = useMemo(() => {
    if (!state) return undefined;
    const out: Record<string, { res: number; cl?: number; fl?: number; cr?: number }> = {};
    Object.entries(state.tableRes || {}).forEach(([id, v]) => { out[id] = { res: Number(v) || 0 }; });
    // Close (chips on table) — Σ(actual × denom) from edited per-denom grid.
    Object.entries(state.tableChips || {}).forEach(([id, byDenom]) => {
      const cl = Object.entries(byDenom || {}).reduce(
        (s, [d, v]) => s + Number(d) * Number((v as any)?.actual || 0),
        0,
      );
      out[id] = { ...(out[id] || { res: 0 }), cl };
    });
    // Per-table Drop — print-only override
    Object.entries(state.tableDrop || {}).forEach(([id, v]) => {
      out[id] = { ...(out[id] || { res: 0 }), inVal: Number(v) || 0 };
    });
    // Per-table Fill / Credit — print-only overrides
    Object.entries(state.tableFill || {}).forEach(([id, v]) => {
      out[id] = { ...(out[id] || { res: 0 }), fl: Number(v) || 0 };
    });
    Object.entries(state.tableCredit || {}).forEach(([id, v]) => {
      out[id] = { ...(out[id] || { res: 0 }), cr: Number(v) || 0 };
    });
    return out;
  }, [state?.tableRes, state?.tableChips, state?.tableFill, state?.tableCredit, state?.tableDrop]);

  const reportTables = useMemo(
    () => (tables || []).filter(t => !t.is_archived).sort((a, b) => a.name.localeCompare(b.name)),
    [tables],
  );

  const tablesResSum = useMemo(() => {
    if (!state) return 0;
    return reportTables.reduce((s, t) => s + (Number(state.tableRes?.[t.id]) || 0), 0);
  }, [state?.tableRes, reportTables]);

  return (
    <div className="h-[calc(100vh-var(--app-header-h,56px))] flex flex-col print:h-auto print:block">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border print:hidden">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="gap-1.5">
            <ArrowLeft className="w-4 h-4" /> Back
          </Button>
          <div>
            <div className="text-sm font-semibold">Reprint with edits — Live Game</div>
            <div className="text-[11px] text-muted-foreground">
              Edits are kept only in memory for this print. Nothing is saved to the database.
              {businessDate && <span className="ml-2 font-mono">{businessDate}</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={reset} className="gap-1.5" disabled={!state}>
            <RotateCcw className="w-4 h-4" /> Reset
          </Button>
          <Button size="sm" onClick={printLiveGameReport} className="gap-1.5" disabled={!state}>
            <Printer className="w-4 h-4" /> Print
          </Button>
        </div>
      </div>

      {isLoading || !shift || !state ? (
        <div className="text-center text-muted-foreground py-16 text-sm">Loading…</div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col overflow-auto gap-2 p-2 print:block print:overflow-visible">
          {/* ============ FULL-WIDTH TABLE RESULTS GRID ============ */}
          <TableChipsFullGrid
            tables={reportTables}
            tableChips={state.tableChips}
            tableRes={state.tableRes}
            tableFill={state.tableFill}
            tableCredit={state.tableCredit}
            tableDrop={state.tableDrop}
            totalDrop={state.totalDrop}
            onDropChange={(tableId, n) => {
              const nextDrop = { ...(state.tableDrop || {}), [tableId]: n };
              const sum = reportTables.reduce((s2, tt) => s2 + (Number(nextDrop[tt.id]) || 0), 0);
              setState({ ...state, tableDrop: nextDrop, totalDrop: sum });
            }}
            onTotalDropChange={(n) => setState({ ...state, totalDrop: n })}
            onFillChange={(tableId, n) => {
              // Casino formula: Result = Drop + Credit − Fill + Δchips.
              // Increasing Fill decreases Result 1:1.
              const baseFill = Number(initial?.tableFill?.[tableId] || 0);
              const baseRes = Number(initial?.tableRes?.[tableId] || 0);
              const curCredit = Number(state.tableCredit?.[tableId] || 0);
              const baseCredit = Number(initial?.tableCredit?.[tableId] || 0);
              const newRes = baseRes - (n - baseFill) + (curCredit - baseCredit);
              const nextRes = { ...(state.tableRes || {}), [tableId]: newRes };
              const sum = reportTables.reduce((s, tt) => s + (Number(nextRes[tt.id]) || 0), 0);
              setResultAuto(false);
              setState({
                ...state,
                tableFill: { ...(state.tableFill || {}), [tableId]: n },
                tableRes: nextRes,
                resultTable: sum,
              });
            }}
            onCreditChange={(tableId, n) => {
              const baseCredit = Number(initial?.tableCredit?.[tableId] || 0);
              const baseRes = Number(initial?.tableRes?.[tableId] || 0);
              const curFill = Number(state.tableFill?.[tableId] || 0);
              const baseFill = Number(initial?.tableFill?.[tableId] || 0);
              const newRes = baseRes + (n - baseCredit) - (curFill - baseFill);
              const nextRes = { ...(state.tableRes || {}), [tableId]: newRes };
              const sum = reportTables.reduce((s, tt) => s + (Number(nextRes[tt.id]) || 0), 0);
              setResultAuto(false);
              setState({
                ...state,
                tableCredit: { ...(state.tableCredit || {}), [tableId]: n },
                tableRes: nextRes,
                resultTable: sum,
              });
            }}
            onCellChange={(tableId, denom, actual) => {
              const prev = state.tableChips?.[tableId]?.[denom] || { expected: 0, actual: 0 };
              const nextTableChips = {
                ...state.tableChips,
                [tableId]: { ...(state.tableChips[tableId] || {}), [denom]: { ...prev, actual } },
              };
              // Recompute result for this table from all denoms
              const perDenom = nextTableChips[tableId] || {};
              const newRes = Object.entries(perDenom).reduce(
                (s, [d, v]) => s + (Number((v as any).actual || 0) - Number((v as any).expected || 0)) * Number(d),
                0,
              );
              const nextTableRes = { ...(state.tableRes || {}), [tableId]: newRes };
              const sum = reportTables.reduce((s, tt) => s + (Number(nextTableRes[tt.id]) || 0), 0);
              setResultAuto(false);
              setChipsAuto(true);
              setState({
                ...state,
                tableChips: nextTableChips,
                tableRes: nextTableRes,
                resultTable: sum,
                closeChips: redistributeCloseChips(sum),
              });
            }}
            onResultChange={(tableId, n) => {
              const nextMap = { ...(state.tableRes || {}), [tableId]: n };
              const sum = reportTables.reduce((s, tt) => s + (Number(nextMap[tt.id]) || 0), 0);
              setResultAuto(false);
              setChipsAuto(true);
              setState({ ...state, tableRes: nextMap, resultTable: sum, closeChips: redistributeCloseChips(sum) });
            }}
          />

          {/* ============ 2-COL: FORM | PRINT PREVIEW ============ */}
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2 print:block">
          {/* ============ LEFT — EDIT FORM ============ */}
          <div className="min-h-0 pr-1">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 auto-rows-min">
              {/* Cash */}
              <Section title="Cash open / close (per currency)">
                <div className="grid grid-cols-[44px,1fr,1fr] gap-1 items-center">
                  <div />
                  <div className="text-[9px] uppercase text-muted-foreground text-center">Open</div>
                  <div className="text-[9px] uppercase text-muted-foreground text-center">Close</div>
                  {CURRENCIES.map(c => (
                    <FragmentRow key={c} label={c}
                      o={state.openCashByCcy[c] || 0}
                      cV={state.closeCashByCcy[c] || 0}
                      onO={(n) => setState({ ...state, openCashByCcy: { ...state.openCashByCcy, [c]: n } })}
                      onC={(n) => setState({ ...state, closeCashByCcy: { ...state.closeCashByCcy, [c]: n } })}
                    />
                  ))}
                </div>
              </Section>

              {/* Cashless */}
              <Section title="Cashless IN / OUT per provider">
                <div className="grid grid-cols-[44px,1fr,1fr] gap-1 items-center">
                  <div />
                  <div className="text-[9px] uppercase text-muted-foreground text-center">IN</div>
                  <div className="text-[9px] uppercase text-muted-foreground text-center">OUT</div>
                  {PROV_KEYS.map(p => (
                    <FragmentRow key={p} label={PROV_LABELS[p]}
                      o={state.cashlessIO.inByProv[p] || 0}
                      cV={state.cashlessIO.outByProv[p] || 0}
                      onO={(n) => setState({ ...state, cashlessIO: { ...state.cashlessIO, inByProv: { ...state.cashlessIO.inByProv, [p]: n } } })}
                      onC={(n) => setState({ ...state, cashlessIO: { ...state.cashlessIO, outByProv: { ...state.cashlessIO.outByProv, [p]: n } } })}
                    />
                  ))}
                </div>
              </Section>

              {/* Chips spans both columns */}
              <Section title="Chips open / close (per denomination, qty)" className="md:col-span-2">
                <div className="grid grid-cols-[60px,1fr,1fr,60px,1fr,1fr] gap-1 items-center">
                  <div />
                  <div className="text-[9px] uppercase text-muted-foreground text-center">Open</div>
                  <div className="text-[9px] uppercase text-muted-foreground text-center">Close</div>
                  <div />
                  <div className="text-[9px] uppercase text-muted-foreground text-center">Open</div>
                  <div className="text-[9px] uppercase text-muted-foreground text-center">Close</div>
                  {(() => {
                    const denoms = [...CHIP_DENOMS];
                    const mid = Math.ceil(denoms.length / 2);
                    const left = denoms.slice(0, mid);
                    const right = denoms.slice(mid);
                    const rows = Math.max(left.length, right.length);
                    return Array.from({ length: rows }).map((_, i) => (
                      <FragmentChipDoubleRow
                        key={i}
                        leftD={left[i]} rightD={right[i]}
                        state={state}
                        onChange={(patch) => { setChipsAuto(false); setState({ ...state, ...patch }); }}
                      />
                    ));
                  })()}
                </div>
                <div className="text-[10px] text-muted-foreground pt-1 border-t border-border mt-1">
                  Miss recalculated: <span className="font-mono">{formatNumberSpaces(recomputedMiss.total)}</span>
                </div>
              </Section>

              {/* Per-table results moved to full-width grid at top */}

              {/* Totals & balance */}
              <Section title="Totals & balance">
                <div className="grid grid-cols-[1fr,140px] gap-1 items-center text-[11px]">
                  <span className="flex items-center gap-2 flex-wrap">
                    Tables Result
                    <label className="inline-flex items-center gap-1 text-[9px] text-muted-foreground cursor-pointer">
                      <input type="checkbox" className="h-3 w-3" checked={resultAuto}
                        onChange={(e) => { setResultAuto(e.target.checked); if (e.target.checked) setChipsAuto(false); }} />
                      auto result
                    </label>
                    <label className="inline-flex items-center gap-1 text-[9px] text-muted-foreground cursor-pointer">
                      <input type="checkbox" className="h-3 w-3" checked={chipsAuto}
                        onChange={(e) => { setChipsAuto(e.target.checked); if (e.target.checked) setResultAuto(false); }} />
                      auto chips
                    </label>
                  </span>
                  <NumInput value={state.resultTable} onChange={(n) => {
                    setResultAuto(false);
                    const patch: any = { ...state, resultTable: n };
                    if (chipsAuto) patch.closeChips = redistributeCloseChips(n);
                    setState(patch);
                  }} />
                  <span>Casino Expenses</span>
                  <NumInput value={state.totalExpenses} onChange={(n) => setState({ ...state, totalExpenses: n })} />
                  <span>Tips (this shift)</span>
                  <NumInput value={state.tipsTotal} onChange={(n) => setState({ ...state, tipsTotal: n })} />
                  <span>Cash Flow FILL (add_float)</span>
                  <NumInput value={state.addFloat} onChange={(n) => setState({ ...state, addFloat: n })} />
                  <span>Cash Flow CREDIT (slots_out)</span>
                  <NumInput value={state.slotsOut} onChange={(n) => setState({ ...state, slotsOut: n })} />
                  <span>Shift Balance</span>
                  <NumInput value={state.balance} onChange={(n) => setState({ ...state, balance: n })} />
                </div>
              </Section>
            </div>
          </div>

          {/* ============ RIGHT — LIVE PREVIEW ============ */}
          <div className="min-h-0 border border-border rounded-md overflow-auto bg-white text-black print:hidden">
            <div className="origin-top-left scale-[0.6] w-[166%]">
              {built && (
                <>
                  <ShiftClosingReport
                    shift={shift}
                    tables={tables}
                    closingCount={built.closingCount}
                    openingFloat={built.openingFloat}
                    exchangeRates={state.exchangeRates}
                    totalExpenses={state.totalExpenses}
                    missTotal={recomputedMiss.total}
                    resultTable={state.resultTable}
                    balance={state.balance}
                    businessDate={businessDate}
                    tipsTotal={state.tipsTotal}
                    cashlessOverride={state.cashlessIO}
                    cashFlowTransfersOverride={{ addFloat: state.addFloat, slotsOut: state.slotsOut }}
                    tableRowOverrides={tableRowOverrides}
                    totalDropOverride={state.totalDrop}
                  />
                  <ChipMovementReport
                    shift={shift}
                    openingChips={state.openChips}
                    closingChips={state.closeChips}
                    missPerDenom={recomputedMiss.perDenom}
                    businessDate={businessDate}
                    fillByDenomOverride={state.fillByDenom}
                    creditByDenomOverride={state.creditByDenom}
                  />
                </>
              )}
            </div>
          </div>
          </div>
        </div>
      )}

      {/* Print-only area via portal */}
      {built && state && shift && (
        <PrintPortal>
          <div className="live-game-print-area hidden print:block">
            <ShiftClosingReport
              shift={shift}
              tables={tables}
              closingCount={built.closingCount}
              openingFloat={built.openingFloat}
              exchangeRates={state.exchangeRates}
              totalExpenses={state.totalExpenses}
              missTotal={recomputedMiss.total}
              resultTable={state.resultTable}
              balance={state.balance}
              businessDate={businessDate}
              tipsTotal={state.tipsTotal}
              cashlessOverride={state.cashlessIO}
              cashFlowTransfersOverride={{ addFloat: state.addFloat, slotsOut: state.slotsOut }}
              tableRowOverrides={tableRowOverrides}
            />
            <ChipMovementReport
              shift={shift}
              openingChips={state.openChips}
              closingChips={state.closeChips}
              missPerDenom={recomputedMiss.perDenom}
              businessDate={businessDate}
              fillByDenomOverride={state.fillByDenom}
              creditByDenomOverride={state.creditByDenom}
            />
          </div>
        </PrintPortal>
      )}
    </div>
  );
};

const FragmentRow = ({ label, o, cV, onO, onC }: {
  label: string; o: number; cV: number;
  onO: (n: number) => void; onC: (n: number) => void;
}) => (
  <>
    <div className="text-[11px] font-medium text-muted-foreground">{label}</div>
    <NumInput value={o} onChange={onO} />
    <NumInput value={cV} onChange={onC} />
  </>
);

const FragmentRowSingle = ({ label, value, onChange }: {
  label: string; value: number; onChange: (n: number) => void;
}) => (
  <>
    <div className="text-[11px] font-medium text-muted-foreground truncate" title={label}>{label}</div>
    <NumInput value={value} onChange={onChange} />
  </>
);

const FragmentChipDoubleRow = ({ leftD, rightD, state, onChange }: {
  leftD?: number; rightD?: number;
  state: any;
  onChange: (patch: any) => void;
}) => (
  <>
    {leftD !== undefined ? (
      <>
        <div className="text-[11px] font-medium text-muted-foreground">{formatChipLabel(leftD)}</div>
        <NumInput value={state.openChips[leftD] || 0}
          onChange={(n) => onChange({ openChips: { ...state.openChips, [leftD]: n } })} />
        <NumInput value={state.closeChips[leftD] || 0}
          onChange={(n) => onChange({ closeChips: { ...state.closeChips, [leftD]: n } })} />
      </>
    ) : (<><div /><div /><div /></>)}
    {rightD !== undefined ? (
      <>
        <div className="text-[11px] font-medium text-muted-foreground">{formatChipLabel(rightD)}</div>
        <NumInput value={state.openChips[rightD] || 0}
          onChange={(n) => onChange({ openChips: { ...state.openChips, [rightD]: n } })} />
        <NumInput value={state.closeChips[rightD] || 0}
          onChange={(n) => onChange({ closeChips: { ...state.closeChips, [rightD]: n } })} />
      </>
    ) : (<><div /><div /><div /></>)}
  </>
);

type TableChipsMap = Record<string, Record<number, { expected: number; actual: number }>>;

const TableChipsFullGrid = ({
  tables,
  tableChips,
  tableRes,
  tableFill,
  tableCredit,
  tableDrop,
  totalDrop,
  onDropChange,
  onTotalDropChange,
  onCellChange,
  onResultChange,
  onFillChange,
  onCreditChange,
}: {
  tables: Tables<"gaming_tables">[];
  tableChips: TableChipsMap;
  tableRes: Record<string, number>;
  tableFill?: Record<string, number>;
  tableCredit?: Record<string, number>;
  tableDrop?: Record<string, number>;
  totalDrop?: number;
  onDropChange?: (tableId: string, n: number) => void;
  onTotalDropChange?: (n: number) => void;
  onCellChange: (tableId: string, denom: number, actual: number) => void;
  onResultChange: (tableId: string, n: number) => void;
  onFillChange?: (tableId: string, n: number) => void;
  onCreditChange?: (tableId: string, n: number) => void;
}) => {
  const visibleDenoms = useVisibleChipDenoms();
  // Union of visible denoms + any denom present in snapshots (so nothing is hidden).
  const denomSet = new Set<number>(visibleDenoms);
  Object.values(tableChips || {}).forEach((byDenom) => {
    Object.keys(byDenom).forEach((d) => denomSet.add(Number(d)));
  });
  const denoms = [...denomSet].sort((a, b) => b - a);
  const totalResult = tables.reduce((s, t) => s + (Number(tableRes?.[t.id]) || 0), 0);
  const totalFill = tables.reduce((s, t) => s + (Number(tableFill?.[t.id]) || 0), 0);
  const totalCredit = tables.reduce((s, t) => s + (Number(tableCredit?.[t.id]) || 0), 0);

  if (tables.length === 0) return null;

  return (
    <div className="cms-panel p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Table results — full chip grid (per table)
        </div>
        <div className="text-[11px] text-muted-foreground">
          Edit any actual chip count to auto-recalc the row Result. Σ ={" "}
          <span className="font-mono tabular-nums font-semibold">{formatNumberSpaces(totalResult)}</span>
        </div>
      </div>
      <div className="overflow-auto">
        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left px-2 py-1 sticky left-0 bg-background z-10 min-w-[110px]">Table</th>
              {denoms.map((d) => (
                <th key={d} className="text-center px-1 py-1 font-mono tabular-nums text-muted-foreground min-w-[72px]">
                  {formatChipLabel(d)}
                </th>
              ))}
              <th className="text-center px-1 py-1 min-w-[100px]" title="Fill — chips issued from cage to the table (print-only)">Fill</th>
              <th className="text-center px-1 py-1 min-w-[100px]" title="Credit — chips returned from table to cage (print-only)">Credit</th>
              <th className="text-center px-1 py-1 min-w-[110px]" title="DROP — printed per table (print-only)">Drop</th>
              <th className="text-right px-2 py-1 min-w-[110px]">Result (TZS)</th>
            </tr>
          </thead>
          <tbody>
            {tables.map((t) => {
              const row = tableChips?.[t.id] || {};
              return (
                <tr key={t.id} className="border-b border-border/50 hover:bg-accent/30">
                  <td className="px-2 py-1 font-medium sticky left-0 bg-background z-10 truncate max-w-[160px]" title={t.name}>
                    {t.name}
                  </td>
                  {denoms.map((d) => {
                    const cell = row[d] || { expected: 0, actual: 0 };
                    const diff = Number(cell.actual || 0) - Number(cell.expected || 0);
                    return (
                      <td key={d} className="px-1 py-1 align-top">
                        <NumInput
                          value={Number(cell.actual || 0)}
                          onChange={(n) => onCellChange(t.id, d, n)}
                        />
                        <div className="text-[9px] text-muted-foreground text-center font-mono tabular-nums mt-0.5">
                          exp {formatNumberSpaces(Number(cell.expected || 0))}
                          {diff !== 0 && (
                            <span className={diff > 0 ? " text-emerald-500" : " text-rose-500"}>
                              {" "}
                              ({diff > 0 ? "+" : ""}
                              {formatNumberSpaces(diff)})
                            </span>
                          )}
                        </div>
                      </td>
                    );
                  })}
                  <td className="px-1 py-1">
                    <NumInput
                      value={Number(tableFill?.[t.id]) || 0}
                      onChange={(n) => onFillChange?.(t.id, n)}
                    />
                  </td>
                  <td className="px-1 py-1">
                    <NumInput
                      value={Number(tableCredit?.[t.id]) || 0}
                      onChange={(n) => onCreditChange?.(t.id, n)}
                    />
                  </td>
                  <td className="px-1 py-1">
                    <NumInput
                      value={Number(tableDrop?.[t.id]) || 0}
                      onChange={(n) => onDropChange?.(t.id, n)}
                    />
                  </td>
                  <td className="px-2 py-1">
                    <NumInput
                      value={Number(tableRes?.[t.id]) || 0}
                      onChange={(n) => onResultChange(t.id, n)}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border font-semibold">
              <td className="px-2 py-1 sticky left-0 bg-background">Σ</td>
              <td colSpan={denoms.length} />
              <td className="px-1 py-1 text-right font-mono tabular-nums">{formatNumberSpaces(totalFill)}</td>
              <td className="px-1 py-1 text-right font-mono tabular-nums">{formatNumberSpaces(totalCredit)}</td>
              <td className="px-1 py-1">
                <NumInput value={Number(totalDrop) || 0} onChange={(n) => onTotalDropChange?.(n)} />
              </td>
              <td className="px-2 py-1 text-right font-mono tabular-nums">{formatNumberSpaces(totalResult)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="text-[10px] text-muted-foreground mt-2">
        Editing chips OR the Result column auto-recomputes Tables Result and redistributes CLOSE chips of the shift for print. Nothing is saved.
      </div>
    </div>
  );
};

export default EditReprintShiftPage;
