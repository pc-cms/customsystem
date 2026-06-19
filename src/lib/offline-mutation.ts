/**
 * Offline-aware mutation wrapper.
 * When online: executes directly via Supabase (with a hard timeout).
 * When offline (or online attempt times out): enqueues to IndexedDB and
 * returns optimistically so the UI never gets stuck on "Recording…".
 */

import { supabase } from "@/integrations/supabase/client";
import { enqueue } from "./offline-queue";
import { syncPendingActions } from "./sync-engine";
import { toast } from "sonner";

type OfflineMutationOptions = {
  table: string;
  operation: "insert" | "upsert" | "update";
  payload: Record<string, any>;
  upsertConflict?: string;
  meta?: Record<string, any>;
  /** ms before we give up on the online attempt and enqueue offline. Default 8000. */
  onlineTimeoutMs?: number;
};

/**
 * Race a promise against a timeout. Resolves with `{ timedOut: true }` if the
 * original promise hasn't settled in `ms` milliseconds. This is the critical
 * fix for "Recording…" hangs: supabase-js does not abort fetch on flaky TCP,
 * so without this race the mutation never resolves.
 */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<{ timedOut: false; value: T } | { timedOut: true }> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve({ timedOut: true }), ms);
    p.then(
      (value) => { clearTimeout(t); resolve({ timedOut: false, value }); },
      (err) => { clearTimeout(t); resolve({ timedOut: false, value: { error: err } as any }); },
    );
  });
}

function isNetworkError(msg: string | undefined): boolean {
  if (!msg) return false;
  const s = msg.toLowerCase();
  return s.includes("fetch") || s.includes("failed") || s.includes("network") ||
         s.includes("timeout") || s.includes("timed out") || s.includes("offline");
}

export async function offlineMutation(opts: OfflineMutationOptions): Promise<{ offline: boolean; error?: string }> {
  // 15s default — tuned for cloud RTT from East Africa (Arusha/Mwanza/Dodoma/Mbeya).
  // Must stay identical across all casinos; do not override per-location.
  const timeoutMs = opts.onlineTimeoutMs ?? 15000;

  // If online, try direct execution with a hard timeout
  if (navigator.onLine) {
    try {
      const table = opts.table as any;
      let req: PromiseLike<any>;

      if (opts.operation === "insert") {
        req = supabase.from(table).insert(opts.payload);
      } else if (opts.operation === "upsert") {
        req = supabase.from(table).upsert(opts.payload, { onConflict: opts.upsertConflict } as any);
      } else if (opts.operation === "update") {
        const { _match, ...updateFields } = opts.payload;
        if (!_match) {
          return { offline: false, error: "update requires _match" };
        }
        let q = supabase.from(table).update(updateFields);
        for (const [k, v] of Object.entries(_match as Record<string, any>)) {
          q = v === null || v === undefined ? q.is(k, null) : q.eq(k, v);
        }
        req = q;
      } else {
        return { offline: false, error: `unknown operation ${opts.operation}` };
      }

      const raced = await withTimeout(Promise.resolve(req), timeoutMs);

      if (raced.timedOut) {
        // Network hung — fall through to enqueue. Don't trust subsequent resolution.
      } else {
        const result: any = (raced as { timedOut: false; value: any }).value;
        if (result?.error) {
          if (isNetworkError(result.error.message)) {
            // Fall through to enqueue
          } else {
            return { offline: false, error: result.error.message };
          }
        } else {
          return { offline: false };
        }
      }
    } catch (e: any) {
      if (!isNetworkError(e?.message)) {
        return { offline: false, error: e?.message || "unknown error" };
      }
      // Fall through to enqueue
    }
  }

  // Offline (or online attempt timed out / network-errored): enqueue.
  try {
    await enqueue({
      table: opts.table,
      operation: opts.operation,
      payload: opts.payload,
      upsertConflict: opts.upsertConflict,
      meta: opts.meta,
    });
    toast.info(
      navigator.onLine
        ? "Connection slow — saved offline, will retry"
        : "Saved offline — will sync when connected",
    );
    // Kick a background sync attempt; don't await so UI doesn't block.
    void syncPendingActions().catch(() => {});
    return { offline: true };
  } catch (e: any) {
    return { offline: true, error: e?.message || "enqueue failed" };
  }
}

// Trigger sync attempt (e.g., after coming back online)
export async function triggerSync() {
  return syncPendingActions();
}
