import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { logAction } from "@/lib/logging";
import { offlineMutation } from "@/lib/offline-mutation";
import { fetchChipSnapshots } from "@/lib/chip-snapshots";
import { toast } from "sonner";
import { CHIP_DENOMS, CHIP_DISTRIBUTION } from "@/lib/currency";

// ============ CHIP INVENTORY ============
export const useChipInventory = () => {
  const { casinoId } = useAuth();
  return useQuery({
    queryKey: ["chip-inventory", casinoId],
    queryFn: async () => {
      if (!casinoId) return [];
      const { data, error } = await supabase
        .from("chip_inventory")
        .select("*")
        .eq("casino_id", casinoId);
      if (error) throw error;
      return data;
    },
    enabled: !!casinoId,
  });
};

export const useUpdateChipInventory = () => {
  const qc = useQueryClient();
  const { casinoId, user } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      location_type: string;
      location_id: string | null;
      denomination: number;
      quantity: number;
    }) => {
      if (!casinoId || !user) throw new Error("Not authenticated");
      // Upsert: try update first, then insert
      const { data: existing } = await supabase
        .from("chip_inventory")
        .select("id")
        .eq("casino_id", casinoId)
        .eq("location_type", input.location_type)
        .eq("denomination", input.denomination)
        .eq("location_id", input.location_id ?? "")
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from("chip_inventory")
          .update({ quantity: input.quantity, updated_by: user.id } as any)
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("chip_inventory")
          .insert({
            casino_id: casinoId,
            location_type: input.location_type,
            location_id: input.location_id,
            denomination: input.denomination,
            quantity: input.quantity,
            updated_by: user.id,
          } as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chip-inventory"] });
    },
    onError: (e) => toast.error(e.message),
  });
};

