/**
 * EditReprintShiftDialog — "Reprint with edits".
 *
 * Loads a closed shift's snapshot data exactly like ReprintShiftDialog, but
 * surfaces editable fields for cash open/close (per currency, native totals),
 * chips open/close (per denomination), tips, expenses, table results, cashless
 * IN/OUT and balance. Edits are kept in local React state only — NOTHING is
 * written to the database. The Print button renders the printable area with
 * the edited values via overrides on ShiftClosingReport / ChipMovementReport.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Printer, X, RotateCcw } from "lucide-react";
import { CHIP_DENOMS, CURRENCIES, formatNumberSpaces, formatChipLabel } from "@/lib/currency";
import { computeMissByDenom } from "@/components/cage/CageHelpers";
import ShiftClosingReport from "@/components/cage/ShiftClosingReport";
import ChipMovementReport from "@/components/cage/ChipMovementReport";
import PrintPortal from "@/components/cage/PrintPortal";
import { printLiveGameReport } from "@/components/cage/printLiveGameReport";
import type { Tables } from "@/integrations/supabase/types";

interface Props {
  open: boolean;
  onClose: () => void;
  shiftId: string;
  casinoId: string;
}

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
  const [text, setText] = (require("react") as typeof import("react")).useState(() => formatSpaces(value));
  const lastExternal = (require("react") as typeof import("react")).useRef(value);
  (require("react") as typeof import("react")).useEffect(() => {
    if (value !== lastExternal.current && value !== parseSpaces(text)) {
      setText(formatSpaces(value));
      lastExternal.current = value;
    }
  }, [value]);
  return (
    <Input
      type="text"
      inputMode="numeric"
      className={`h-8 text-right font-mono tabular-nums ${className}`}
      value={text}
      onChange={(e) => {
        const raw = e.target.value;
        const n = parseSpaces(raw);
        setText(raw === "" ? "" : formatSpaces(n));
        lastExternal.current = n;
        onChange(n);
      }}
    />
  );
};

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="cms-panel p-3 space-y-2">
    <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</div>
    {children}
  </div>
);

const EditReprintShiftDialog = ({ open, onClose, shiftId, casinoId }: Props) => {
  const { data, isLoading } = useQuery({
    queryKey: ["edit-reprint-shift", shiftId],
    enabled: open && !!shiftId && !!casinoId,
    queryFn: async () => {
      const { data: shift } = await supabase.from("shifts").select("*").eq("id", shiftId).maybeSingle();
      const fromIso = (shift as any)?.opened_at ?? "1970-01-01T00:00:00Z";
      const toIso = (shift as any)?.closed_at ?? new Date().toISOString();
      const [
        { data: tables },
        { data: exp },
        { data: transfers },
        { data: cashless },
      ] = await Promise.all([
        supabase.from("gaming_tables").select("*").eq("casino_id", casinoId),
        supabase.from("expenses").select("amount").eq("shift_id", shiftId),
        supabase.from("cage_transfers").select("transfer_type, amount, chips, table_id").eq("shift_id", shiftId),
        (supabase as any).from("cashless_transactions")
          .select("direction, provider, amount, created_at")
          .eq("casino_id", casinoId)
          .eq("cage_type", "live_game")
          .gte("created_at", fromIso)
          .lte("created_at", toIso),
      ]);
      const totalExpenses = (exp || []).reduce((s: number, r: any) => s + Number(r.amount || 0), 0);
      return { shift, tables: tables || [], totalExpenses, transfers: transfers || [], cashless: cashless || [] };
    },
  });

  const shift = data?.shift as Tables<"shifts"> | undefined;
  const tables = (data?.tables || []) as Tables<"gaming_tables">[];
  const businessDate = useMemo(
    () => (shift?.closed_at ? businessDateForEAT(shift.closed_at) : ""),
    [shift?.closed_at],
  );

  // -------- Build initial editable state from snapshot --------
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
    CHIP_DENOMS.forEach(d => {
      openChips[d] = Number((opening.chips || {})[d] ?? (opening.chips || {})[String(d)] ?? 0);
      closeChips[d] = Number((closing.chips || {})[d] ?? (closing.chips || {})[String(d)] ?? 0);
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
        if (r.table_id) tableFill[r.table_id] = (tableFill[r.table_id] || 0) + Number(r.amount || 0);
        Object.entries((r.chips || {}) as Record<string, number>).forEach(([d, q]) => {
          fillByDenom[Number(d)] = (fillByDenom[Number(d)] || 0) + Number(q || 0);
        });
      } else if (r.transfer_type === "credit") {
        if (r.table_id) tableCredit[r.table_id] = (tableCredit[r.table_id] || 0) + Number(r.amount || 0);
        Object.entries((r.chips || {}) as Record<string, number>).forEach(([d, q]) => {
          creditByDenom[Number(d)] = (creditByDenom[Number(d)] || 0) + Number(q || 0);
        });
      }
    });

    return {
      openCashByCcy,
      closeCashByCcy,
      openChips,
      closeChips,
      totalExpenses: data?.totalExpenses || 0,
      tipsTotal: 0,
      addFloat,
      slotsOut,
      fillByDenom,
      creditByDenom,
      cashlessIO,
      resultTable: Number((shift as any).tables_result ?? closing.result_table ?? 0),
      balance: Number((shift as any).balance ?? closing.cash_desk_balance ?? 0),
      missTotal: Number((shift as any).miss_total ?? -(closing.chip_miss_total ?? 0)),
      exchangeRates: ((shift as any).exchange_rates || {}) as Record<string, number>,
    };
  }, [shift, data]);

  // -------- Editable state --------
  const [state, setState] = useState<typeof initial>(null);
  useEffect(() => { if (initial) setState(initial); }, [initial]);

  if (!open) return null;

  const reset = () => { if (initial) setState({ ...initial }); };

  // Derived: auto-recomputed Miss from current chip qty deltas
  const recomputedMiss = useMemo(() => {
    if (!state) return { perDenom: {} as ChipMap, total: 0 };
    const perDenom = computeMissByDenom(state.openChips, state.closeChips, CHIP_DENOMS as any);
    const total = (CHIP_DENOMS as any).reduce((s: number, d: number) => s + d * (perDenom[d] || 0), 0);
    return { perDenom, total };
  }, [state?.openChips, state?.closeChips]);

  // Build overrides for the printable components
  const built = useMemo(() => {
    if (!state || !shift) return null;
    // Build cash objects with a single synthetic "denom = native total" so
    // the per-currency totals match the edited values exactly (the report
    // only displays per-currency sums, not per-denom breakdowns).
    const buildCashObj = (byCcy: CashByCurrency) => {
      const out: Record<string, Record<string, number>> = {};
      CURRENCIES.forEach(c => {
        out[c] = { "1": Number(byCcy[c] || 0) };
      });
      return out;
    };
    const openingFloat = {
      ...(shift.opening_float as any || {}),
      cash: buildCashObj(state.openCashByCcy),
      chips: state.openChips,
    };
    const closingCount = {
      ...(shift.closing_count as any || {}),
      cash: buildCashObj(state.closeCashByCcy),
      chips: state.closeChips,
    };
    return { openingFloat, closingCount };
  }, [state, shift]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-6xl max-h-[92vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-5 pt-4 pb-2 border-b border-border">
          <DialogTitle>Reprint with edits — Live Game</DialogTitle>
          <p className="text-xs text-muted-foreground">
            Edits are kept only in memory for this print. Nothing is saved to the database.
          </p>
        </DialogHeader>

        {isLoading || !shift || !state ? (
          <div className="text-center text-muted-foreground py-16 text-sm">Loading…</div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 p-4 overflow-y-auto flex-1">
            {/* ============ LEFT — EDIT FORM ============ */}
            <div className="space-y-3">
              {/* Cash per currency */}
              <Section title="Cash open / close (per currency, native total)">
                <div className="grid grid-cols-[60px,1fr,1fr] gap-2 items-center text-xs">
                  <div />
                  <div className="text-[10px] uppercase text-muted-foreground text-center">Open</div>
                  <div className="text-[10px] uppercase text-muted-foreground text-center">Close</div>
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

              {/* Chips open/close per denom */}
              <Section title="Chips open / close (per denomination, qty)">
                <div className="grid grid-cols-[60px,1fr,1fr] gap-2 items-center text-xs">
                  <div />
                  <div className="text-[10px] uppercase text-muted-foreground text-center">Open qty</div>
                  <div className="text-[10px] uppercase text-muted-foreground text-center">Close qty</div>
                  {CHIP_DENOMS.map(d => (
                    <FragmentRow key={d} label={formatChipLabel(d)}
                      o={state.openChips[d] || 0}
                      cV={state.closeChips[d] || 0}
                      onO={(n) => setState({ ...state, openChips: { ...state.openChips, [d]: n } })}
                      onC={(n) => setState({ ...state, closeChips: { ...state.closeChips, [d]: n } })}
                    />
                  ))}
                </div>
                <div className="text-[11px] text-muted-foreground pt-1 border-t border-border mt-2">
                  Miss recalculated: <span className="font-mono">{formatNumberSpaces(recomputedMiss.total)}</span>
                </div>
              </Section>

              {/* Cashless IN/OUT per provider */}
              <Section title="Cashless (IN / OUT per provider)">
                <div className="grid grid-cols-[60px,1fr,1fr] gap-2 items-center text-xs">
                  <div />
                  <div className="text-[10px] uppercase text-muted-foreground text-center">IN</div>
                  <div className="text-[10px] uppercase text-muted-foreground text-center">OUT</div>
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

              {/* Totals & balance */}
              <Section title="Totals & balance">
                <div className="grid grid-cols-[1fr,160px] gap-2 items-center text-xs">
                  <span>Tables Result (override)</span>
                  <NumInput value={state.resultTable} onChange={(n) => setState({ ...state, resultTable: n })} />
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

            {/* ============ RIGHT — LIVE PREVIEW ============ */}
            <div className="border border-border rounded-md overflow-auto bg-white text-black max-h-[80vh]">
              <div className="origin-top-left scale-[0.55] w-[182%]">
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
        )}

        {/* Print-only area (lives outside the dialog via portal) */}
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

        <DialogFooter className="px-5 py-3 border-t border-border print:hidden">
          <Button variant="outline" onClick={reset} className="gap-1.5" disabled={!state}>
            <RotateCcw className="w-4 h-4" /> Reset
          </Button>
          <Button variant="outline" onClick={onClose} className="gap-1.5">
            <X className="w-4 h-4" /> Close
          </Button>
          <Button onClick={printLiveGameReport} className="gap-1.5" disabled={!state}>
            <Printer className="w-4 h-4" /> Print
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// Row helper — label + two numeric inputs
const FragmentRow = ({ label, o, cV, onO, onC }: {
  label: string; o: number; cV: number;
  onO: (n: number) => void; onC: (n: number) => void;
}) => (
  <>
    <div className="text-xs font-medium text-muted-foreground">{label}</div>
    <NumInput value={o} onChange={onO} />
    <NumInput value={cV} onChange={onC} />
  </>
);

export default EditReprintShiftDialog;
