import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";

/** Single player + cards + tags. */
export const usePlayer = (id: string | undefined) => {
  return useQuery({
    queryKey: ["player", id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("players")
        .select("*, player_cards(*), player_tags(id, tag, source, created_at)")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });
};

/** All visits for a player (cross-casino if RLS allows). */
export const usePlayerVisits = (playerId: string | undefined) => {
  return useQuery({
    queryKey: ["player-visits", playerId],
    queryFn: async () => {
      if (!playerId) return [];
      const { data, error } = await supabase
        .from("casino_visits")
        .select("*, casinos(name, code)")
        .eq("player_id", playerId)
        .order("checked_in_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data || [];
    },
    enabled: !!playerId,
  });
};

/** Client (table) sessions filtered by date range. */
export const usePlayerSessions = (
  playerId: string | undefined,
  range?: { from: string; to: string }
) => {
  return useQuery({
    queryKey: ["player-sessions", playerId, range?.from, range?.to],
    queryFn: async () => {
      if (!playerId) return [];
      let q = supabase
        .from("client_sessions")
        .select("*, gaming_tables(name, game)")
        .eq("player_id", playerId)
        .order("started_at", { ascending: false })
        .limit(1000);
      if (range?.from) q = q.gte("started_at", `${range.from}T00:00:00`);
      if (range?.to) q = q.lte("started_at", `${range.to}T23:59:59`);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
    enabled: !!playerId,
  });
};

/** All buy/cashout transactions for a player. */
export const usePlayerTransactions = (playerId: string | undefined) => {
  return useQuery({
    queryKey: ["player-transactions", playerId],
    queryFn: async () => {
      if (!playerId) return [];
      const { data, error } = await supabase
        .from("transactions")
        .select("id, casino_id, table_id, type, amount, created_at, gaming_tables(name, game)")
        .eq("player_id", playerId)
        .in("type", ["buy", "cashout", "in", "out"])
        .is("cancelled_at", null)
        .order("created_at", { ascending: false })
        .limit(5000);
      if (error) throw error;
      return data || [];
    },
    enabled: !!playerId,
  });
};

/** Lifetime totals from authoritative `player_economy` view. */
export const usePlayerEconomy = (playerId: string | undefined) => {
  return useQuery({
    queryKey: ["player-economy", playerId],
    queryFn: async () => {
      if (!playerId) return null;
      const { data, error } = await supabase
        .from("player_economy")
        .select("*")
        .eq("player_id", playerId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!playerId,
  });
};

/** Comps / gifts given to a player (via expenses with player_id set). */
export const usePlayerExpenses = (playerId: string | undefined) => {
  return useQuery({
    queryKey: ["player-expenses", playerId],
    queryFn: async () => {
      if (!playerId) return [];
      const { data, error } = await supabase
        .from("expenses")
        .select("id, casino_id, category, amount, description, approved, created_at")
        .eq("player_id", playerId)
        .order("created_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      return data || [];
    },
    enabled: !!playerId,
  });
};

/** Group memberships — current and historical. */
export const usePlayerGroupHistory = (playerId: string | undefined) => {
  return useQuery({
    queryKey: ["player-group-history", playerId],
    queryFn: async () => {
      if (!playerId) return [];
      const { data, error } = await supabase
        .from("group_members")
        .select("*, player_groups(name, casino_id, created_at)")
        .eq("player_id", playerId)
        .order("joined_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!playerId,
  });
};

/** Notes timeline. */
export const usePlayerNotes = (playerId: string | undefined, enabled = true) => {
  return useQuery({
    queryKey: ["player-notes", playerId],
    queryFn: async () => {
      if (!playerId) return [];
      const { data, error } = await supabase
        .from("player_notes")
        .select("*")
        .eq("player_id", playerId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!playerId && enabled,
  });
};

/** Add a note to a player (Pit / Manager / Surveillance / Reception / Cashier). */
export const useCreatePlayerNote = () => {
  const qc = useQueryClient();
  const { user, casinoId } = useAuth();
  return useMutation({
    mutationFn: async (input: { player_id: string; content: string; note_type?: string }) => {
      if (!user || !casinoId) throw new Error("Not authenticated");
      const { error } = await supabase.from("player_notes").insert({
        player_id: input.player_id,
        casino_id: casinoId,
        created_by: user.id,
        content: input.content.trim(),
        note_type: input.note_type || "info",
      } as any);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["player-notes", vars.player_id] });
      toast.success("Note added");
    },
    onError: (e: any) => toast.error(e.message || "Failed to add note"),
  });
};

/** Update a player's status (active <-> blacklist). */
export const useSetPlayerStatus = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { player_id: string; status: "active" | "blacklist" }) => {
      const { error } = await supabase
        .from("players")
        .update({ status: input.status })
        .eq("id", input.player_id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["player", vars.player_id] });
      qc.invalidateQueries({ queryKey: ["players"] });
      toast.success(vars.status === "blacklist" ? "Player blacklisted" : "Player reactivated");
    },
    onError: (e: any) => toast.error(e.message || "Failed to update status"),
  });
};

/** Update player category (Normal/Gold/Platinum/Diamond) via RPC. */
export const useUpdatePlayerCategory = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { player_id: string; category: "normal" | "gold" | "platinum" | "diamond" }) => {
      const { error } = await supabase.rpc("set_player_category", {
        _player_id: input.player_id,
        _category: input.category,
      } as any);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      // Refetch (not just invalidate) so Player Tracking and other consumers
      // pick up the new level immediately, even if their query is inactive.
      qc.invalidateQueries({ queryKey: ["player", vars.player_id] });
      qc.refetchQueries({ queryKey: ["players"], type: "all" });
      toast.success("Status updated");
    },
    onError: (e: any) => toast.error(e.message || "Failed to update status"),
  });
};

/** Add or remove a tag on the player, on the given source layer ('floor' | 'cctv'). */
export const useTogglePlayerTag = () => {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      player_id: string;
      tag: string;
      source: "floor" | "cctv";
      enabled: boolean;
    }) => {
      if (input.enabled) {
        const { error } = await supabase
          .from("player_tags")
          .insert({
            player_id: input.player_id,
            tag: input.tag,
            source: input.source,
            created_by: user?.id || null,
          } as any);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("player_tags")
          .delete()
          .eq("player_id", input.player_id)
          .eq("tag", input.tag)
          .eq("source", input.source);
        if (error) throw error;
      }
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["player", vars.player_id] });
      qc.invalidateQueries({ queryKey: ["players"] });
      qc.invalidateQueries({ queryKey: ["player_tags_dialog", vars.player_id] });
    },
    onError: (e: any) => toast.error(e.message || "Failed to update tag"),
  });
};
