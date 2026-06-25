import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useCasino } from "@/lib/casino-context";
import { logAction } from "@/lib/logging";
import { offlineMutation } from "@/lib/offline-mutation";
import { toast } from "sonner";

export const useGamingTables = (includeArchived = false) => {
  const { activeCasinoId: casinoId } = useCasino();
  return useQuery({
    queryKey: ["gaming-tables", casinoId, includeArchived],
    queryFn: async () => {
      if (!casinoId) return [];
      let query = supabase
        .from("gaming_tables")
        .select("*")
        .eq("casino_id", casinoId)
        .order("display_order", { ascending: true })
        .order("name", { ascending: true });
      if (!includeArchived) {
        query = query.eq("is_archived", false);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!casinoId,
    // Gaming tables change rarely (config). Realtime invalidates on edits.
    staleTime: 1000 * 60 * 5,
  });
};

export const useArchiveTable = () => {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { activeCasinoId: casinoId } = useCasino();
  return useMutation({
    mutationFn: async ({ tableId, archive }: { tableId: string; archive: boolean }) => {
      if (!casinoId || !user) throw new Error("Not authenticated");
      const { error } = await supabase
        .from("gaming_tables")
        .update({ is_archived: archive } as any)
        .eq("id", tableId);
      if (error) throw error;
      await logAction(casinoId, "system", archive ? "TABLE_ARCHIVED" : "TABLE_RESTORED", { table_id: tableId });
    },
    onSuccess: (_, { archive }) => {
      qc.invalidateQueries({ queryKey: ["gaming-tables"] });
      toast.success(archive ? "Table archived" : "Table restored");
    },
    onError: (e) => toast.error(e.message),
  });
};

export const useRenameTable = () => {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { activeCasinoId: casinoId } = useCasino();
  return useMutation({
    mutationFn: async ({ tableId, name }: { tableId: string; name: string }) => {
      if (!casinoId || !user) throw new Error("Not authenticated");
      const trimmed = name.trim();
      if (!trimmed) throw new Error("Name cannot be empty");
      const { error } = await supabase
        .from("gaming_tables")
        .update({ name: trimmed } as any)
        .eq("id", tableId);
      if (error) throw error;
      await logAction(casinoId, "system", "TABLE_RENAMED", { table_id: tableId, name: trimmed });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gaming-tables"] });
      toast.success("Table renamed");
    },
    onError: (e) => toast.error(e.message),
  });
};

export const useCloseTable = () => {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { activeCasinoId: casinoId } = useCasino();
  return useMutation({
    mutationFn: async (input: { table_id: string; closing_chips: Record<number, number> }) => {
      if (!casinoId || !user) throw new Error("Not authenticated");
      const { error } = await supabase
        .from("gaming_tables")
        .update({ status: "closed" as any, closing_chips: input.closing_chips as any })
        .eq("id", input.table_id);
      if (error) throw error;
      await logAction(casinoId, "system", "TABLE_CLOSED", { table_id: input.table_id, closing_chips: input.closing_chips });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["gaming-tables"] }); toast.success("Table closed"); },
    onError: (e) => toast.error(e.message),
  });
};

export const useReopenTable = () => {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { activeCasinoId: casinoId } = useCasino();
  return useMutation({
    mutationFn: async (tableId: string) => {
      if (!casinoId || !user) throw new Error("Not authenticated");
      const { error } = await supabase
        .from("gaming_tables")
        .update({ status: "open" as any, closing_chips: null as any, closing_result: null as any })
        .eq("id", tableId);
      if (error) throw error;
      await logAction(casinoId, "system", "TABLE_REOPENED", { table_id: tableId });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["gaming-tables"] }); toast.success("Table reopened"); },
    onError: (e) => toast.error(e.message),
  });
};

