import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Button } from "@/components/ui/button";
import { Save, Maximize2, Minimize2, History, Tablet, Users } from "lucide-react";
import { useChipSnapshots, useChipSnapshotsFull, useBatchChipSnapshot } from "@/hooks/use-chips";
import { useChipBaseline, baselineToMap } from "@/hooks/use-table-lifecycle";
import { useGamingTables, useSetTableTrackerValue, useBatchSetTableTrackerValue, useTableTracker, useTableHeadCount, useBatchSetTableHeadCount } from "@/hooks/use-casino-data";
import { CHIP_DENOMS, formatChipLabel, formatCurrency } from "@/lib/currency";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useChipColors, resolveChipColor, useVisibleChipDenoms } from "@/hooks/use-chip-colors";
import { nowEAT, getBusinessDate } from "@/lib/business-day";
import { chipSnapshotResult } from "@/lib/table-live-result";
import { useShiftTableAdjustments } from "@/hooks/use-shift-table-adjustments";
import { useAuth } from "@/lib/auth-context";

/** Compute the Number-Count tracker slot for a Chip Count taken at the given EAT time.
 *  Returns the target slot plus an `onlyIfEmpty` flag — when true, the caller must
 *  skip writing if the slot already has a value (the on-time check wins).
 *
 *  - 04:50–07:59 → slot 05:00 (Final). Always writes (closing override).
 *  - m ≥ 50      → slot HH+1:00 (early on-time). Always writes.
 *  - m ≤ 10      → slot HH:00   (late on-time).  Always writes.
 *  - m 11–49     → slot HH:00   (FALLBACK).      Writes ONLY if slot is empty
 *                                                (first late check fills the missed slot).
 *  Otherwise null (no auto-write). */
const slotForChipCount = (now: Date): { slot: string; onlyIfEmpty: boolean } | null => {
  const h = now.getHours();
  const m = now.getMinutes();
  // Final-count override: anything from 04:50 up to (but not including) 08:00 → Final 05:00
  if ((h === 4 && m >= 50) || h === 5 || h === 6 || h === 7) {
    return { slot: "05:00", onlyIfEmpty: false };
  }
  let targetH: number;
  let onlyIfEmpty = false;
  if (m >= 50) targetH = (h + 1) % 24;
  else if (m <= 10) targetH = h;
  else { targetH = h; onlyIfEmpty = true; } // m 11–49 fallback
  // Allowed slots: 19..23 and 00..04 (05:00 handled by the Final-window branch above)
  const allowed = (targetH >= 19 && targetH <= 23) || (targetH >= 0 && targetH <= 4);
  if (!allowed) return null;
  return { slot: `${String(targetH).padStart(2, "0")}:00`, onlyIfEmpty };
};

interface ChipCountPanelProps {
  date: string;
}

/**
 * Chip Count grid — tables as rows, denominations as columns.
 * Tablet-optimized: compact cells, sticky first column, single horizontal scroll.
 */
