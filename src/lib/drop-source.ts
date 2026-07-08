/**
 * Total Drop — single source of truth.
 *
 * Rule (permanent):
 *   • Per-table Drop is NEVER displayed. Every per-table Drop cell renders `·`.
 *   • Total Drop in any report / KPI / print output comes from
 *     `player_day_drop_cache` (SUM(peak) per business_date).
 *   • No split / NEP redistribution ever appears in a Drop column.
 *
 * This matches the value shown on the Player Statistics screen exactly.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Marker for empty per-table Drop cells. UI components render `·` in place of a number. */
export const PER_TABLE_DROP_PLACEHOLDER = null as unknown as number;

type Params = {
  casinoId: string | null | undefined;
  /** ISO business date, YYYY-MM-DD (inclusive). */
  fromDate: string | null | undefined;
  /** ISO business date, YYYY-MM-DD (inclusive). Defaults to fromDate. */
  toDate?: string | null;
  /** Restrict to specific players (e.g. a group). Omit for casino-wide. */
  playerIds?: string[];
};

/**
 * Fetch total Drop from `player_day_drop_cache` — the authoritative source.
 * Returns 0 when params are incomplete so callers can use it unconditionally.
 */
export async function fetchTotalDrop(params: Params): Promise<number> {
  const { casinoId, fromDate, toDate, playerIds } = params;
  if (!casinoId || !fromDate) return 0;
  const to = toDate || fromDate;

  let q = supabase
    .from("player_day_drop_cache")
    .select("peak")
    .eq("casino_id", casinoId)
    .gte("business_date", fromDate)
    .lte("business_date", to);

  if (playerIds && playerIds.length > 0) {
    q = q.in("player_id", playerIds);
  }

  const { data, error } = await q;
  if (error) {
    console.warn("[drop-source] failed to fetch player_day_drop_cache", error);
    return 0;
  }
  return (data ?? []).reduce((s, r: any) => s + Number(r.peak || 0), 0);
}

/** React Query hook wrapping fetchTotalDrop with a stable key. */
export function useTotalDrop(params: Params) {
  const { casinoId, fromDate, toDate, playerIds } = params;
  return useQuery({
    queryKey: [
      "total-drop-cache",
      casinoId ?? null,
      fromDate ?? null,
      toDate ?? fromDate ?? null,
      playerIds ? [...playerIds].sort() : null,
    ],
    queryFn: () => fetchTotalDrop(params),
    enabled: !!casinoId && !!fromDate,
    staleTime: 30_000,
  });
}
