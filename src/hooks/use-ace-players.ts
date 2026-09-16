/**
 * ACE player / slot analytics hooks.
 *
 * Read-only against the additive `ace_*` / `player_ace_*` tables. Writes go
 * through the super-admin-only RPCs (`ace_attach_identity`,
 * `ace_unlink_identity`, `ace_merge_auto_player`).
 *
 * Canon for this module (do NOT mix with Player Tracking table formulas):
 *   Drop        = IN
 *   Handle      = ACE turnover only; NULL => N/A, never derived from Drop
 *   Slot Result = IN - OUT (casino perspective)
 *   Jackpot payouts are already inside OUT — jackpot analytics never add to
 *   Slot Result a second time.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface AcePlayerStatsRow {
  player_id: string;
  player_name: string | null;
  is_ace_auto: boolean;
  ace_ids: string[] | null;
  casino_ids: string[] | null;
  cards: string[] | null;
  egm_codes: string[] | null;
  in_amount: number | null;
  out_amount: number | null;
  drop_amount: number | null;
  handle_amount: number | null;
  slot_result: number | null;
  games: number | null;
  jackpot_count: number | null;
  jackpot_amount: number | null;
  last_activity: string | null;
}

export interface AceIdentityRow {
  id: string;
  player_id: string;
  casino_id: string;
  ace_player_id: string;
  ace_name: string | null;
  first_seen_at: string | null;
  last_seen_at: string | null;
  is_active: boolean;
  is_auto_created: boolean;
}

const STALE = 60_000;

/** All casinos (id/name/code) — ACE data is branch-scoped. */
export const useAceCasinos = () =>
  useQuery({
    queryKey: ["ace-casinos"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("casinos").select("id, name, code").order("name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string; code: string }[];
    },
  });

/** Aggregated Players tab — one row per CMS player for the period. */
export const useAcePlayerStats = (from: string, to: string, casinoId?: string | null) =>
  useQuery({
    queryKey: ["ace-player-stats", from, to, casinoId ?? "all"],
    staleTime: STALE,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("ace_player_stats" as any, {
        _from: from,
        _to: to,
        _casino_id: casinoId ?? null,
      });
      if (error) throw error;
      return (data ?? []) as unknown as AcePlayerStatsRow[];
    },
  });

/** Drill-down: identity x EGM x business day for one player. */
export const useAcePlayerEgmDaily = (
  playerId: string | undefined,
  from: string,
  to: string,
  enabled = true,
) =>
  useQuery({
    queryKey: ["ace-player-egm-daily", playerId, from, to],
    enabled: !!playerId && enabled,
    staleTime: STALE,
    queryFn: async () => {
      const { data: ids, error: idErr } = await supabase
        .from("player_ace_identities" as any)
        .select("id, casino_id, ace_player_id")
        .eq("player_id", playerId!);
      if (idErr) throw idErr;
      const list = (ids ?? []) as any[];
      if (!list.length) return [];
      const { data, error } = await supabase
        .from("ace_player_egm_daily" as any)
        .select("*")
        .in("identity_id", list.map((i) => i.id))
        .gte("business_date", from)
        .lte("business_date", to)
        .order("business_date", { ascending: false });
      if (error) throw error;
      const byId = new Map(list.map((i) => [i.id, i]));
      return ((data ?? []) as any[]).map((r) => ({
        ...r,
        ace_player_id: byId.get(r.identity_id)?.ace_player_id ?? null,
      }));
    },
  });

