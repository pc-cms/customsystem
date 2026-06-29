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
import { computeMissByDenom } from "@/components/cage/CageHelpers";
import ShiftClosingReport from "@/components/cage/ShiftClosingReport";
import ChipMovementReport from "@/components/cage/ChipMovementReport";
import PrintPortal from "@/components/cage/PrintPortal";
import { printLiveGameReport } from "@/components/cage/printLiveGameReport";
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
        const n = parseSpaces(raw);
        setText(raw === "" ? "" : formatSpaces(n));
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
      ]);
      const totalExpenses = (exp || []).reduce((s: number, r: any) => s + Number(r.amount || 0), 0);
      const tableResults: Record<string, number> = {};
      (tableResRpc || []).forEach((r: any) => {
        if (r?.table_id) tableResults[r.table_id] = Number(r.result ?? 0);
      });
      return { shift, tables: tables || [], totalExpenses, transfers: transfers || [], cashless: cashless || [], tableResults };
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
    (data?.transfers || []).forEach((r: any) => {
      if (r.transfer_type === "add_float") addFloat += Number(r.amount || 0);
      else if (r.transfer_type === "slots_out") slotsOut += Number(r.amount || 0);
      else if (r.transfer_type === "fill") {
        Object.entries((r.chips || {}) as Record<string, number>).forEach(([d, q]) => {
          fillByDenom[Number(d)] = (fillByDenom[Number(d)] || 0) + Number(q || 0);
        });
      } else if (r.transfer_type === "credit") {
        Object.entries((r.chips || {}) as Record<string, number>).forEach(([d, q]) => {
          creditByDenom[Number(d)] = (creditByDenom[Number(d)] || 0) + Number(q || 0);
        });
      }
    });
    return {
      openCashByCcy, closeCashByCcy, openChips, closeChips,
      totalExpenses: data?.totalExpenses || 0,
      tipsTotal: 0, addFloat, slotsOut, fillByDenom, creditByDenom, cashlessIO,
      resultTable: Number((shift as any).tables_result ?? closing.result_table ?? 0),
      balance: Number((shift as any).balance ?? closing.cash_desk_balance ?? 0),
      missTotal: Number((shift as any).miss_total ?? -(closing.chip_miss_total ?? 0)),
      exchangeRates: ((shift as any).exchange_rates || {}) as Record<string, number>,
      tableRes: { ...(data?.tableResults || {}) } as Record<string, number>,
    };
  }, [shift, data]);

  const [state, setState] = useState<typeof initial>(null);
  const [resultAuto, setResultAuto] = useState(true);
  const [chipsAuto, setChipsAuto] = useState(false);
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
    const perDenom = computeMissByDenom(state.openChips, state.closeChips, CHIP_DENOMS as any);
    const total = (CHIP_DENOMS as any).reduce((s: number, d: number) => s + d * (perDenom[d] || 0), 0);
    return { perDenom, total };
  }, [state?.openChips, state?.closeChips]);

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
    const out: Record<string, { res: number }> = {};
    Object.entries(state.tableRes || {}).forEach(([id, v]) => { out[id] = { res: Number(v) || 0 }; });
    return out;
  }, [state?.tableRes]);

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
        <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2 p-2 print:block print:overflow-visible">
          {/* ============ LEFT — EDIT FORM ============ */}
          <div className="min-h-0 overflow-auto pr-1">
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

              {/* Per-table results */}
              <Section title="Table results (per table)">
                <div className="grid grid-cols-[1fr,110px,1fr,110px] gap-1 items-center">
                  {reportTables.length === 0 && (
                    <div className="col-span-4 text-muted-foreground text-[11px]">No tables.</div>
                  )}
                  {reportTables.map(t => (
                    <FragmentRowSingle
                      key={t.id}
                      label={t.name}
                      value={Number(state.tableRes?.[t.id]) || 0}
                      onChange={(n) => {
                        const nextMap = { ...(state.tableRes || {}), [t.id]: n };
                        const sum = reportTables.reduce(
                          (s, tt) => s + (tt.id === t.id ? n : (Number(nextMap[tt.id]) || 0)),
                          0,
                        );
                        setResultAuto(false);
                        setChipsAuto(true);
                        setState({ ...state, tableRes: nextMap, resultTable: sum, closeChips: redistributeCloseChips(sum) });
                      }}
                    />
                  ))}
                </div>
                <div className="text-[10px] text-muted-foreground pt-1 border-t border-border mt-1 flex justify-between gap-2">
                  <span>Editing a row auto-recalculates CLOSE chips (print only).</span>
                  <span className="font-mono whitespace-nowrap">Σ {formatNumberSpaces(tablesResSum)}</span>
                </div>
              </Section>

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

export default EditReprintShiftPage;