// ============ TABLE TRACKER ============
export const useTableTracker = (date: string) => {
  const { activeCasinoId: casinoId } = useCasino();
  return useQuery({
    queryKey: ["table-tracker", casinoId, date],
    queryFn: async () => {
      if (!casinoId) return [];
      const { data, error } = await supabase
        .from("table_tracker")
        .select("*, gaming_tables(name)")
        .eq("casino_id", casinoId)
        .eq("date", date);
      if (error) throw error;
      return data;
    },
    enabled: !!casinoId,
    staleTime: 15_000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
};


export const useSetTableTrackerValue = () => {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { activeCasinoId: casinoId } = useCasino();
  return useMutation({
    mutationFn: async (input: { table_id: string; date: string; time_slot: string; value: number }) => {
      if (!casinoId || !user) throw new Error("Not authenticated");
      const payload = {
        casino_id: casinoId,
        table_id: input.table_id,
        date: input.date,
        time_slot: input.time_slot,
        value: input.value,
        recorded_by: user.id,
      };

      const result = await offlineMutation({
        table: "table_tracker",
        operation: "upsert",
        payload,
        upsertConflict: "table_id,date,time_slot",
      });

      if (result.error) throw new Error(result.error);
      return { offline: result.offline };
    },
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: ["table-tracker", casinoId] });
      const queries = qc.getQueriesData<any[]>({ queryKey: ["table-tracker"] })
        .filter(([key]) => (key as any[])[1] === casinoId);
      const seenKeys = new Set<string>();
      queries.forEach(([key, data]) => {
        seenKeys.add(JSON.stringify(key));
        const base = data ?? [];
        const idx = base.findIndex((t: any) => t.table_id === input.table_id && t.time_slot === input.time_slot);
        const updated = [...base];
        const entry = { table_id: input.table_id, date: input.date, time_slot: input.time_slot, value: input.value, casino_id: casinoId, id: `temp-${Date.now()}` };
        if (idx >= 0) { updated[idx] = { ...updated[idx], value: input.value }; } else { updated.push(entry); }
        qc.setQueryData(key, updated);
      });
      // Seed cache for this exact date if no query was loaded yet — so the
      // Numbers tab sees the value the moment it mounts.
      const exactKey = ["table-tracker", casinoId, input.date];
      if (!seenKeys.has(JSON.stringify(exactKey))) {
        qc.setQueryData(exactKey, [{
          table_id: input.table_id, date: input.date, time_slot: input.time_slot,
          value: input.value, casino_id: casinoId, id: `temp-${Date.now()}`,
        }]);
      }
    },
    onError: (_err) => { toast.error("Sync error (tracker) — will retry", { duration: 2000 }); },
    onSettled: () => { qc.invalidateQueries({ queryKey: ["table-tracker", casinoId] }); },
  });
};


/**
 * Batched tracker writes — single network round-trip for N tables.
 * Used by Chip Count Save to avoid firing 10-20 parallel upserts that
 * stalled slow PCs.
 */
export const useBatchSetTableTrackerValue = () => {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { activeCasinoId: casinoId } = useCasino();
  return useMutation({
    mutationFn: async (input: { date: string; entries: Array<{ table_id: string; time_slot: string; value: number }> }) => {
      if (!casinoId || !user) throw new Error("Not authenticated");
      if (input.entries.length === 0) return { offline: false };
      const payload = input.entries.map((e) => ({
        casino_id: casinoId,
        table_id: e.table_id,
        date: input.date,
        time_slot: e.time_slot,
        value: e.value,
        recorded_by: user.id,
      }));
      const result = await offlineMutation({
        table: "table_tracker",
        operation: "upsert",
        payload,
        upsertConflict: "table_id,date,time_slot",
      });
      if (result.error) throw new Error(result.error);
      return { offline: result.offline };
    },
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: ["table-tracker", casinoId] });
      const queries = qc.getQueriesData<any[]>({ queryKey: ["table-tracker"] })
        .filter(([key]) => (key as any[])[1] === casinoId);
      queries.forEach(([key, data]) => {
        if (!data) return;
        let updated = [...data];
        for (const e of input.entries) {
          const idx = updated.findIndex((t: any) => t.table_id === e.table_id && t.time_slot === e.time_slot);
          const entry = { table_id: e.table_id, date: input.date, time_slot: e.time_slot, value: e.value, casino_id: casinoId, id: `temp-${Date.now()}-${e.table_id}-${e.time_slot}` };
          if (idx >= 0) updated[idx] = { ...updated[idx], value: e.value };
          else updated.push(entry);
        }
        qc.setQueryData(key, updated);
      });
    },
    onError: () => { toast.error("Sync error (tracker batch) — will retry", { duration: 2000 }); },
  });
};

