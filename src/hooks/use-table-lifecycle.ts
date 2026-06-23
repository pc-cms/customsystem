import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useCasino } from "@/lib/casino-context";
import { logAction } from "@/lib/logging";
import { offlineMutation } from "@/lib/offline-mutation";
import { toast } from "sonner";

// ============ CHIP BASELINE ============
export const useChipBaseline = () => {
  const { activeCasinoId: casinoId } = useCasino();
  return useQuery({
    queryKey: ["chip-baseline", casinoId],
    queryFn: async () => {
      if (!casinoId) return [];
      const { data, error } = await supabase
        .from("chip_baseline")
        .select("*")
        .eq("casino_id", casinoId);
      if (error) throw error;
      return data;
    },
    enabled: !!casinoId,
  });
};

export const useUpsertBaseline = () => {
  const qc = useQueryClient();
  const { activeCasinoId: casinoId } = useCasino();
  return useMutation({
    mutationFn: async (entries: Array<{
      location_type: string;
      location_id: string | null;
      denomination: number;
      expected_quantity: number;
    }>) => {
      if (!casinoId) throw new Error("No casino");
      for (const entry of entries) {
        const { data: existing } = await supabase
          .from("chip_baseline")
          .select("id")
          .eq("casino_id", casinoId)
          .eq("location_type", entry.location_type)
          .eq("denomination", entry.denomination)
          .is("location_id", entry.location_id === null ? null : undefined as any)
          .maybeSingle();

        // Try with location_id match if not null
        let found = existing;
        if (!found && entry.location_id) {
          const { data: existing2 } = await supabase
            .from("chip_baseline")
            .select("id")
            .eq("casino_id", casinoId)
            .eq("location_type", entry.location_type)
            .eq("location_id", entry.location_id)
            .eq("denomination", entry.denomination)
            .maybeSingle();
          found = existing2;
        }

        if (found) {
          const { error } = await supabase
            .from("chip_baseline")
            .update({ expected_quantity: entry.expected_quantity } as any)
            .eq("id", found.id);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from("chip_baseline")
            .insert({
              casino_id: casinoId,
              location_type: entry.location_type,
              location_id: entry.location_id,
              denomination: entry.denomination,
              expected_quantity: entry.expected_quantity,
            } as any);
          if (error) throw error;
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chip-baseline"] });
      toast.success("Baseline updated");
    },
    onError: (e) => toast.error(e.message),
  });
};

// ============ CASINO INFO (float_locked) ============
export const useCasinoInfo = () => {
  const { activeCasinoId: casinoId } = useCasino();
  return useQuery({
    queryKey: ["casino-info", casinoId],
    queryFn: async () => {
      if (!casinoId) return null;
      // Trigger pending → active promotion if its activation date has arrived.
      // Result is ignored; the row read below will reflect the up-to-date values.
      try {
        await supabase.rpc("get_effective_shift_settings", { _casino_id: casinoId });
      } catch (e) {
        // Non-fatal — RPC may not exist on legacy backends; row read below still works.
        console.warn("get_effective_shift_settings rpc warn", e);
      }
      const { data, error } = await supabase
        .from("casinos")
        .select("*")
        .eq("id", casinoId)
        .single();
      if (error) throw error;
      return data as any;
    },
    enabled: !!casinoId,
  });
};

export const useLockFloat = () => {
  const qc = useQueryClient();
  const { activeCasinoId: casinoId } = useCasino();
  return useMutation({
    mutationFn: async () => {
      if (!casinoId) throw new Error("No casino");
      const { error } = await supabase
        .from("casinos")
        .update({ float_locked: true } as any)
        .eq("id", casinoId);
      if (error) throw error;
      await logAction(casinoId, "system", "FLOAT_LOCKED", {});
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["casino-info"] });
      toast.success("Casino float locked");
    },
    onError: (e) => toast.error(e.message),
  });
};

/**
 * Update casino schedule.
 * `shift_end` and `breaklist_lock` are critical timing parameters — changing
 * them mid-shift would shift the business-day boundary instantly. Instead we
 * write them to *_pending with an activation date = next business day.
 * The DB function `get_effective_shift_settings` promotes pending → active
 * once that date arrives.
 */
