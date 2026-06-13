/**
 * Live Table Result resolution.
 *
 * RULE: Result = ONLY the latest Chip Count snapshot vs the ORIGINAL chip
 * baseline. NEVER cumulative. NEVER from Table Tracker.
 *
 * Priority:
 *   1. closing_result (table is closed/counted) — authoritative.
 *   2. Latest Chip Count snapshot for this table:
 *      Σ (snapshot.actual − chip_baseline.expected) × denom
 *   3. Otherwise → 0 (no Chip Count yet).
 *
 * Table Tracker is NOT used for Result. It feeds Drop V (turnover) only.
 */

export interface SnapshotRow {
  location_type: string;
  location_id: string | null;
  denomination: number | string;
  expected_quantity: number | string;
  actual_quantity: number | string;
  created_at?: string | null;
}

export type BaselineMap = Record<string, Record<number, number>>;

/**
 * Build a map: tableId → { latestTime, perDenom: { [denom]: actual_quantity } }
 * keeping only the LATEST snapshot batch per table (snapshots written in a single
 * Chip Count share a created_at).
 */
export const buildLatestTableSnapshot = (snapshots: SnapshotRow[]) => {
  const map: Record<string, { latestTime: string; perDenom: Record<number, number>; expectedPerDenom: Record<number, number> }> = {};
  // Sort ascending by time so later writes overwrite.
  const sorted = [...snapshots].sort((a, b) => (a.created_at || "").localeCompare(b.created_at || ""));
  sorted.forEach(s => {
    if (s.location_type !== "table" || !s.location_id) return;
    const t = s.created_at || "";
    const cur = map[s.location_id];
    if (!cur || t > cur.latestTime) {
      map[s.location_id] = { latestTime: t, perDenom: {}, expectedPerDenom: {} };
    }
    if (map[s.location_id].latestTime === t) {
      map[s.location_id].perDenom[Number(s.denomination)] = Number(s.actual_quantity);
      map[s.location_id].expectedPerDenom[Number(s.denomination)] = Number(s.expected_quantity);
    }
  });
  return map;
};

/** Result derived from a chip snapshot batch: Σ (actual - baseline) × denom. */
export const chipSnapshotResult = (
  perDenom: Record<number, number>,
  baselinePerDenom: Record<number, number>
) => {
  let total = 0;
  const denoms = new Set<number>([
    ...Object.keys(perDenom).map(Number),
    ...Object.keys(baselinePerDenom).map(Number),
  ]);
  denoms.forEach(d => {
    const actual = perDenom[d] ?? 0;
    const expected = baselinePerDenom[d] ?? 0;
    total += (actual - expected) * d;
  });
  return total;
};

export interface LiveResultArgs {
  tableId: string;
  closingResult: number | null | undefined;
  snapshotIndex: ReturnType<typeof buildLatestTableSnapshot>;
  baselineMap: BaselineMap;
  /**
   * Optional per-table Fill/Credit adjustment for the active shift
   * (`Σcredit − Σfill`). Added to the raw snapshot delta so the displayed
   * result matches the final shift P&L formula `SnapResult − Fill + Credit`.
   * Closed tables (with `closingResult`) are NOT adjusted — closing flow
   * already accounts for transfers.
   */
  adjustmentMap?: Record<string, number>;
}

/**
 * Returns the current displayed result for a single table.
 *
 * NEW MODEL (June 2026): Result comes EXCLUSIVELY from `gaming_tables.closing_result`
 * (set by Close Tables wizard). Chip Count snapshots are for Tracker / Analytics
 * only — they NEVER feed Live Result or Shift P&L.
 *
 * Per-table Fill/Credit adjustment is still added so totals match the DB RPC
 * `compute_shift_table_results` (closing_result − Fill + Credit).
 */
export const liveTableResult = ({
  tableId,
  closingResult,
  adjustmentMap,
}: LiveResultArgs): number => {
  const base = (closingResult !== null && closingResult !== undefined) ? Number(closingResult) : 0;
  return base + (adjustmentMap?.[tableId] ?? 0);
};

// Legacy helpers kept for Drop V / tracker totals consumers.
export interface TrackerRow {
  table_id: string;
  value: number | string;
  created_at?: string | null;
  updated_at?: string | null;
}
export const trackerTotal = (trackerData: TrackerRow[], tableId: string) =>
  trackerData.filter(t => t.table_id === tableId).reduce((s, t) => s + Number(t.value || 0), 0);
