/**
 * Chip Transfers — paired immutable records of chip movement between players.
 * Created via DB RPC `create_chip_transfer_pair` (atomic two-row insert).
 * Affects NEP/Drop split (server-side RPCs already merge chip_transfers into the event stream).
 * Does NOT touch cash, wallets, chip inventory, or shift results.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { liveQueryOptions } from "@/lib/live-query-options";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import { businessDayHourUTC } from "@/lib/business-day";

export type ChipTransfer = {
  id: string;
  casino_id: string;
  shift_id: string;
  table_id: string | null;
  pair_id: string;
  direction: "in" | "out";
  player_id: string;
  counterparty_player_id: string;
  amount: number;
  chips: Record<string, number> | null;
  note: string;
  operator_id: string;
  created_at: string;
};

/** All chip transfers for the current casino, optionally scoped to a single business date (YYYY-MM-DD). */
export const useChipTransfers = (date?: string) => {
  const { casinoId } = useAuth();
  return useQuery({
    queryKey: ["chip_transfers", casinoId, date ?? "all"],
    queryFn: async () => {
      if (!casinoId) return [] as ChipTransfer[];
      let q = (supabase.from as any)("chip_transfers")
        .select("*")
        .eq("casino_id", casinoId)
        .order("created_at", { ascending: false });
      if (date) q = q.gte("created_at", businessDayHourUTC(date, 7)).lt("created_at", businessDayHourUTC(date, 7 + 24));
      const { data, error } = await q.limit(500);
      if (error) throw error;
      return (data || []) as ChipTransfer[];
    },
    enabled: !!casinoId,
    ...liveQueryOptions(),
    refetchInterval: 30_000,
  });
};

/** Lifetime chip transfers for one player (for Player Profile). */
export const usePlayerChipTransfers = (playerId: string | null | undefined) => {
  return useQuery({
    queryKey: ["chip_transfers", "player", playerId],
    queryFn: async () => {
      if (!playerId) return [] as ChipTransfer[];
      const { data, error } = await (supabase.from as any)("chip_transfers")
        .select("*")
        .eq("player_id", playerId)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data || []) as ChipTransfer[];
    },
    enabled: !!playerId,
    ...liveQueryOptions(),
  });
};

/**
 * Create a paired CHIP OUT (donor) + CHIP IN (recipient) atomically.
 * `from_player` gives chips → `to_player` receives them. Same amount.
 */
export const useCreateChipTransferPair = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      from_player: string;
      to_player: string;
      amount: number;
      table_id?: string | null;
      chips?: Record<string, number> | null;
      note?: string;
    }) => {
      if (!navigator.onLine) {
        throw new Error("Chip Transfer requires an online connection");
      }
      const { data, error } = await (supabase.rpc as any)("create_chip_transfer_pair", {
        _from_player: input.from_player,
        _to_player: input.to_player,
        _amount: input.amount,
        _table_id: input.table_id ?? null,
        _chips: input.chips ?? null,
        _note: input.note ?? "",
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chip_transfers"] });
      qc.invalidateQueries({ queryKey: ["casino_visits"] });
      qc.invalidateQueries({ queryKey: ["tables-drop-split"] });
      qc.invalidateQueries({ queryKey: ["player-drop-split"] });
      qc.invalidateQueries({ queryKey: ["player_economy"] });
      toast.success("Chip transfer recorded");
    },
    onError: (e: any) => toast.error(e.message || "Failed to record chip transfer"),
  });
};