// ============ CHIP SNAPSHOTS ============
// Default hook: returns ONLY the latest snapshot per (location_type, location_id,
// denomination) for the given day via RPC chip_snapshots_latest. On a busy day a
// raw fetch returns 2000+ rows (~1MB); the latest-only view is ~300 rows. Realtime
// (use-realtime.ts) invalidates on inserts, so the cache stays fresh.
// For full per-hour history use `useChipSnapshotsFull` (analytics chart only).
export const useChipSnapshots = (date: string) => {
  const { casinoId } = useAuth();
  const isToday = date === new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Dar_es_Salaam" });
  return useQuery({
    queryKey: ["chip-snapshots", casinoId, date],
    queryFn: async () => {
      if (!casinoId) return [];
      const { data, error } = await supabase.rpc("chip_snapshots_latest", {
        _casino_id: casinoId,
        _date: date,
      });
      if (error) throw error;
      return data || [];
    },
    enabled: !!casinoId,
    // Pin today's data forever in-session: realtime keeps it fresh, no need to
    // refetch on navigation. Past dates may receive late edits → 5min freshness.
    staleTime: isToday ? Infinity : 5 * 60_000,
    gcTime: 24 * 60 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
};

// Full per-hour history (used only by Tables → Analytics chart).
export const useChipSnapshotsFull = (date: string) => {
  const { casinoId } = useAuth();
  return useQuery({
    queryKey: ["chip-snapshots-full", casinoId, date],
    queryFn: async () => {
      if (!casinoId) return [];
      return fetchChipSnapshots(casinoId, date);
    },
    enabled: !!casinoId,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
};

export const useCreateChipSnapshot = () => {
  const qc = useQueryClient();
  const { casinoId, user } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      date: string;
      location_type: string;
      location_id: string | null;
      denomination: number;
      expected_quantity: number;
      actual_quantity: number;
    }) => {
      if (!casinoId || !user) throw new Error("Not authenticated");
      const { error } = await supabase
        .from("chip_snapshots")
        .insert({
          casino_id: casinoId,
          date: input.date,
          location_type: input.location_type,
          location_id: input.location_id,
          denomination: input.denomination,
          expected_quantity: input.expected_quantity,
          actual_quantity: input.actual_quantity,
          recorded_by: user.id,
        } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chip-snapshots"] });
    },
    onError: (e) => toast.error(e.message),
  });
};

export const useBatchChipSnapshot = () => {
  const qc = useQueryClient();
  const { casinoId, user } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      date: string;
      counts: Array<{
        location_type: string;
        location_id: string | null;
        denomination: number;
        expected_quantity: number;
        actual_quantity: number;
      }>;
    }) => {
      if (!casinoId || !user) throw new Error("Not authenticated");
      const rows = ((input as any).optimisticRows ?? input.counts.map(c => ({
        id: crypto.randomUUID(),
        casino_id: casinoId,
        date: input.date,
        location_type: c.location_type,
        location_id: c.location_id,
        denomination: c.denomination,
        expected_quantity: c.expected_quantity,
        actual_quantity: c.actual_quantity,
        recorded_by: user.id,
        created_at: new Date().toISOString(),
      }))) as any[];
      const result = await offlineMutation({
        table: "chip_snapshots",
        operation: "insert",
        payload: rows as any,
      });
      if (result.error) throw new Error(result.error);
      if (!result.offline) {
        await logAction(casinoId, "system", "CHIP_COUNT_RECORDED", {
          date: input.date,
          total_denominations: input.counts.length,
          total_miss: rows.reduce((s, r) => s + (r.actual_quantity - r.expected_quantity), 0),
        });
      }
      return { offline: result.offline };
    },
    onMutate: async (input) => {
      if (!casinoId || !user) return;
      const createdAt = new Date().toISOString();
      const optimisticRows = input.counts.map(c => ({
        id: crypto.randomUUID(),
        casino_id: casinoId,
        date: input.date,
        location_type: c.location_type,
        location_id: c.location_id,
        denomination: c.denomination,
        expected_quantity: c.expected_quantity,
        actual_quantity: c.actual_quantity,
        recorded_by: user.id,
        created_at: createdAt,
      }));
      (input as any).optimisticRows = optimisticRows;
      const queryKey = ["chip-snapshots", casinoId, input.date];
      const queryKeyFull = ["chip-snapshots-full", casinoId, input.date];
      await qc.cancelQueries({ queryKey });
      await qc.cancelQueries({ queryKey: queryKeyFull });
      qc.setQueryData<any[]>(queryKey, (old = []) => [...optimisticRows, ...old]);
      // Mirror into the "full history" cache so the Snapshot history panel
      // updates instantly after Save (instead of waiting for realtime).
      qc.setQueryData<any[]>(queryKeyFull, (old = []) => [...optimisticRows, ...old]);
      return { queryKey, queryKeyFull, optimisticIds: optimisticRows.map(r => r.id) };
    },
    onSuccess: (res: any) => {
      // Optimistic rows already cover the UI; realtime will reconcile across
      // tabs/devices. Skip invalidateQueries — a refetch of 2000+ rows on a
      // slow PC was the main cause of the "freeze" after Save.
      toast.success(res?.offline ? "Chip count saved offline" : "Chip count recorded");
    },
    onError: (e, _input, ctx: any) => {
      if (ctx?.optimisticIds) {
        if (ctx?.queryKey) {
          qc.setQueryData<any[]>(ctx.queryKey, (old = []) => old.filter(r => !ctx.optimisticIds.includes(r.id)));
        }
        if (ctx?.queryKeyFull) {
          qc.setQueryData<any[]>(ctx.queryKeyFull, (old = []) => old.filter(r => !ctx.optimisticIds.includes(r.id)));
        }
      }
      toast.error(e.message);
    },
  });
};

// ============ HELPERS ============

// Calculate expected chip quantities per denomination based on table config
export const getExpectedChips = (
  tables: Array<{ id: string; game: string; status: string; denominations: number[] }>,
): Record<number, number> => {
  const expected: Record<number, number> = {};
  CHIP_DENOMS.forEach(d => { expected[d] = 0; });

  // Tables
  tables.forEach(t => {
    const chipsPerDenom = t.game === "American Roulette"
      ? CHIP_DISTRIBUTION.roulette
      : CHIP_DISTRIBUTION.card;
    (t.denominations || []).forEach(d => {
      if (expected[d] !== undefined) expected[d] += chipsPerDenom;
    });
  });

  // Cashier float
  CHIP_DENOMS.forEach(d => { expected[d] += CHIP_DISTRIBUTION.cashier; });

  // Manager safe
  CHIP_DENOMS.forEach(d => { expected[d] += CHIP_DISTRIBUTION.safe; });

  return expected;
};

// Get initial total chips (what should never change)
export const getInitialTotal = (
  tables: Array<{ id: string; game: string; status: string; denominations: number[] }>,
): number => {
  const expected = getExpectedChips(tables);
  return Object.entries(expected).reduce((sum, [d, q]) => sum + Number(d) * q, 0);
};
