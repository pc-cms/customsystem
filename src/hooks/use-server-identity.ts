/**
 * use-server-identity — read/write CASINO_SLUG / CASINO_ID / NAME / DOMAIN / IP
 * stored in the local server's .env. Hot-restarts cms-frontend after save so
 * the new runtime-config takes effect (~30 s downtime).
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { liveQueryOptions, liveQueryOptionsWithFallback } from "@/lib/live-query-options";
import { supabase } from "@/integrations/supabase/client";
import { getCachedRuntimeConfig } from "@/lib/runtime-config";
import { toast } from "sonner";

export interface ServerIdentity {
  casino_id: string;
  casino_slug: string;
  casino_name: string;
  local_domain: string;
  local_ip: string;
  unconfigured: boolean;
}

export const isLocalServer = () => getCachedRuntimeConfig()?.localMode === true;

async function authedFetch(path: string, init?: RequestInit) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("not authenticated");
  const r = await fetch(path, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  if (!r.ok) throw new Error(`${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

export const useServerIdentity = () =>
  useQuery({
    queryKey: ["server-identity"],
    queryFn: (): Promise<ServerIdentity> => authedFetch("/api/node/server-identity"),
    enabled: isLocalServer(),
    ...liveQueryOptionsWithFallback(30000),
  });

export const useSaveServerIdentity = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: Partial<ServerIdentity>) =>
      authedFetch("/api/node/server-identity", {
        method: "POST",
        body: JSON.stringify(p),
      }),
    onSuccess: () => {
      toast.success("Saved — frontend restarting (~30 s)");
      qc.invalidateQueries({ queryKey: ["server-identity"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

// ─────────────────────────────────────────────────────────────
// Initial seed push (Case 1: Local → Cloud full mirror upload)
// ─────────────────────────────────────────────────────────────
export interface SeedPushStatus {
  marks: { table_name: string; row_count: number; completed_at: string }[];
  outbox: { pending: number; max_id: number };
  peers: { display_name: string; status: string; last_push_cursor: number; last_pull_cursor: number; last_push_error: string | null }[];
}

export const useSeedPush = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (casinoId?: string) =>
      authedFetch("/api/node/seed-push", {
        method: "POST",
        body: JSON.stringify(casinoId ? { casino_id: casinoId } : {}),
      }),
    onSuccess: (data: { total_inserted: number }) => {
      toast.success(`Queued ${data.total_inserted.toLocaleString()} rows for upload to Cloud`);
      qc.invalidateQueries({ queryKey: ["seed-push-status"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

export const useSeedPushStatus = (enabled: boolean) =>
  useQuery({
    queryKey: ["seed-push-status"],
    queryFn: (): Promise<SeedPushStatus> => authedFetch("/api/node/seed-push/status"),
    enabled: enabled && isLocalServer(),
    refetchInterval: 3000,
  });

// ─────────────────────────────────────────────────────────────
// Clone from Cloud (Case 2: wipe local & replace with Cloud copy)
// ─────────────────────────────────────────────────────────────
export interface CloneStatus {
  status: "idle" | "running" | "error" | "done";
  started_at: string | null;
  finished_at: string | null;
  current_table: string | null;
  counts: Record<string, number>;
  error: string | null;
}

export const useCloneFromCloud = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      authedFetch("/api/node/clone-from-cloud", { method: "POST", body: "{}" }),
    onSuccess: () => {
      toast.success("Clone started — see progress below");
      qc.invalidateQueries({ queryKey: ["clone-status"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

export const useCloneStatus = (enabled: boolean) =>
  useQuery({
    queryKey: ["clone-status"],
    queryFn: (): Promise<CloneStatus> => authedFetch("/api/node/clone-from-cloud/status"),
    enabled: enabled && isLocalServer(),
    refetchInterval: 2000,
  });

