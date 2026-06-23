import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { logAction } from "@/lib/logging";
import { toast } from "sonner";

// ============ PLAYERS ============
/**
 * Global player base — all players across all casinos.
 * casino_id on the player = where they were registered.
 * Blacklist status is global.
 */
export const usePlayers = () => {
  return useQuery({
    queryKey: ["players"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("players")
        .select("*, player_cards(*), player_tags(*)")
        .order("last_name");
      if (error) throw error;
      return data;
    },
    staleTime: 1000 * 60 * 5,
  });
};

export const useCreatePlayer = () => {
  const qc = useQueryClient();
  const { casinoId, user } = useAuth();
  return useMutation({
    mutationFn: async (input: { first_name: string; last_name: string; nickname: string; phone: string }) => {
      if (!casinoId) throw new Error("No casino");
      const { data: player, error } = await supabase
        .from("players")
        .insert({ ...input, casino_id: casinoId })
        .select()
        .single();
      if (error) throw error;

      const { data: cardNum } = await supabase.rpc("generate_card_number" as any);
      await supabase.from("player_cards").insert({
        player_id: player.id,
        card_number: cardNum || `0001${Date.now().toString().slice(-4)}+`,
        card_type: "manual",
        issued_by: user?.id,
      });

      await logAction(casinoId, "player", "PLAYER_CREATED", { player_id: player.id, name: `${input.first_name} ${input.last_name}` });
      return player;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["players"] }); toast.success("Player created"); },
    onError: (e) => toast.error(e.message),
  });
};

export const useUpdatePlayerStatus = () => {
  const qc = useQueryClient();
  const { casinoId } = useAuth();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "active" | "blacklist" }) => {
      const { error } = await supabase.from("players").update({ status }).eq("id", id);
      if (error) throw error;
      await logAction(casinoId!, "player", "STATUS_CHANGED", { player_id: id, status });
    },
    onMutate: async ({ id, status }) => {
      await qc.cancelQueries({ queryKey: ["players"] });
      const snapshots: [readonly unknown[], unknown][] = [];
      qc.getQueriesData<any[]>({ queryKey: ["players"] }).forEach(([key, data]) => {
        if (!Array.isArray(data)) return;
        snapshots.push([key, data]);
        qc.setQueryData(key, data.map((p: any) => (p?.id === id ? { ...p, status } : p)));
      });
      return { snapshots };
    },
    onError: (e: any, _v, ctx) => {
      ctx?.snapshots.forEach(([k, v]) => qc.setQueryData(k, v));
      toast.error(e?.message || "Failed to update status");
    },
    onSettled: () => { qc.invalidateQueries({ queryKey: ["players"] }); },
  });
};

export const useAddPlayerTag = () => {
  const qc = useQueryClient();
  const { casinoId, user } = useAuth();
  return useMutation({
    mutationFn: async ({ playerId, tag }: { playerId: string; tag: string }) => {
      const { error } = await supabase.from("player_tags").insert({
        player_id: playerId,
        tag,
        created_by: user?.id,
      });
      if (error) throw error;
      await logAction(casinoId!, "edit", "TAG_ADDED", { player_id: playerId, tag });
    },
    onMutate: async ({ playerId, tag }) => {
      await qc.cancelQueries({ queryKey: ["players"] });
      const snapshots: [readonly unknown[], unknown][] = [];
      const optimistic = { player_id: playerId, tag, created_by: user?.id, _optimistic: true };
      qc.getQueriesData<any[]>({ queryKey: ["players"] }).forEach(([key, data]) => {
        if (!Array.isArray(data)) return;
        snapshots.push([key, data]);
        qc.setQueryData(key, data.map((p: any) => p?.id === playerId
          ? { ...p, player_tags: [...(p.player_tags || []), optimistic] }
          : p));
      });
      return { snapshots };
    },
    onError: (e: any, _v, ctx) => {
      ctx?.snapshots.forEach(([k, v]) => qc.setQueryData(k, v));
      toast.error(e?.message);
    },
    onSettled: () => { qc.invalidateQueries({ queryKey: ["players"] }); },
  });
};

export const useRemovePlayerTag = () => {
  const qc = useQueryClient();
  const { casinoId } = useAuth();
  return useMutation({
    mutationFn: async ({ playerId, tag }: { playerId: string; tag: string }) => {
      const { error } = await supabase.from("player_tags").delete().eq("player_id", playerId).eq("tag", tag);
      if (error) throw error;
      await logAction(casinoId!, "edit", "TAG_REMOVED", { player_id: playerId, tag });
    },
    onMutate: async ({ playerId, tag }) => {
      await qc.cancelQueries({ queryKey: ["players"] });
      const snapshots: [readonly unknown[], unknown][] = [];
      qc.getQueriesData<any[]>({ queryKey: ["players"] }).forEach(([key, data]) => {
        if (!Array.isArray(data)) return;
        snapshots.push([key, data]);
        qc.setQueryData(key, data.map((p: any) => p?.id === playerId
          ? { ...p, player_tags: (p.player_tags || []).filter((t: any) => t?.tag !== tag) }
          : p));
      });
      return { snapshots };
    },
    onError: (e: any, _v, ctx) => {
      ctx?.snapshots.forEach(([k, v]) => qc.setQueryData(k, v));
      toast.error(e?.message);
    },
    onSettled: () => { qc.invalidateQueries({ queryKey: ["players"] }); },
  });
};

