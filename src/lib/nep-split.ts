/**
 * Per-business-day peak-NEP Drop split (June 2026 model).
 *
 *   For each business day a player plays, walk transactions in chronological order:
 *     NEP_day starts at 0
 *     `in` / `buy`     → NEP_day += amount;  peak_day = max(peak_day, NEP_day)
 *     `out` / `cashout`→ NEP_day -= amount
 *   Drop R (External)  = peak_day
 *   Drop V (Recycled)  = total_in_day − peak_day
 *
 *   Period / lifetime totals are the SUM of daily values inside the window.
 *   Lifetime history outside the window does NOT influence the split.
 *   Per-table split divides one player's daily peak proportionally to how much
 *   they bought in at each table that day.
 *   Cancelled transactions are ignored.
 *
 * Authoritative computation lives in DB RPCs:
 *   - compute_player_drop_split(player_id, from, to)
 *   - compute_players_drop_split(casino_id, from, to)
 *   - compute_tables_drop_split(casino_id, from, to)
 * These pure helpers mirror the DB logic for client-side previews / tests.
 */

export type NepTx = {
  player_id: string | null;
  table_id?: string | null;
  type: string;
  amount: number | string;
  created_at: string;
  cancelled_at?: string | null;
  id?: string;
};

export type SplitTotals = { dropR: number; recycled: number };

const isCashIn = (t: NepTx) => t.type === "buy" || t.type === "in";
const isCashOut = (t: NepTx) => t.type === "cashout" || t.type === "out";

/**
 * Africa/Dar_es_Salaam (UTC+3), business-day rollover at 07:00 EAT.
 * Mirrors DB `business_date_of`.
 */
const businessDateOf = (iso: string): string => {
  const t = new Date(iso).getTime();
  // shift back 7h (rollover) then read EAT (UTC+3) wall date
  const shifted = new Date(t - 7 * 60 * 60 * 1000 + 3 * 60 * 60 * 1000);
  return shifted.toISOString().slice(0, 10);
};

const compareTx = (a: NepTx, b: NepTx) => {
  if (a.created_at !== b.created_at) return a.created_at.localeCompare(b.created_at);
  return (a.id || "").localeCompare(b.id || "");
};

const dayPeak = (dayTxs: NepTx[]): { peak: number; totalIn: number } => {
  let nep = 0;
  let peak = 0;
  let totalIn = 0;
  for (const t of dayTxs) {
    const amt = Number(t.amount) || 0;
    if (isCashIn(t)) {
      nep += amt;
      totalIn += amt;
      if (nep > peak) peak = nep;
    } else if (isCashOut(t)) {
      nep -= amt;
    }
  }
  return { peak, totalIn };
};

const groupByDay = (txs: NepTx[]): Map<string, NepTx[]> => {
  const m = new Map<string, NepTx[]>();
  for (const t of txs) {
    if (t.cancelled_at) continue;
    const bd = businessDateOf(t.created_at);
    let arr = m.get(bd);
    if (!arr) { arr = []; m.set(bd, arr); }
    arr.push(t);
  }
  for (const [, arr] of m) arr.sort(compareTx);
  return m;
};

/** Drop R / Drop V for a single player over a window (sum of per-day peaks). */
export function splitPlayerWindow(
  txs: NepTx[],
  fromIso: string,
  toIso: string
): SplitTotals {
  const inWindow = txs.filter(t => t.created_at >= fromIso && t.created_at <= toIso);
  const days = groupByDay(inWindow);
  let dropR = 0;
  let recycled = 0;
  for (const [, dayTxs] of days) {
    const { peak, totalIn } = dayPeak(dayTxs);
    dropR += peak;
    recycled += totalIn - peak;
  }
  return { dropR, recycled };
}

/** Per-player split over a window from a flat list. */
export function splitPlayersWindow(
  txs: NepTx[],
  fromIso: string,
  toIso: string
): Map<string, SplitTotals> {
  const out = new Map<string, SplitTotals>();
  const byPlayer = new Map<string, NepTx[]>();
  for (const t of txs) {
    if (!t.player_id) continue;
    let arr = byPlayer.get(t.player_id);
    if (!arr) { arr = []; byPlayer.set(t.player_id, arr); }
    arr.push(t);
  }
  for (const [pid, list] of byPlayer) {
    out.set(pid, splitPlayerWindow(list, fromIso, toIso));
  }
  return out;
}

/** Per-table split: one peak per (player, day), distributed proportionally to IN per table. */
export function splitTablesWindow(
  txs: NepTx[],
  fromIso: string,
  toIso: string
): Map<string, SplitTotals> {
  const byPlayer = new Map<string, NepTx[]>();
  for (const t of txs) {
    if (!t.player_id) continue;
    if (t.cancelled_at) continue;
    if (t.created_at < fromIso || t.created_at > toIso) continue;
    let arr = byPlayer.get(t.player_id);
    if (!arr) { arr = []; byPlayer.set(t.player_id, arr); }
    arr.push(t);
  }
  const result = new Map<string, SplitTotals>();
  const bump = (tableId: string, ext: number, rec: number) => {
    let cur = result.get(tableId);
    if (!cur) { cur = { dropR: 0, recycled: 0 }; result.set(tableId, cur); }
    cur.dropR += ext;
    cur.recycled += rec;
  };
  for (const [, plist] of byPlayer) {
    const days = groupByDay(plist);
    for (const [, dayTxs] of days) {
      const { peak, totalIn } = dayPeak(dayTxs);
      if (totalIn <= 0) continue;
      // sum IN per table for the day
      const inByTable = new Map<string, number>();
      for (const t of dayTxs) {
        if (!isCashIn(t) || !t.table_id) continue;
        const amt = Number(t.amount) || 0;
        inByTable.set(t.table_id, (inByTable.get(t.table_id) || 0) + amt);
      }
      const recycledTotal = totalIn - peak;
      for (const [tid, inT] of inByTable) {
        const dr = (peak * inT) / totalIn;
        const dv = (recycledTotal * inT) / totalIn;
        bump(tid, dr, dv);
      }
    }
  }
  return result;
}