export const useUpdateCasinoSchedule = () => {
  const qc = useQueryClient();
  const { activeCasinoId: casinoId } = useCasino();
  return useMutation({
    mutationFn: async (input: {
      shift_start: string;
      shift_end: string;
      tables_open: string;
      breaklist_lock: string;
      cage_float?: number;
      /** Current values (for diffing — only changed shift_end/breaklist_lock get deferred) */
      current_shift_end?: string;
      current_breaklist_lock?: string;
    }) => {
      if (!casinoId) throw new Error("No casino");

      // Compute "next business day start" date (today's business date + 1).
      // Using the *current* shift_end so pending activates from tomorrow's shift.
      const { getBusinessDate } = await import("@/lib/business-day");
      const curEnd = parseInt((input.current_shift_end || input.shift_end).split(":")[0], 10) || 5;
      const today = getBusinessDate(curEnd);
      const next = new Date(today + "T00:00:00Z");
      next.setUTCDate(next.getUTCDate() + 1);
      const nextDate = next.toISOString().slice(0, 10);

      const update: Record<string, unknown> = {
        shift_start: input.shift_start,
        tables_open: input.tables_open,
      };
      if (input.cage_float !== undefined) update.cage_float = input.cage_float;

      // Defer shift_end if changed
      if (input.current_shift_end !== undefined && input.shift_end !== input.current_shift_end) {
        update.shift_end_pending = input.shift_end;
        update.shift_end_pending_from = nextDate;
      } else if (input.current_shift_end === undefined) {
        // First-time set or no diff info — apply immediately (legacy)
        update.shift_end = input.shift_end;
      }

      // Defer breaklist_lock if changed
      if (input.current_breaklist_lock !== undefined && input.breaklist_lock !== input.current_breaklist_lock) {
        update.breaklist_lock_pending = input.breaklist_lock;
        update.breaklist_lock_pending_from = nextDate;
      } else if (input.current_breaklist_lock === undefined) {
        update.breaklist_lock = input.breaklist_lock;
      }

      const { error } = await supabase
        .from("casinos")
        .update(update as any)
        .eq("id", casinoId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["casino-info"] });
      toast.success("Schedule updated");
    },
    onError: (e) => toast.error(e.message),
  });
};

/** Cancel a previously-scheduled (pending) shift_end or breaklist_lock change. */
export const useCancelPendingSchedule = () => {
  const qc = useQueryClient();
  const { activeCasinoId: casinoId } = useCasino();
  return useMutation({
    mutationFn: async (field: "shift_end" | "breaklist_lock") => {
      if (!casinoId) throw new Error("No casino");
      const update = field === "shift_end"
        ? { shift_end_pending: null, shift_end_pending_from: null }
        : { breaklist_lock_pending: null, breaklist_lock_pending_from: null };
      const { error } = await supabase
        .from("casinos")
        .update(update as any)
        .eq("id", casinoId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["casino-info"] });
      toast.success("Pending change cancelled");
    },
    onError: (e) => toast.error(e.message),
  });
};

// ============ TABLE LIFECYCLE ============

// Open a single table (Pit action) — clears closing data
export const useOpenTable = () => {
  const qc = useQueryClient();
  const { activeCasinoId: casinoId } = useCasino();
  return useMutation({
    mutationFn: async (tableId: string) => {
      if (!casinoId) throw new Error("No casino");
      const { error } = await supabase
        .from("gaming_tables")
        .update({ status: "open" as any, closing_chips: null, closing_result: null })
        .eq("id", tableId);
      if (error) throw error;
      await logAction(casinoId, "system", "TABLE_OPENED", { table_id: tableId });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gaming-tables"] });
    },
    onError: (e) => toast.error(e.message),
  });
};

// Open all closed tables at once
export const useOpenAllTables = () => {
  const qc = useQueryClient();
  const { activeCasinoId: casinoId } = useCasino();
  return useMutation({
    mutationFn: async (tableIds: string[]) => {
      if (!casinoId) throw new Error("No casino");
      for (const id of tableIds) {
        const { error } = await supabase
          .from("gaming_tables")
          .update({ status: "open" as any, closing_chips: null, closing_result: null })
          .eq("id", id);
        if (error) throw error;
      }
      await logAction(casinoId, "system", "TABLES_OPENED", { table_ids: tableIds });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gaming-tables"] });
      toast.success("Tables opened");
    },
    onError: (e) => toast.error(e.message),
  });
};