export const useIssueCard = () => {
  const qc = useQueryClient();
  const { casinoId, user } = useAuth();
  return useMutation({
    mutationFn: async ({ playerId, rfidUid }: { playerId: string; rfidUid?: string }) => {
      const { data: cardNum } = await supabase.rpc("generate_card_number" as any);
      const { error } = await supabase.from("player_cards").insert({
        player_id: playerId,
        card_number: cardNum || `0001${Date.now().toString().slice(-4)}+`,
        card_type: rfidUid ? "rfid" : "manual",
        rfid_uid: rfidUid || null,
        issued_by: user?.id,
      });
      if (error) throw error;
      await logAction(casinoId!, "player", "CARD_ISSUED", { player_id: playerId });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["players"] }); toast.success("Card issued"); },
    onError: (e) => toast.error(e.message),
  });
};

// ============ PLAYER ECONOMY ============
export const usePlayerEconomy = (limit = 500) => {
  const { casinoId } = useAuth();
  return useQuery({
    queryKey: ["player-economy", casinoId, limit],
    queryFn: async () => {
      if (!casinoId) return [];
      const { data, error } = await supabase
        .from("player_economy")
        .select("*")
        .eq("casino_id", casinoId)
        .limit(limit);
      if (error) throw error;
      return data;
    },
    enabled: !!casinoId,
    staleTime: 1000 * 60 * 3,
  });
};

/**
 * Per-period aggregation for player statistics.
 * Sums transactions (buy/cashout), expenses (comps), and visits within [from, to]
 * scoped by current casino. Returns a map keyed by player_id.
 */
export const usePlayerEconomyRange = (range: { from: string; to: string }) => {
  const { casinoId } = useAuth();
  return useQuery({
    queryKey: ["player-economy-range", casinoId, range.from, range.to],
    queryFn: async () => {
      if (!casinoId) return new Map<string, { drop: number; cashout: number; comps: number; visits: number; lastVisit: string | null }>();
      const fromIso = `${range.from}T00:00:00`;
      const toIso = `${range.to}T23:59:59`;

      const [txRes, expRes, visRes] = await Promise.all([
        supabase
          .from("transactions")
          .select("player_id, type, amount, created_at")
          .eq("casino_id", casinoId)
          .in("type", ["buy", "cashout", "in", "out"])
          .is("cancelled_at", null)
          .gte("created_at", fromIso)
          .lte("created_at", toIso)
          .limit(50000),
        supabase
          .from("expenses")
          .select("player_id, amount, created_at")
          .eq("casino_id", casinoId)
          .not("player_id", "is", null)
          .gte("created_at", fromIso)
          .lte("created_at", toIso)
          .limit(20000),
        supabase
          .from("casino_visits")
          .select("player_id, checked_in_at")
          .eq("casino_id", casinoId)
          .gte("checked_in_at", fromIso)
          .lte("checked_in_at", toIso)
          .limit(20000),
      ]);
      if (txRes.error) throw txRes.error;
      if (expRes.error) throw expRes.error;
      if (visRes.error) throw visRes.error;

      const m = new Map<string, { drop: number; cashout: number; comps: number; visits: number; lastVisit: string | null }>();
      const get = (pid: string) => {
        let cur = m.get(pid);
        if (!cur) { cur = { drop: 0, cashout: 0, comps: 0, visits: 0, lastVisit: null }; m.set(pid, cur); }
        return cur;
      };
      for (const t of txRes.data || []) {
        if (!t.player_id) continue;
        const cur = get(t.player_id);
        const amt = Number(t.amount) || 0;
        if (t.type === "buy" || t.type === "in") cur.drop += amt;
        else if (t.type === "cashout" || t.type === "out") cur.cashout += amt;
      }
      for (const e of expRes.data || []) {
        if (!e.player_id) continue;
        get(e.player_id).comps += Number(e.amount) || 0;
      }
      for (const v of visRes.data || []) {
        if (!v.player_id) continue;
        const cur = get(v.player_id);
        cur.visits += 1;
        if (!cur.lastVisit || v.checked_in_at > cur.lastVisit) cur.lastVisit = v.checked_in_at;
      }
      return m;
    },
    enabled: !!casinoId,
    staleTime: 1000 * 60 * 2,
  });
};

// ============ GROUPS ============
export const usePlayerGroups = () => {
  const { casinoId } = useAuth();
  return useQuery({
    queryKey: ["player-groups", casinoId],
    queryFn: async () => {
      if (!casinoId) return [];
      const { data, error } = await supabase
        .from("player_groups")
        .select("*, group_members(*, players(first_name, last_name, nickname))")
        .eq("casino_id", casinoId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!casinoId,
  });
};

export const useCreateGroup = () => {
  const qc = useQueryClient();
  const { casinoId, user } = useAuth();
  return useMutation({
    mutationFn: async (name: string) => {
      if (!casinoId || !user) throw new Error("Not authenticated");
      const { error } = await supabase.from("player_groups").insert({
        casino_id: casinoId, name, created_by: user.id,
      });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["player-groups"] }); toast.success("Group created"); },
  });
};

export const useAddGroupMember = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ groupId, playerId }: { groupId: string; playerId: string }) => {
      const { error } = await supabase.from("group_members").insert({
        group_id: groupId, player_id: playerId,
      });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["player-groups"] }); toast.success("Member added"); },
    onError: (e) => toast.error(e.message),
  });
};

export const useRemoveGroupMember = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (memberId: string) => {
      const { error } = await supabase.from("group_members").update({
        left_at: new Date().toISOString(),
      }).eq("id", memberId);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["player-groups"] }); },
  });
};