/** ACE identities + card history for one player. */
export const useAcePlayerIdentities = (playerId: string | undefined, enabled = true) =>
  useQuery({
    queryKey: ["ace-player-identities", playerId],
    enabled: !!playerId && enabled,
    staleTime: STALE,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("player_ace_identities" as any)
        .select("*, player_ace_cards(*)")
        .eq("player_id", playerId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

/** Jackpot history of one player. */
export const useAcePlayerJackpots = (playerId: string | undefined, enabled = true) =>
  useQuery({
    queryKey: ["ace-player-jackpots", playerId],
    enabled: !!playerId && enabled,
    staleTime: STALE,
    queryFn: async () => {
      const { data: ids } = await supabase
        .from("player_ace_identities" as any)
        .select("id, ace_player_id, casino_id")
        .eq("player_id", playerId!);
      const list = (ids ?? []) as any[];
      if (!list.length) return [];
      const { data, error } = await supabase
        .from("ace_jackpot_wins" as any)
        .select("*")
        .in("identity_id", list.map((i) => i.id))
        .order("occurred_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

/** Current EGM status snapshot. */
export const useAceEgmCurrent = (casinoId?: string | null) =>
  useQuery({
    queryKey: ["ace-egm-current", casinoId ?? "all"],
    staleTime: 30_000,
    queryFn: async () => {
      let q = supabase.from("ace_egm_current" as any).select("*").order("egm_code");
      if (casinoId) q = q.eq("casino_id", casinoId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

/** Raw report capture (EGM or Jackpot). */
export const useAceReports = (
  kind: "egm" | "jackpot",
  from: string,
  to: string,
  casinoId?: string | null,
) =>
  useQuery({
    queryKey: ["ace-reports", kind, from, to, casinoId ?? "all"],
    staleTime: STALE,
    queryFn: async () => {
      const table = kind === "egm" ? "ace_egm_reports" : "ace_jackpot_reports";
      let q = supabase
        .from(table as any)
        .select("*")
        .order("captured_at", { ascending: false })
        .limit(500);
      if (casinoId) q = q.eq("casino_id", casinoId);
      const { data, error } = await q;
      if (error) throw error;
      return ((data ?? []) as any[]).filter((r) => {
        const d = r.business_date ?? r.period_to ?? r.period_from;
        return !d || (d >= from && d <= to);
      });
    },
  });

/** Jackpot wins list for the Jackpot Report tab. */
export const useAceJackpotWins = (from: string, to: string, casinoId?: string | null) =>
  useQuery({
    queryKey: ["ace-jackpot-wins", from, to, casinoId ?? "all"],
    staleTime: STALE,
    queryFn: async () => {
      let q = supabase
        .from("ace_jackpot_wins" as any)
        .select("*")
        .gte("business_date", from)
        .lte("business_date", to)
        .order("occurred_at", { ascending: false })
        .limit(1000);
      if (casinoId) q = q.eq("casino_id", casinoId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

/** Overview counters + collector status (reuses the existing ACE key table). */
export const useAceOverview = (from: string, to: string, casinoId?: string | null) =>
  useQuery({
    queryKey: ["ace-overview", from, to, casinoId ?? "all"],
    staleTime: 30_000,
    queryFn: async () => {
      const scope = <T,>(q: T): T => (casinoId ? (q as any).eq("casino_id", casinoId) : q);
      const [keys, identities, egms, txs, egmRep, jpRep] = await Promise.all([
        supabase.from("ace_ingest_keys" as any).select("location_code, casino_id, is_active, last_seen_at"),
        scope(supabase.from("player_ace_identities" as any).select("id", { count: "exact", head: true })),
        scope(supabase.from("ace_egm_current" as any).select("id", { count: "exact", head: true })),
        scope(
          supabase
            .from("ace_player_transactions" as any)
            .select("id", { count: "exact", head: true })
            .gte("business_date", from)
            .lte("business_date", to),
        ),
        scope(
          supabase
            .from("ace_egm_reports" as any)
            .select("captured_at, period_label")
            .order("captured_at", { ascending: false })
            .limit(1),
        ),
        scope(
          supabase
            .from("ace_jackpot_reports" as any)
            .select("captured_at, period_label")
            .order("captured_at", { ascending: false })
            .limit(1),
        ),
      ]);
      return {
        keys: (keys.data ?? []) as any[],
        identityCount: identities.count ?? 0,
        egmCount: egms.count ?? 0,
        txCount: txs.count ?? 0,
        latestEgmReport: ((egmRep.data ?? []) as any[])[0] ?? null,
        latestJackpotReport: ((jpRep.data ?? []) as any[])[0] ?? null,
      };
    },
  });

// -------------------- mutations (super_admin only) --------------------

const invalidateAce = (qc: ReturnType<typeof useQueryClient>, playerId?: string) => {
  qc.invalidateQueries({ queryKey: ["ace-player-identities", playerId] });
  qc.invalidateQueries({ queryKey: ["ace-player-stats"] });
  qc.invalidateQueries({ queryKey: ["ace-overview"] });
};

export interface AttachResult {
  status: "created" | "moved" | "exists" | "conflict";
  identity_id?: string;
  current_player_id?: string;
}

/** Attach one ACE ID to a player. Returns `conflict` when it belongs elsewhere. */
export const useAttachAceIdentity = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      player_id: string;
      casino_id: string;
      ace_player_id: string;
      force?: boolean;
    }) => {
      const { data, error } = await supabase.rpc("ace_attach_identity" as any, {
        _player_id: input.player_id,
        _casino_id: input.casino_id,
        _ace_player_id: input.ace_player_id,
        _force: input.force ?? false,
      });
      if (error) throw error;
      return data as unknown as AttachResult;
    },
    onSuccess: (res, vars) => {
      invalidateAce(qc, vars.player_id);
      if (res?.status === "created") toast.success("ACE ID linked");
      if (res?.status === "moved") toast.success("ACE ID moved to this player");
      if (res?.status === "exists") toast.info("ACE ID already linked");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to link ACE ID"),
  });
};

export const useUnlinkAceIdentity = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { identity_id: string; player_id: string; note?: string }) => {
      const { error } = await supabase.rpc("ace_unlink_identity" as any, {
        _identity_id: input.identity_id,
        _note: input.note ?? null,
      });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      invalidateAce(qc, vars.player_id);
      toast.success("ACE ID unlinked");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to unlink"),
  });
};

export const useMergeAceAutoPlayer = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { auto_player_id: string; survivor_id: string }) => {
      const { data, error } = await supabase.rpc("ace_merge_auto_player" as any, {
        _auto_player_id: input.auto_player_id,
        _survivor_id: input.survivor_id,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, vars) => {
      invalidateAce(qc, vars.survivor_id);
      qc.invalidateQueries({ queryKey: ["players"] });
      toast.success("ACE player merged");
    },
    onError: (e: any) => toast.error(e?.message ?? "Merge failed"),
  });
};

// -------------------- consolidated / coverage --------------------

export interface AceConsolidatedRow {
  casino_id: string;
  casino_name: string | null;
  business_date: string;
  drop_amount: number | null;
  handle_amount: number | null;
  in_amount: number | null;
  out_amount: number | null;
  slot_result: number | null;
  games: number | null;
  avg_bet: number | null;
  players: number | null;
  egms: number | null;
  jackpot_paid: number | null;
  jackpot_count: number | null;
  final_rows: number | null;
  provisional_rows: number | null;
}

/**
 * Consolidated slot figures per branch per business day, computed in the DB so
 * long historical ranges stay cheap. Read-only, super_admin-gated server side.
 */
export const useAceConsolidated = (
  from: string,
  to: string,
  casinoId?: string | null,
  refetchInterval?: number | false,
) =>
  useQuery({
    queryKey: ["ace-consolidated", from, to, casinoId ?? "all"],
    staleTime: 30_000,
    refetchInterval: refetchInterval ?? false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("ace_consolidated_stats" as any, {
        _from: from,
        _to: to,
        _casino_id: casinoId ?? null,
      });
      if (error) throw error;
      return (data ?? []) as unknown as AceConsolidatedRow[];
    },
  });

/** CMS data coverage per branch — what history actually exists in the CMS. */
export const useAceCoverage = () =>
  useQuery({
    queryKey: ["ace-coverage"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const [daily, egm, egmRep, jpRep] = await Promise.all([
        supabase.rpc("ace_consolidated_stats" as any, {
          _from: "2020-01-01",
          _to: new Date().toISOString().slice(0, 10),
          _casino_id: null,
        }),
        supabase.from("ace_egm_current" as any).select("casino_id, observed_at"),
        supabase.from("ace_egm_reports" as any).select("casino_id, business_date, captured_at"),
        supabase.from("ace_jackpot_reports" as any).select("casino_id, business_date, captured_at"),
      ]);
      const rows = (daily.data ?? []) as any[];
      const map = new Map<string, {
        casino_id: string;
        casino_name: string | null;
        first_date: string | null;
        last_date: string | null;
        day_count: number;
        last_egm_observed: string | null;
        last_egm_report: string | null;
        last_jp_report: string | null;
      }>();
      const ensure = (id: string, name: string | null) => {
        if (!map.has(id)) {
          map.set(id, {
            casino_id: id, casino_name: name,
            first_date: null, last_date: null, day_count: 0,
            last_egm_observed: null, last_egm_report: null, last_jp_report: null,
          });
        }
        return map.get(id)!;
      };
      rows.forEach((r) => {
        const e = ensure(r.casino_id, r.casino_name);
        e.day_count += 1;
        if (!e.first_date || r.business_date < e.first_date) e.first_date = r.business_date;
        if (!e.last_date || r.business_date > e.last_date) e.last_date = r.business_date;
      });
      ((egm.data ?? []) as any[]).forEach((r) => {
        const e = ensure(r.casino_id, null);
        if (!e.last_egm_observed || r.observed_at > e.last_egm_observed) e.last_egm_observed = r.observed_at;
      });
      ((egmRep.data ?? []) as any[]).forEach((r) => {
        const e = ensure(r.casino_id, null);
        if (!e.last_egm_report || (r.business_date ?? "") > (e.last_egm_report ?? "")) e.last_egm_report = r.business_date;
      });
      ((jpRep.data ?? []) as any[]).forEach((r) => {
        const e = ensure(r.casino_id, null);
        if (!e.last_jp_report || (r.business_date ?? "") > (e.last_jp_report ?? "")) e.last_jp_report = r.business_date;
      });
      return [...map.values()];
    },
  });
