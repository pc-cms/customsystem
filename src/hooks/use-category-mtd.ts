/**
 * Month-to-date actual sum per fin_category for the CURRENT business month
 * (Africa/Dar_es_Salaam). Always month-to-today regardless of the report's
 * selected period. Used to surface a constant "MTD per category" indicator
 * next to the Actual column in Monthly Report.
 */
import { useQuery } from "@tanstack/react-query";
import { liveQueryOptions, liveQueryOptionsWithFallback } from "@/lib/live-query-options";
import { supabase } from "@/integrations/supabase/client";
import { useCasino } from "@/lib/casino-context";

export type CategoryMtd = Record<string, number>;

const currentMonthBoundsEAT = () => {
  // EAT = UTC+3. Use today's date in EAT to derive month start.
  const now = new Date();
  const eat = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  const y = eat.getUTCFullYear();
  const m = eat.getUTCMonth() + 1;
  const start = `${y}-${String(m).padStart(2, "0")}-01`;
  const nm = m === 12 ? { y: y + 1, m: 1 } : { y, m: m + 1 };
  const endExclusive = `${nm.y}-${String(nm.m).padStart(2, "0")}-01`;
  return { start, endExclusive, year: y, month: m };
};

/**
 * @param scope "network" or a casino id. If omitted, uses the active casino.
 */
export const useCategoryMtd = (scope?: string) => {
  const { activeCasinoId } = useCasino();
  const network = scope === "network";
  const casinoId = network ? null : (scope || activeCasinoId);

  return useQuery<{ map: CategoryMtd; year: number; month: number }>({
    queryKey: ["category-mtd", network ? "net" : casinoId],
    enabled: network || !!casinoId,
    queryFn: async () => {
      const { start, endExclusive, year, month } = currentMonthBoundsEAT();
      let q = supabase
        .from("expenses")
        .select("fin_category_id, amount_tzs")
        .gte("business_date", start)
        .lt("business_date", endExclusive)
        .is("voided_at", null)
        .not("fin_category_id", "is", null)
        .limit(10000);
      if (!network && casinoId) q = q.eq("casino_id", casinoId);
      const { data, error } = await q;
      if (error) throw error;
      const map: CategoryMtd = {};
      (data || []).forEach((r: any) => {
        if (!r.fin_category_id) return;
        map[r.fin_category_id] = (map[r.fin_category_id] || 0) + Number(r.amount_tzs || 0);
      });
      return { map, year, month };
    },
    ...liveQueryOptionsWithFallback(60000),
  });
};