// Set result on tables (Pit action) — stores closing_chips + closing_result
export const useSetTableResults = () => {
  const qc = useQueryClient();
  const { activeCasinoId: casinoId } = useCasino();
  return useMutation({
    mutationFn: async (results: Array<{
      table_id: string;
      closing_chips: Record<string, number>; // denom → actual count
      closing_result: number; // total value deviation from baseline
    }>) => {
      if (!casinoId) throw new Error("No casino");
      for (const r of results) {
        const { error } = await supabase
          .from("gaming_tables")
          .update({
            closing_chips: r.closing_chips as any,
            closing_result: r.closing_result,
          })
          .eq("id", r.table_id);
        if (error) throw error;
      }
      await logAction(casinoId, "system", "TABLE_RESULTS_SET", {
        tables: results.length,
        total_result: results.reduce((s, r) => s + r.closing_result, 0),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gaming-tables"] });
      toast.success("Table results recorded");
    },
    onError: (e) => toast.error(e.message),
  });
};

// Set result for a SINGLE table (Pit Close Table wizard) — offline-aware
export const useSetSingleTableResult = () => {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { activeCasinoId: casinoId } = useCasino();
  return useMutation({
    mutationFn: async (input: {
      table_id: string;
      closing_chips: Record<string, number>;
      closing_result: number;
      snapshot_rows?: Array<{
        location_type: string;
        location_id: string | null;
        denomination: number;
        expected_quantity: number;
        actual_quantity: number;
        date: string;
      }>;
    }) => {
      if (!casinoId || !user) throw new Error("Not authenticated");

      const updatePromise = offlineMutation({
        table: "gaming_tables",
        operation: "update",
        payload: {
          _match: { id: input.table_id },
          closing_chips: input.closing_chips,
          closing_result: input.closing_result,
        },
      });

      const snapshotPromise = (input.snapshot_rows && input.snapshot_rows.length > 0)
        ? offlineMutation({
            table: "chip_snapshots",
            operation: "insert",
            payload: input.snapshot_rows.map(r => ({
              id: crypto.randomUUID(),
              casino_id: casinoId,
              date: r.date,
              location_type: r.location_type,
              location_id: r.location_id,
              denomination: r.denomination,
              expected_quantity: r.expected_quantity,
              actual_quantity: r.actual_quantity,
              recorded_by: user.id,
            })) as any,
          })
        : Promise.resolve({ offline: false } as any);

      const [updateRes, snapRes] = await Promise.all([updatePromise, snapshotPromise]);
      if (updateRes.error) throw new Error(updateRes.error);
      if (snapRes.error) throw new Error(snapRes.error);

      if (!updateRes.offline) {
        // Fire-and-forget — don't block Save on the audit log write.
        void logAction(casinoId, "system", "TABLE_RESULT_SET", {
          table_id: input.table_id,
          closing_result: input.closing_result,
        }).catch(() => {});
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gaming-tables"] });
      qc.invalidateQueries({ queryKey: ["chip-snapshots"] });
      qc.invalidateQueries({ queryKey: ["shift_tables_result_total"] });
    },
    onError: (e) => toast.error(e.message),
  });
};

// Reopen a single table (clear closing draft) — Manager Access required at UI level
export const useReopenSingleTable = () => {
  const qc = useQueryClient();
  const { activeCasinoId: casinoId } = useCasino();
  return useMutation({
    mutationFn: async (tableId: string) => {
      if (!casinoId) throw new Error("No casino");
      const res = await offlineMutation({
        table: "gaming_tables",
        operation: "update",
        payload: {
          _match: { id: tableId },
          closing_chips: null,
          closing_result: null,
        },
      });
      if (res.error) throw new Error(res.error);
      if (!res.offline) {
        await logAction(casinoId, "system", "TABLE_RESULT_REOPENED", { table_id: tableId });
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["gaming-tables"] }),
    onError: (e) => toast.error(e.message),
  });
};

// Close all tables (Cashier action) — sets status to 'closed' (offline-aware).
// Uses a SINGLE batched UPDATE with `.in('id', ids)` so closing 10+ tables is
// one network round-trip (~1-2s) instead of N sequential updates (~20s on
// East Africa cloud RTT).
export const useCloseAllTables = () => {
  const qc = useQueryClient();
  const { activeCasinoId: casinoId } = useCasino();
  return useMutation({
    mutationFn: async (tableIds: string[]) => {
      if (!casinoId) throw new Error("No casino");
      if (tableIds.length === 0) return { offline: false };

      // Online: single batched UPDATE.
      if (navigator.onLine) {
        const { error } = await supabase
          .from("gaming_tables")
          .update({ status: "closed" as any })
          .in("id", tableIds);
        if (!error) {
          void logAction(casinoId, "system", "TABLES_CLOSED_BY_CASHIER", { table_ids: tableIds })
            .catch(() => {});
          return { offline: false };
        }
        // Network/timeout error → fall through to offline queue per-row so
        // each enqueued item is independently retried by the sync engine.
      }

      // Offline (or batched online failed): enqueue per table.
      let anyOffline = false;
      for (const id of tableIds) {
        const res = await offlineMutation({
          table: "gaming_tables",
          operation: "update",
          payload: { _match: { id }, status: "closed" },
        });
        if (res.error) throw new Error(res.error);
        if (res.offline) anyOffline = true;
      }
      if (!anyOffline) {
        void logAction(casinoId, "system", "TABLES_CLOSED_BY_CASHIER", { table_ids: tableIds })
          .catch(() => {});
      }
      return { offline: anyOffline };
    },
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ["gaming-tables"] });
      toast.success(res?.offline ? "Tables closed (offline — will sync)" : "Tables closed");
    },
    onError: (e) => toast.error(e.message),
  });
};

// ============ HELPERS ============

// Get baseline as a convenient map: { [tableId]: { [denom]: qty } }
export const baselineToMap = (
  baseline: Array<{ location_type: string; location_id: string | null; denomination: number; expected_quantity: number }>
): Record<string, Record<number, number>> => {
  const map: Record<string, Record<number, number>> = {};
  baseline.forEach(b => {
    const key = b.location_id || b.location_type;
    if (!map[key]) map[key] = {};
    map[key][b.denomination] = b.expected_quantity;
  });
  return map;
};