// ============ TABLE HEAD COUNT (per-table, per-hour, 0-99) ============
export const useTableHeadCount = (date: string) => {
  const { activeCasinoId: casinoId } = useCasino();
  return useQuery({
    queryKey: ["table-head-count", casinoId, date],
    queryFn: async () => {
      if (!casinoId) return [];
      const { data, error } = await supabase
        .from("table_head_count")
        .select("*")
        .eq("casino_id", casinoId)
        .eq("date", date);
      if (error) throw error;
      return data;
    },
    enabled: !!casinoId,
  });
};

export const useSetTableHeadCount = () => {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { activeCasinoId: casinoId } = useCasino();
  return useMutation({
    mutationFn: async (input: { table_id: string; date: string; time_slot: string; value: number }) => {
      if (!casinoId || !user) throw new Error("Not authenticated");
      const payload = {
        casino_id: casinoId,
        table_id: input.table_id,
        date: input.date,
        time_slot: input.time_slot,
        value: input.value,
      };
      const result = await offlineMutation({
        table: "table_head_count",
        operation: "upsert",
        payload,
        upsertConflict: "casino_id,table_id,date,time_slot",
      });
      if (result.error) throw new Error(result.error);
      return { offline: result.offline };
    },
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: ["table-head-count", casinoId] });
      const queries = qc.getQueriesData<any[]>({ queryKey: ["table-head-count"] })
        .filter(([key]) => (key as any[])[1] === casinoId);
      queries.forEach(([key, data]) => {
        if (!data) return;
        const idx = data.findIndex((t: any) => t.table_id === input.table_id && t.time_slot === input.time_slot);
        const updated = [...data];
        const entry = { table_id: input.table_id, date: input.date, time_slot: input.time_slot, value: input.value, casino_id: casinoId, id: `temp-${Date.now()}` };
        if (idx >= 0) updated[idx] = { ...updated[idx], value: input.value };
        else updated.push(entry);
        qc.setQueryData(key, updated);
      });
    },
    onError: () => { toast.error("Sync error (head count) — will retry", { duration: 2000 }); },
  });
};

export const useBatchSetTableHeadCount = () => {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { activeCasinoId: casinoId } = useCasino();
  return useMutation({
    mutationFn: async (input: { date: string; entries: Array<{ table_id: string; time_slot: string; value: number }> }) => {
      if (!casinoId || !user) throw new Error("Not authenticated");
      if (input.entries.length === 0) return { offline: false };
      const payload = input.entries.map((e) => ({
        casino_id: casinoId,
        table_id: e.table_id,
        date: input.date,
        time_slot: e.time_slot,
        value: e.value,
      }));
      const result = await offlineMutation({
        table: "table_head_count",
        operation: "upsert",
        payload,
        upsertConflict: "casino_id,table_id,date,time_slot",
      });
      if (result.error) throw new Error(result.error);
      return { offline: result.offline };
    },
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: ["table-head-count", casinoId] });
      const queries = qc.getQueriesData<any[]>({ queryKey: ["table-head-count"] })
        .filter(([key]) => (key as any[])[1] === casinoId);
      queries.forEach(([key, data]) => {
        if (!data) return;
        let updated = [...data];
        for (const e of input.entries) {
          const idx = updated.findIndex((t: any) => t.table_id === e.table_id && t.time_slot === e.time_slot);
          const entry = { table_id: e.table_id, date: input.date, time_slot: e.time_slot, value: e.value, casino_id: casinoId, id: `temp-${Date.now()}-${e.table_id}-${e.time_slot}` };
          if (idx >= 0) updated[idx] = { ...updated[idx], value: e.value };
          else updated.push(entry);
        }
        qc.setQueryData(key, updated);
      });
    },
    onError: () => { toast.error("Sync error (head count batch) — will retry", { duration: 2000 }); },
  });
};
