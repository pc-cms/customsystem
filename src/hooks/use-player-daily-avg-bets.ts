import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";

export type AvgBetGroup = "ar" | "bj" | "poker" | "club";

export interface PlayerDailyAvgBet {
  id: string;
  casino_id: string;
  player_id: string;
  business_date: string;
  avg_bet_ar: number | null;
  avg_bet_bj: number | null;
  avg_bet_poker: number | null;
  avg_bet_club: number | null;
  updated_at: string;
}

const KEY = "player_daily_avg_bets";

/** All rows for a single business date in the current casino. */
export function usePlayerDailyAvgBets(businessDate: string | undefined) {
  const { casinoId } = useAuth();
  return useQuery({
    queryKey: [KEY, casinoId, businessDate],
    queryFn: async () => {
      if (!casinoId || !businessDate) return [] as PlayerDailyAvgBet[];
      const { data, error } = await (supabase.from as any)("player_daily_avg_bets")
        .select("id, casino_id, player_id, business_date, avg_bet_ar, avg_bet_bj, avg_bet_poker, avg_bet_club, updated_at")
        .eq("casino_id", casinoId)
        .eq("business_date", businessDate);
      if (error) throw error;
      return (data || []) as PlayerDailyAvgBet[];
    },
    enabled: !!casinoId && !!businessDate,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}

/** Range fetch — for Player Profile by day. */
export function usePlayerDailyAvgBetsRange(playerId: string | undefined, from: string | undefined, to: string | undefined) {
  return useQuery({
    queryKey: [KEY, "range", playerId, from, to],
    queryFn: async () => {
      if (!playerId || !from || !to) return [] as PlayerDailyAvgBet[];
      const { data, error } = await (supabase.from as any)("player_daily_avg_bets")
        .select("business_date, avg_bet_ar, avg_bet_bj, avg_bet_poker, avg_bet_club")
        .eq("player_id", playerId)
        .gte("business_date", from)
        .lte("business_date", to)
        .order("business_date", { ascending: false });
      if (error) throw error;
      return (data || []) as PlayerDailyAvgBet[];
    },
    enabled: !!playerId && !!from && !!to,
    staleTime: 30_000,
  });
}

/** Upsert one game-group value for one player on one business day. */
export function useSetPlayerDailyAvgBet() {
  const { casinoId, user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      playerId, businessDate, group, value,
    }: { playerId: string; businessDate: string; group: AvgBetGroup; value: number | null }) => {
      if (!casinoId) throw new Error("No casino");
      const col = group === "ar" ? "avg_bet_ar" : group === "bj" ? "avg_bet_bj" : group === "club" ? "avg_bet_club" : "avg_bet_poker";
      // Try update first
      const { data: existing } = await (supabase.from as any)("player_daily_avg_bets")
        .select("id")
        .eq("casino_id", casinoId)
        .eq("player_id", playerId)
        .eq("business_date", businessDate)
        .maybeSingle();
      if (existing?.id) {
        const { error } = await (supabase.from as any)("player_daily_avg_bets")
          .update({ [col]: value, updated_by: user?.id ?? null })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase.from as any)("player_daily_avg_bets")
          .insert({
            casino_id: casinoId,
            player_id: playerId,
            business_date: businessDate,
            [col]: value,
            updated_by: user?.id ?? null,
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY] });
    },
    onError: (e: any) => toast.error(e.message || "Failed to save avg bet"),
  });
}
