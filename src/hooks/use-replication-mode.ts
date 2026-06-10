/**
 * use-replication-mode — reads node_modes.mode for the active casino
 * and exposes both the value and a helper "this node should be read-only"
 * derivation used by useReadOnlyMode.
 *
 *  cloud_primary  → Cloud accepts writes; local node is REPLICA (read-only)
 *  local_primary  → Local accepts writes; Cloud blocks operational writes
 *                   (enforced server-side by _enforce_replication_mode trigger)
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCasino } from "@/lib/casino-context";

const CLOUD_HOSTS = new Set([
  "casinosystem.app",
  "www.casinosystem.app",
  "premier.casinosystem.app",
  "arusha.casinosystem.app",
  "mwanza.casinosystem.app",
  "dodoma.casinosystem.app",
  "mbeya.casinosystem.app",
  "casinosystem.lovable.app",
]);

export function isLocalNode(): boolean {
  if (typeof window === "undefined") return false;
  const h = window.location.hostname;
  if (CLOUD_HOSTS.has(h)) return false;
  if (h.endsWith(".lovable.app") || h.endsWith(".lovable.dev")) return false;
  return true;
}

export type ReplicationMode = "cloud_primary" | "local_primary" | "unknown";

export function useReplicationMode(): { mode: ReplicationMode; isReplica: boolean } {
  const { activeCasinoId } = useCasino();
  const [mode, setMode] = useState<ReplicationMode>("unknown");

  useEffect(() => {
    let alive = true;
    if (!activeCasinoId) { setMode("unknown"); return; }
    (async () => {
      const { data } = await supabase
        .from("node_modes")
        .select("mode")
        .eq("casino_id", activeCasinoId)
        .maybeSingle();
      if (!alive) return;
      setMode(((data?.mode as ReplicationMode) ?? "cloud_primary"));
    })();

    const ch = supabase
      .channel(`casino:${activeCasinoId}:node_modes`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "node_modes", filter: `casino_id=eq.${activeCasinoId}` },
        (payload: any) => {
          const next = (payload.new?.mode ?? "cloud_primary") as ReplicationMode;
          setMode(next);
        },
      )
      .subscribe();

    return () => { alive = false; supabase.removeChannel(ch); };
  }, [activeCasinoId]);

  // Derive "this node is read-only because the other node owns writes"
  const local = isLocalNode();
  const isReplica =
    (local && mode === "cloud_primary") ||
    (!local && mode === "local_primary");

  return { mode, isReplica };
}
