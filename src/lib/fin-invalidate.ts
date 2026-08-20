import type { QueryClient } from "@tanstack/react-query";

/**
 * Query-key roots that feed any financial figure: wallets, expenses, day
 * closings, the Casino Monthly Balance grid and the dashboard "Balance" tiles.
 *
 * Anything that writes money data must invalidate the whole family — the grid
 * is derived from several sources at once, so invalidating only the table that
 * was written leaves the report (and its KPI tiles) stale until a full reload.
 */
const FIN_QUERY_ROOTS = [
  "fin-day-balance-snapshot",
  "fin-balance-snapshot",
  "fin-monthly-report",
  "boss-monthly-report",
  "boss-dashboard",
  "office-safe",
  "cash-count-snapshots",
  "shifts-tables-result",
  "slots-auto-for-date",
  "miss-chips-for-date",
  "miss-cards-for-date",
  "wallet-last-counts",
  "wallet-tx-since-count",
  "bdc-snapshot",

];

/** True for every query whose data can change when money data is written. */
function isFinanceQuery(key: readonly unknown[]): boolean {
  const root = key[0];
  if (typeof root !== "string") return false;
  return root.startsWith("fin-") || FIN_QUERY_ROOTS.includes(root);
}

/**
 * Invalidate every finance-derived query so saved data shows up immediately.
 * Use this instead of listing individual keys after a mutation.
 */
export function invalidateFinance(qc: QueryClient) {
  return qc.invalidateQueries({ predicate: (q) => isFinanceQuery(q.queryKey) });
}