export const ChipCountPanel = ({ date }: ChipCountPanelProps) => {
  const { isManager } = useAuth();
  const today = getBusinessDate();
  const readOnly = date !== today && !isManager;

  const { data: tables = [] } = useGamingTables();
  const { data: snapshots = [] } = useChipSnapshots(date);
  // History panel must show ALL saves (not just the latest per location/denom),
  // otherwise the user only sees the most recent check while previous ones are
  // hidden — even though they were correctly written to Number Count tracker.
  const { data: snapshotsFull = [] } = useChipSnapshotsFull(date);
  const { data: baseline = [] } = useChipBaseline();
  const { data: chipColorOverrides } = useChipColors();
  const { data: headCountRows = [] } = useTableHeadCount(date);
  const batchSnapshot = useBatchChipSnapshot();
  const batchHeadCount = useBatchSetTableHeadCount();

  const baselineMap = useMemo(() => baselineToMap(baseline), [baseline]);
  // Include closed tables that already have a chip-count snapshot for the selected
  // date — closing a table mid-shift must NOT hide its chip count from review/edit.
  const tablesWithSnap = useMemo(() => {
    const s = new Set<string>();
    snapshots.forEach((sn: any) => { if (sn.location_type === "table" && sn.location_id) s.add(sn.location_id); });
    return s;
  }, [snapshots]);
  const openTables = useMemo(
    // Club Poker tables use a different settlement flow (no chip baseline / no snapshot count) — exclude from Chip Count grid.
    () => tables.filter(t => (t.status === "open" || tablesWithSnap.has(t.id)) && t.game !== "Club Poker"),
    [tables, tablesWithSnap]
  );

  const visibleCasinoDenoms = useVisibleChipDenoms();
  const visibleSet = useMemo(() => new Set(visibleCasinoDenoms), [visibleCasinoDenoms]);

  const countLocations = useMemo(() => {
    return openTables.map(t => ({
      key: `table-${t.id}`,
      label: t.name,
      type: "table" as const,
      id: t.id,
      denoms: (t.denominations || []).filter(d => visibleSet.has(d)),
    }));
  }, [openTables, visibleSet]);

  const latestSnapshotPerTable = useMemo(() => {
    const map: Record<string, { actual: Record<number, number>; expected: Record<number, number> }> = {};
    const sorted = [...snapshots].sort((a, b) => (a.created_at || "").localeCompare(b.created_at || ""));
    sorted.forEach((s: any) => {
      if (s.location_type !== "table" || !s.location_id) return;
      if (!map[s.location_id]) map[s.location_id] = { actual: {}, expected: {} };
      map[s.location_id].actual[Number(s.denomination)] = Number(s.actual_quantity);
      map[s.location_id].expected[Number(s.denomination)] = Number(s.expected_quantity);
    });
    return map;
  }, [snapshots]);

  // "Last check" placeholder value for a (table, denom): latest snapshot's
  // actual quantity if any was recorded this shift, otherwise the chip baseline.
  // Per UX request: input fields start EMPTY; this number is displayed as a
  // gray placeholder so Pit types only what changed instead of deleting prefilled
  // digits. When the field is left empty, computations fall back to this value.
  const getLastCheck = (tableId: string, denom: number): number => {
    const snap = latestSnapshotPerTable[tableId]?.actual[denom];
    if (snap !== undefined) return snap;
    return baselineMap[tableId]?.[denom] ?? 0;
  };

  // NaN sentinel means "empty input" → treated as "same as last check" for math.
  const [counts, setCounts] = useState<Record<string, Record<number, number>>>({});
  const [hcDraft, setHcDraft] = useState<Record<string, string>>({});
  const [fullscreen, setFullscreen] = useState(false);
  const [tabletMode, setTabletMode] = useState(false);
  const [detailTs, setDetailTs] = useState<string | null>(null);

  // Head-count target slot (same rounding rules as chip count → tracker).
  // Memoize per render; only used at save time and for the placeholder lookup.
  const hcTarget = useMemo(() => slotForChipCount(nowEAT()), [date, snapshots.length, headCountRows.length]);
  const hcSlot = hcTarget?.slot ?? null;

  const hcSlotValue = (tableId: string): string => {
    if (!hcSlot) return "";
    const r = headCountRows.find((x: any) => x.table_id === tableId && x.time_slot === hcSlot);
    return r && r.value !== null && r.value !== undefined ? String(r.value) : "";
  };

  // Reset typed-in counts ONLY when the SET of tables changes (open/close, or
  // table added). Do NOT reset on snapshots.length changing — realtime delivery
  // of a peer save (or our own save) was wiping in-progress typing.
  // The placeholder (`getLastCheck`) already reflects the newest snapshot, so
  // untouched cells stay visually correct without clobbering user input.
  const tableSetKey = useMemo(
    () => countLocations.map(l => l.key).sort().join("|"),
    [countLocations],
  );
  useEffect(() => {
    const initial: Record<string, Record<number, number>> = {};
    countLocations.forEach(loc => {
      initial[loc.key] = {};
      loc.denoms.forEach(d => {
        initial[loc.key][d] = NaN as any; // empty by default — placeholder shows last check
      });
    });
    setCounts(initial);
    setHcDraft({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableSetKey]);

  const visibleDenoms = useMemo(
    () => CHIP_DENOMS.filter(d => countLocations.some(loc => loc.denoms.includes(d))),
    [countLocations]
  );

  // Live Fill/Credit adjustments for the active shift (per table).
  // displayed = (actual − baseline) × denom + (Σcredit − Σfill)
  const { adjustmentFor } = useShiftTableAdjustments();

  const rowResults = useMemo(() => {
    return countLocations.map(loc => {
      const locCounts = counts[loc.key] || {};
      const tableBaseline = baselineMap[loc.id] || {};
      let raw = 0;
      visibleDenoms.forEach(d => {
        if (!loc.denoms.includes(d)) return;
        const expected = tableBaseline[d] || 0;
        const entered = locCounts[d];
        // Empty / NaN cell → use last check value (= placeholder) so partial entry
        // is intuitive: untouched denoms keep last reading, only edits move the result.
        const actual = entered === undefined || Number.isNaN(entered as any)
          ? getLastCheck(loc.id, d)
          : (entered as number);
        raw += (actual - expected) * d;
      });
      return { key: loc.key, total: raw + adjustmentFor(loc.id) };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countLocations, counts, baselineMap, visibleDenoms, adjustmentFor, latestSnapshotPerTable]);

  const grandTotal = rowResults.reduce((s, r) => s + r.total, 0);

  const setTrackerValue = useSetTableTrackerValue();
  const batchTracker = useBatchSetTableTrackerValue();
  const { data: trackerRows = [] } = useTableTracker(date);

  const handleSave = () => {
    const rows: Array<{
      location_type: string; location_id: string | null;
      denomination: number; expected_quantity: number; actual_quantity: number;
    }> = [];
    countLocations.forEach(loc => {
      const locCounts = counts[loc.key] || {};
      const tableBaseline = baselineMap[loc.id] || {};
      loc.denoms.forEach(d => {
        const entered = locCounts[d];
        // Strictly skip cells the user did not touch — empty/NaN means
        // "no change", so we do NOT write a new snapshot row for this
        // (table, denomination). The latest existing snapshot remains
        // the authoritative reading for downstream consumers.
        if (entered === undefined || Number.isNaN(entered as any)) return;
        const expected = tableBaseline[d] || 0;
        rows.push({ location_type: loc.type, location_id: loc.id, denomination: d, expected_quantity: expected, actual_quantity: entered as number });
      });
    });
    batchSnapshot.mutate({ date, counts: rows });

    // Auto-write per-table row result into Number Count tracker for the rounded slot.
    // On-time (:50–:10) always writes; fallback (:11–:49) writes only if slot is empty.
    // Batch all tracker writes into ONE upsert — firing 10-20 parallel
    // upserts was a major cause of the post-Save freeze on slow PCs.
    const target = slotForChipCount(nowEAT());
    if (target) {
      const { slot, onlyIfEmpty } = target;
      const entries: Array<{ table_id: string; time_slot: string; value: number }> = [];
      countLocations.forEach((loc, ri) => {
        if (onlyIfEmpty) {
          const existing = trackerRows.find(
            (t: any) => t.table_id === loc.id && t.time_slot === slot,
          );
          if (existing && existing.value !== null && existing.value !== undefined && String(existing.value) !== "") {
            return;
          }
        }
        const total = rowResults[ri]?.total ?? 0;
        entries.push({ table_id: loc.id, time_slot: slot, value: total });
      });
      if (entries.length > 0) batchTracker.mutate({ date, entries });
    }
    void setTrackerValue; // retained for backwards-compat (unused here)
  };

  // Early-return moved below all hooks to keep hook order stable (React #310).

  const renderGrid = (full: boolean) => {
    // Tablet mode: extra-large cells & numbers for in-pit chip counts on a tablet.
    const t = (tabletMode || full)
      ? {
          chipClass: "cms-chip-token cms-chip-token-lg",
          inputH: "h-16",
          inputText: "text-2xl",
          firstColW: "240px",
          firstColText: "text-2xl",
          headerText: "text-sm",
          chipColW: "96px",
          resultColW: "200px",
          rowPadX: "px-2",
          rowPadY: "py-2",
          headerPadY: "py-3",
          totalText: "text-xl",
          resultText: "text-xl",
        }
      : {
          chipClass: "cms-chip-token",
          inputH: "h-8",
          inputText: "text-xs",
          firstColW: "56px",
          firstColText: "text-xs",
          headerText: "text-xs",
          chipColW: "52px",
          resultColW: "140px",
          rowPadX: "px-1",
          rowPadY: "py-1",
          headerPadY: "py-2",
          totalText: "text-sm",
          resultText: "text-xs",
        };

    return (
      <div className={`rounded-md border border-border bg-card ${full ? "h-full flex flex-col" : ""}`}>
        <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
          <div>
            <h3 className="text-sm font-semibold text-card-foreground">Chip Count</h3>
            <p className="text-[10px] text-muted-foreground">Rows: tables · Columns: denominations · Result includes Fill/Credit for current shift</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant={tabletMode ? "default" : "outline"}
              onClick={() => setTabletMode(m => !m)}
              className="gap-1.5 h-8"
              title={tabletMode ? "Exit tablet mode" : "Tablet mode (XL cells)"}
            >
              <Tablet className="w-4 h-4" />
              <span className="hidden sm:inline">Tablet</span>
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setFullscreen(f => !f)}
              className="gap-1.5 h-8"
              title={fullscreen ? "Exit fullscreen" : "Open fullscreen"}
            >
              {fullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              <span className="hidden sm:inline">{fullscreen ? "Exit" : "Fullscreen"}</span>
            </Button>
            <Button size="sm" onClick={handleSave} disabled={batchSnapshot.isPending} className="gap-1.5 h-8">
              <Save className="w-4 h-4" /> {batchSnapshot.isPending ? "Saving…" : "Save Snapshot"}
            </Button>
          </div>
        </div>
        <div className={`overflow-auto ${full ? "flex-1" : ""}`}>
          <table className="border-collapse w-full">
            <colgroup>
              <col style={{ width: t.firstColW }} />
              {visibleDenoms.map(d => (
                <col key={d} style={{ width: t.chipColW }} />
              ))}
              <col style={{ width: t.resultColW }} />
            </colgroup>
            <thead>
              <tr className="border-b border-border">
                <th className={`text-left ${t.headerPadY} px-2 text-muted-foreground font-medium sticky left-0 bg-card z-10 ${t.headerText} uppercase tracking-wider`}>
                  Table
                </th>
                {visibleDenoms.map(d => {
                  const c = resolveChipColor(d, chipColorOverrides);
                  return (
                    <th key={d} className={`text-center ${t.headerPadY} px-0.5 font-medium`}>
                      <span
                        className={t.chipClass}
                        style={{ "--chip-bg": c.bg, "--chip-edge": c.edge, "--chip-text": c.text } as CSSProperties}
                      >
                        {formatChipLabel(d)}
                      </span>
                    </th>
                  );
                })}
                <th className={`text-right ${t.headerPadY} px-2 text-muted-foreground font-medium text-xs uppercase tracking-wider`}>Result</th>
              </tr>
            </thead>
            <tbody>
              {countLocations.map((loc, ri) => {
                const locCounts = counts[loc.key] || {};
                const tableBaseline = baselineMap[loc.id] || {};
                const rowResult = rowResults[ri]?.total ?? 0;
                return (
                  <tr key={loc.key} className={`border-b border-border last:border-0 ${ri % 2 === 1 ? "bg-muted/10" : ""}`}>
                    <td
                      className={`${t.rowPadY} px-2 font-semibold text-card-foreground sticky left-0 z-10 whitespace-nowrap ${t.firstColText} ${ri % 2 === 1 ? "bg-card/95" : "bg-card"}`}
                    >
                      {loc.label}
                    </td>
                    {visibleDenoms.map(d => {
                      if (!loc.denoms.includes(d)) {
                        return <td key={d} className={`${t.rowPadX} ${t.rowPadY} text-center text-muted-foreground/30`}>·</td>;
                      }
                      const lastCheck = getLastCheck(loc.id, d);
                      const raw = locCounts[d];
                      const isEmpty = raw === undefined || Number.isNaN(raw as any);
                      return (
                        <td key={d} className={`${t.rowPadX} ${t.rowPadY}`}>
                          <input
                            type="number" min="0" max="999" maxLength={3}
                            value={isEmpty ? "" : (raw as number)}
                            onFocus={e => {
                              requestAnimationFrame(() => e.target.select());
                            }}
                            onChange={e => {
                              if (e.target.value === "") {
                                setCounts(c => ({ ...c, [loc.key]: { ...(c[loc.key] || {}), [d]: NaN as any } }));
                                return;
                              }
                              let val = parseInt(e.target.value, 10);
                              if (isNaN(val)) return;
                              if (val > 999) val = 999;
                              if (val < 0) val = 0;
                              setCounts(c => ({ ...c, [loc.key]: { ...(c[loc.key] || {}), [d]: val } }));
                            }}
                            className={`no-spin w-full ${t.inputH} ${t.inputText} rounded font-mono text-center border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary text-card-foreground placeholder:text-muted-foreground/50`}
                            placeholder={String(lastCheck)}
                          />
                        </td>
                      );
                    })}
                    <td className={`px-2 ${t.rowPadY} text-right font-mono ${t.resultText} font-bold whitespace-nowrap ${rowResult >= 0 ? "text-success" : "text-destructive"}`}>
                      {rowResult >= 0 ? "+" : ""}{formatCurrency(rowResult)}
                    </td>
                  </tr>
                );
              })}
              <tr className="border-t-2 border-primary/30 bg-muted/30">
                <td className={`py-2 px-2 ${t.totalText} font-bold uppercase text-card-foreground sticky left-0 bg-muted/30 z-10`}>
                  Total
                </td>
                <td colSpan={visibleDenoms.length} />
                <td className={`px-2 py-2 text-right font-mono ${t.totalText} font-bold whitespace-nowrap ${grandTotal >= 0 ? "text-success" : "text-destructive"}`}>
                  {grandTotal >= 0 ? "+" : ""}{formatCurrency(grandTotal)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // ===== Snapshot history (per save = group of rows sharing created_at) =====
  const history = useMemo(() => {
    const groups: Record<string, { ts: string; perTableDenoms: Record<string, { actual: Record<number, number>; expected: Record<number, number> }> }> = {};
    snapshotsFull.forEach((s: any) => {
      if (s.location_type !== "table" || !s.location_id) return;
      const ts = s.created_at;
      if (!groups[ts]) groups[ts] = { ts, perTableDenoms: {} };
      if (!groups[ts].perTableDenoms[s.location_id]) {
        groups[ts].perTableDenoms[s.location_id] = { actual: {}, expected: {} };
      }
      groups[ts].perTableDenoms[s.location_id].actual[Number(s.denomination)] = Number(s.actual_quantity);
      groups[ts].perTableDenoms[s.location_id].expected[Number(s.denomination)] = Number(s.expected_quantity);
    });
    return Object.values(groups).map(g => {
      const perTable: Record<string, number> = {};
      Object.entries(g.perTableDenoms).forEach(([tableId, denoms]) => {
        perTable[tableId] = chipSnapshotResult(denoms.actual, denoms.expected);
      });
      return { ts: g.ts, perTable, total: Object.values(perTable).reduce((s, v) => s + v, 0) };
    }).sort((a, b) => b.ts.localeCompare(a.ts));
  }, [snapshotsFull, baselineMap]);

  // Columns for the history table = every table that has any snapshot today
  // (including ones that were closed mid-shift), in the same order as the
  // main grid. Falls back to countLocations when no extra tables found.
  const historyColumns = useMemo(() => {
    const ids = new Set<string>();
    snapshotsFull.forEach((s: any) => {
      if (s.location_type === "table" && s.location_id) ids.add(s.location_id);
    });
    const fromGrid = countLocations.filter(loc => ids.has(loc.id) || true); // keep grid order
    const gridIds = new Set(countLocations.map(l => l.id));
    const extras = tables
      .filter(t => ids.has(t.id) && !gridIds.has(t.id))
      .map(t => ({ key: `table-${t.id}`, label: t.name, id: t.id }));
    return [...fromGrid, ...extras];
  }, [snapshotsFull, countLocations, tables]);

  if (openTables.length === 0) {
    return <p className="text-muted-foreground text-sm text-center py-8">No open tables</p>;
  }

  return (
    <>
      {renderGrid(false)}
      <Dialog open={fullscreen} onOpenChange={setFullscreen}>
        <DialogContent className="max-w-[98vw] w-[98vw] h-[96vh] p-0 sm:rounded-lg overflow-hidden flex flex-col">
          {renderGrid(true)}
        </DialogContent>
      </Dialog>

      {history.length > 0 && (
        <div className="mt-3 rounded-md border border-border bg-card">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
            <History className="w-4 h-4 text-muted-foreground" />
            <h4 className="text-sm font-semibold text-card-foreground">Snapshot history · {date}</h4>
            <span className="text-[10px] text-muted-foreground ml-auto">{history.length} saves · raw chip delta (without Fill/Credit)</span>
          </div>
          <div className="overflow-auto max-h-[280px]">
            <table className="w-full border-collapse text-xs">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b border-border">
                  <th className="text-left px-2 py-1.5 font-medium text-muted-foreground uppercase tracking-wider text-[10px]">Time</th>
                  {historyColumns.map(loc => (
                    <th key={loc.id} className="text-right px-2 py-1.5 font-medium text-muted-foreground text-[10px]">{loc.label}</th>
                  ))}
                  <th className="text-right px-2 py-1.5 font-medium text-muted-foreground uppercase tracking-wider text-[10px]">Total</th>
                </tr>
              </thead>
              <tbody>
                {history.map((g, i) => {
                  const time = new Date(g.ts).toLocaleTimeString("en-GB", { timeZone: "Africa/Dar_es_Salaam", hour: "2-digit", minute: "2-digit" });
                  return (
                    <tr key={g.ts} className={`border-b border-border last:border-0 ${i % 2 === 1 ? "bg-muted/10" : ""}`}>
                      <td className="px-2 py-1 font-mono text-card-foreground">{time}</td>
                      {historyColumns.map(loc => {
                        const v = g.perTable[loc.id];
                        if (v === undefined) return <td key={loc.id} className="px-2 py-1 text-right text-muted-foreground/30">·</td>;
                        return (
                          <td key={loc.id} className={`px-2 py-1 text-right font-mono ${v >= 0 ? "text-success" : "text-destructive"}`}>
                            {v >= 0 ? "+" : ""}{formatCurrency(v)}
                          </td>
                        );
                      })}
                      <td className={`px-2 py-1 text-right font-mono font-bold ${g.total >= 0 ? "text-success" : "text-destructive"}`}>
                        {g.total >= 0 ? "+" : ""}{formatCurrency(g.total)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="sticky bottom-0 bg-card">
                <tr className="border-t-2 border-border">
                  <td className="px-2 py-1 text-muted-foreground text-[10px] uppercase tracking-wider">Fill/Credit (shift)</td>
                  {historyColumns.map(loc => {
                    const adj = adjustmentFor(loc.id);
                    if (!adj) return <td key={loc.id} className="px-2 py-1 text-right text-muted-foreground/30">·</td>;
                    return (
                      <td key={loc.id} className={`px-2 py-1 text-right font-mono ${adj >= 0 ? "text-success" : "text-destructive"}`}>
                        {adj >= 0 ? "+" : ""}{formatCurrency(adj)}
                      </td>
                    );
                  })}
                  <td className={`px-2 py-1 text-right font-mono font-semibold ${historyColumns.reduce((s, l) => s + adjustmentFor(l.id), 0) >= 0 ? "text-success" : "text-destructive"}`}>
                    {(() => { const t = historyColumns.reduce((s, l) => s + adjustmentFor(l.id), 0); return (t >= 0 ? "+" : "") + formatCurrency(t); })()}
                  </td>
                </tr>
                <tr className="border-t border-border bg-muted/20">
                  <td className="px-2 py-1 text-card-foreground text-[10px] uppercase tracking-wider font-semibold">Current (latest + Fill/Credit)</td>
                  {historyColumns.map(loc => {
                    const r = rowResults.find(rr => rr.key === loc.key);
                    const v = r?.total ?? 0;
                    return (
                      <td key={loc.id} className={`px-2 py-1 text-right font-mono font-semibold ${v >= 0 ? "text-success" : "text-destructive"}`}>
                        {v >= 0 ? "+" : ""}{formatCurrency(v)}
                      </td>
                    );
                  })}
                  <td className={`px-2 py-1 text-right font-mono font-bold ${grandTotal >= 0 ? "text-success" : "text-destructive"}`}>
                    {grandTotal >= 0 ? "+" : ""}{formatCurrency(grandTotal)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </>
  );
};
