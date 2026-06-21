/**
 * Phase 3: Dealer-keyed reads/writes go through `employees` (Live Game).
 * Hooks alias employee_id → dealer_id and write employee_id (DB triggers
 * keep the legacy `dealer_id` column in sync). Consumers stay unchanged.
 */
import { useQuery, useMutation, useQueryClient, useIsMutating } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useCasino } from "@/lib/casino-context";
import { logAction } from "@/lib/logging";
import { offlineMutation } from "@/lib/offline-mutation";
import { toast } from "sonner";
import { buildDisplayNames, splitFullName } from "@/lib/display-name";
import { invalidateEmployeeCaches } from "@/lib/invalidate-employees";

// ============ DEALERS (= employees WHERE department='Pit') ============

export type DealerRow = {
  id: string;
  casino_id: string;
  name: string;
  is_active: boolean;
  salary: number | null;
  contract_start: string | null;
  contract_end: string | null;
  category: "dealer" | "inspector" | "trainee";
  is_pit_boss: boolean;
  onboarding_date: string | null;
  photo_url: string | null;
  created_at: string;
};

export const mapEmployeeToDealer = (e: any): DealerRow => {
  const split = splitFullName(e.full_name);
  const first = (e.first_name && String(e.first_name).trim()) || split.first;
  // Show FIRST NAME only by default; disambiguation appends last-name initials
  // when two people share the same first name (handled in disambiguateNames).
  const displayName = first || (e.full_name && String(e.full_name).trim()) || "";
  return {
    id: e.id,
    casino_id: e.casino_id,
    name: displayName,
    is_active: e.payroll_status === "active",
    salary: e.basic_salary != null ? Number(e.basic_salary) : null,
    contract_start: e.contract_start,
    contract_end: e.contract_end,
    category: (e.dealer_category as any) ?? "dealer",
    is_pit_boss: !!e.is_pit_boss,
    onboarding_date: e.onboarding_date,
    photo_url: e.photo_url,
    created_at: e.created_at,
  };
};

/** Apply duplicate-first-name disambiguation: identical "Berta" + "Berta" → "Berta K", "Berta M". */
export const disambiguateNames = <T extends { id: string; name: string }>(
  rows: T[],
  raw: any[]
): T[] => {
  const inputs = raw.map((e) => {
    const split = splitFullName(e.full_name);
    const first = (e.first_name && String(e.first_name).trim()) || split.first || (e.full_name || "").trim();
    return {
      id: e.id,
      first,
      last: (e.last_name && String(e.last_name).trim()) || split.last,
    };
  });
  const map = buildDisplayNames(inputs);
  return rows.map((r) => ({ ...r, name: map.get(r.id) || r.name }));
};

const PAGE_SIZE = 1000;

const fetchPaged = async <T,>(buildQuery: (from: number, to: number) => PromiseLike<{ data: any; error: any }>) => {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await buildQuery(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }
  return rows;
};

export const fetchPitRotaRows = (casinoId: string, startDate: string, endDate = startDate) =>
  fetchPaged<any>((from, to) => supabase
    .from("pit_rota")
    .select("*")
    .eq("casino_id", casinoId)
    .gte("date", startDate)
    .lte("date", endDate)
    .order("date")
    .order("employee_id")
    .range(from, to));

export const fetchDealerAttendanceRows = (casinoId: string, startDate: string, endDate = startDate) =>
  fetchPaged<any>((from, to) => supabase
    .from("dealer_attendance" as any)
    .select("*")
    .eq("casino_id", casinoId)
    .gte("date", startDate)
    .lte("date", endDate)
    .order("date")
    .order("employee_id")
    .range(from, to));

export const fetchBreaklistRows = (casinoId: string, date: string) =>
  fetchPaged<any>((from, to) => supabase
    .from("breaklist")
    .select("*, gaming_tables(name)")
    .eq("casino_id", casinoId)
    .eq("date", date)
    .order("time_slot")
    .order("employee_id")
    .range(from, to));

export const useDealers = () => {
  const { activeCasinoId: casinoId, loading: casinoLoading } = useCasino();
  const { user, loading: authLoading } = useAuth();
  // Gate the query until BOTH the Supabase session AND the casino context have
  // fully resolved. Otherwise on a cold start (incognito / hard reload) the
  // first fetch can fire after `casinoId` is set but before the access token
  // is attached → RLS returns 0 rows → cached "empty" for 2 min.
  const isReady = !authLoading && !casinoLoading && !!user && !!casinoId;
  return useQuery({
    queryKey: ["dealers", casinoId],
    queryFn: async () => {
      if (!casinoId) return [];
      const { data, error } = await supabase
        .from("employees")
        .select("*")
        .eq("casino_id", casinoId)
        .eq("department", "Pit")
        .order("full_name");
      if (error) throw error;
      const raw = data ?? [];
      return disambiguateNames(raw.map(mapEmployeeToDealer), raw);
    },
    enabled: isReady,
    staleTime: 1000 * 60 * 2,
  });
};

export const useCreateDealer = () => {
  const qc = useQueryClient();
  const { activeCasinoId: casinoId } = useCasino();
  return useMutation({
    mutationFn: async ({ name, category, is_pit_boss }: { name: string; category: string; is_pit_boss: boolean }) => {
      if (!casinoId) throw new Error("No casino");
      const position = is_pit_boss ? "Pit Boss" : category === "inspector" ? "Inspector" : category === "trainee" ? "Trainee" : "Dealer";
      const { error } = await supabase.from("employees").insert({
        casino_id: casinoId, full_name: name, department: "Pit", position,
        dealer_category: is_pit_boss ? null : (category as any),
        is_pit_boss, basic_salary: 0, payroll_status: "active",
      });
      if (error) throw error;
    },
    onSuccess: () => { invalidateEmployeeCaches(qc); toast.success("Staff added"); },
  });
};

export const useUpdateDealer = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name, salary, contract_start, contract_end, onboarding_date, is_active, category, is_pit_boss, photo_url }: { id: string; name?: string; salary?: number | null; contract_start?: string | null; contract_end?: string | null; onboarding_date?: string | null; is_active?: boolean; category?: string; is_pit_boss?: boolean; photo_url?: string | null }) => {
      const patch: any = {};
      if (name !== undefined) patch.full_name = name;
      if (salary !== undefined) patch.basic_salary = salary ?? 0;
      if (contract_start !== undefined) patch.contract_start = contract_start;
      if (contract_end !== undefined) patch.contract_end = contract_end;
      if (onboarding_date !== undefined) patch.onboarding_date = onboarding_date;
      if (is_active !== undefined) patch.payroll_status = is_active ? "active" : "inactive";
      if (photo_url !== undefined) patch.photo_url = photo_url;
      if (is_pit_boss !== undefined) {
        patch.is_pit_boss = is_pit_boss;
        if (is_pit_boss) patch.dealer_category = null;
      }
      if (category !== undefined && !is_pit_boss) patch.dealer_category = category;
      const { error } = await supabase.from("employees").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidateEmployeeCaches(qc),
  });
};

export const useDeleteDealer = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // FK ON DELETE RESTRICT will block if history exists; UI should soft-deactivate instead.
      const { error } = await supabase.from("employees").update({ payroll_status: "inactive" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidateEmployeeCaches(qc),
  });
};

// ============ PIT ROTA — keyed by employee_id, aliased to dealer_id ============

const aliasRotaRow = (r: any) => ({ ...r, dealer_id: r.employee_id });

export const usePitRota = (date: string) => {
  const { activeCasinoId: casinoId } = useCasino();
  return useQuery({
    queryKey: ["pit-rota", casinoId, date],
    queryFn: async () => {
      if (!casinoId) return [];
      return (await fetchPitRotaRows(casinoId, date)).map(aliasRotaRow);
    },
    enabled: !!casinoId,
  });
};

export const usePitRotaRange = (startDate: string, endDate: string) => {
  const { activeCasinoId: casinoId } = useCasino();
  return useQuery({
    queryKey: ["pit-rota-range", casinoId, startDate, endDate],
    queryFn: async () => {
      if (!casinoId) return [];
      return (await fetchPitRotaRows(casinoId, startDate, endDate)).map(aliasRotaRow);
    },
    enabled: !!casinoId,
  });
};

export const useSetPitRota = () => {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { activeCasinoId: casinoId } = useCasino();
  return useMutation({
    mutationFn: async (input: { dealer_id: string; date: string; shift: string }) => {
      if (!casinoId || !user) throw new Error("Not authenticated");
      const result = await offlineMutation({
        table: "pit_rota",
        operation: "upsert",
        payload: {
          casino_id: casinoId,
          employee_id: input.dealer_id, // dealer_id from useDealers IS employees.id now
          date: input.date,
          shift: input.shift as any,
          created_by: user.id,
        },
        upsertConflict: "casino_id,employee_id,date",
      });
      if (result.error) throw new Error(result.error);
      if (!result.offline) await logAction(casinoId, "pit", "ROTA_SET", input);
      return { offline: result.offline };
    },
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: ["pit-rota-range", casinoId] });
      const queries = qc.getQueriesData<any[]>({ queryKey: ["pit-rota-range"] })
        .filter(([key]) => (key as any[])[1] === casinoId);
      queries.forEach(([key, data]) => {
        if (!data) return;
        const idx = data.findIndex((r: any) => r.dealer_id === input.dealer_id && r.date === input.date);
        const newEntry = { dealer_id: input.dealer_id, employee_id: input.dealer_id, date: input.date, shift: input.shift, casino_id: casinoId, id: `temp-${Date.now()}`, created_by: user?.id };
        const updated = [...data];
        if (idx >= 0) updated[idx] = { ...updated[idx], shift: input.shift };
        else updated.push(newEntry);
        qc.setQueryData(key, updated);
      });
      return { queries };
    },
    onError: () => { toast.error("Sync error (rota) — will retry", { duration: 2000 }); },
    onSettled: () => {},
  });
};

export const useDeletePitRota = () => {
  const qc = useQueryClient();
  const { activeCasinoId: casinoId } = useCasino();
  return useMutation({
    mutationFn: async ({ dealer_id, date }: { dealer_id: string; date: string }) => {
      if (!casinoId) throw new Error("No casino");
      if (navigator.onLine) {
        const { error } = await supabase
          .from("pit_rota").delete()
          .eq("casino_id", casinoId).eq("employee_id", dealer_id).eq("date", date);
        if (error) throw error;
      } else {
        const result = await offlineMutation({
          table: "pit_rota", operation: "upsert",
          payload: { casino_id: casinoId, employee_id: dealer_id, date, shift: null },
          upsertConflict: "casino_id,employee_id,date",
          meta: { intent: "delete" },
        });
        if (result.error) throw new Error(result.error);
      }
    },
    onMutate: async ({ dealer_id, date }) => {
      await qc.cancelQueries({ queryKey: ["pit-rota-range", casinoId] });
      const queries = qc.getQueriesData<any[]>({ queryKey: ["pit-rota-range"] })
        .filter(([key]) => (key as any[])[1] === casinoId);
      queries.forEach(([key, data]) => {
        if (!data) return;
        qc.setQueryData(key, data.filter((r: any) => !(r.dealer_id === dealer_id && r.date === date)));
      });
      return { queries };
    },
    onError: () => { toast.error("Sync error (rota delete) — will retry", { duration: 2000 }); },
    onSettled: () => {},
  });
};

// ============ DEALER ATTENDANCE ============

const aliasAttRow = (a: any) => ({ ...a, dealer_id: a.employee_id });

export const useDealerAttendance = (date: string) => {
  const { activeCasinoId: casinoId } = useCasino();
  return useQuery({
    queryKey: ["dealer-attendance", casinoId, date],
    queryFn: async () => {
      if (!casinoId) return [];
      return (await fetchDealerAttendanceRows(casinoId, date)).map(aliasAttRow);
    },
    enabled: !!casinoId,
  });
};

export const useSetDealerAttendance = () => {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { activeCasinoId: casinoId } = useCasino();
  return useMutation({
    mutationFn: async (input: { dealer_id: string; date: string; value: string }) => {
      if (!casinoId || !user) throw new Error("Not authenticated");
      const result = await offlineMutation({
        table: "dealer_attendance",
        operation: "upsert",
        payload: {
          casino_id: casinoId,
          employee_id: input.dealer_id,
          date: input.date,
          value: input.value,
          recorded_by: user.id,
          updated_at: new Date().toISOString(),
        },
        upsertConflict: "casino_id,employee_id,date",
      });
      if (result.error) throw new Error(result.error);
      return { offline: result.offline };
    },
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: ["dealer-attendance-range", casinoId] });
      const queries = qc.getQueriesData<any[]>({ queryKey: ["dealer-attendance-range"] })
        .filter(([key]) => (key as any[])[1] === casinoId);
      queries.forEach(([key, data]) => {
        if (!data) return;
        const idx = data.findIndex((a: any) => a.dealer_id === input.dealer_id && a.date === input.date);
        const updated = [...data];
        const entry = { dealer_id: input.dealer_id, employee_id: input.dealer_id, date: input.date, value: input.value, casino_id: casinoId };
        if (idx >= 0) updated[idx] = { ...updated[idx], value: input.value };
        else updated.push(entry);
        qc.setQueryData(key, updated);
      });
      return { queries };
    },
    onError: () => { toast.error("Sync error (attendance) — will retry", { duration: 2000 }); },
    onSettled: () => {},
  });
};

export const useDealerAttendanceRange = (startDate: string, endDate: string) => {
  const { activeCasinoId: casinoId } = useCasino();
  return useQuery({
    queryKey: ["dealer-attendance-range", casinoId, startDate, endDate],
    queryFn: async () => {
      if (!casinoId) return [];
      return (await fetchDealerAttendanceRows(casinoId, startDate, endDate)).map(aliasAttRow);
    },
    enabled: !!casinoId,
  });
};

// ============ BREAKLIST ============

const aliasBreaklistRow = (b: any) => ({ ...b, dealer_id: b.employee_id });

export const useBreaklistData = (date: string) => {
  const { activeCasinoId: casinoId } = useCasino();
  // Pause polling while local breaklist mutations are in flight. Otherwise a
  // 3.5s refetch can fire between optimistic update and server commit, pull
  // STALE rows, and overwrite the freshly-picked table — the cell would then
  // appear empty for 3-4 seconds until the next refetch after onSettled.
  const pendingBreaklistMutations = useIsMutating({ mutationKey: ["breaklist-cell"] });
  return useQuery({
    queryKey: ["breaklist", casinoId, date],
    queryFn: async () => {
      if (!casinoId) return [];
      return (await fetchBreaklistRows(casinoId, date)).map(aliasBreaklistRow);
    },
    enabled: !!casinoId,
    // Safety net for realtime: even if the websocket drops a postgres_changes
    // event (token refresh edge cases, network blips), Pit operators on two PCs
    // must converge within seconds — not after a manual reload.
    refetchInterval: pendingBreaklistMutations > 0 ? false : 3_500,
    refetchOnWindowFocus: pendingBreaklistMutations === 0,
    refetchOnReconnect: true,
  });
};


export const useSetBreaklistCell = () => {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { activeCasinoId: casinoId } = useCasino();
  return useMutation({
    mutationKey: ["breaklist-cell"],
    mutationFn: async (input: {
      date: string;
      dealer_id: string;
      time_slot: string;
      role: string;
      table_id: string | null;
    }) => {
      if (!casinoId || !user) throw new Error("Not authenticated");

      const payload = {
        casino_id: casinoId,
        date: input.date,
        employee_id: input.dealer_id, // employees.id
        time_slot: input.time_slot,
        role: input.role as any,
        table_id: input.table_id,
        created_by: user.id,
        updated_by: user.id,
      };

      const result = await offlineMutation({
        table: "breaklist",
        operation: "upsert",
        payload,
        upsertConflict: "casino_id,date,employee_id,time_slot",
        meta: { role: input.role, dealer_id: input.dealer_id, time_slot: input.time_slot },
      });

      if (result.error) throw new Error(result.error);

      if (!result.offline) {
        const { data: existing } = await supabase
          .from("breaklist")
          .select("id, role, table_id")
          .eq("casino_id", casinoId)
          .eq("date", input.date)
          .eq("employee_id", input.dealer_id)
          .eq("time_slot", input.time_slot)
          .maybeSingle();

        if (existing) {
          await supabase.from("breaklist_logs").insert({
            casino_id: casinoId,
            breaklist_id: existing.id,
            dealer_id: input.dealer_id, // employees.id (audit only, not joined)
            date: input.date,
            time_slot: input.time_slot,
            action: "CELL_UPDATED",
            old_role: null,
            new_role: input.role,
            old_table_id: null,
            new_table_id: input.table_id,
            operator_id: user.id,
          });
        }

        await logAction(casinoId, "breaklist", "CELL_SET", input);
      }

      return { offline: result.offline };
    },
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: ["breaklist", casinoId] });
      // Scope optimistic update to THIS casino only — otherwise a Mwanza edit
      // would inject a fake cell into the Arusha breaklist cache and the Arusha
      // grid would treat that slot as "occupied" and block the operator.
      const queries = qc.getQueriesData<any[]>({ queryKey: ["breaklist"] })
        .filter(([key]) => (key as any[])[1] === casinoId);
      queries.forEach(([key, data]) => {
        if (!data) return;
        const idx = data.findIndex((b: any) => b.dealer_id === input.dealer_id && b.time_slot === input.time_slot);
        const updated = [...data];
        const entry = { dealer_id: input.dealer_id, employee_id: input.dealer_id, time_slot: input.time_slot, role: input.role, table_id: input.table_id, date: input.date, casino_id: casinoId, id: `temp-${Date.now()}`, is_locked: false };
        if (idx >= 0) updated[idx] = { ...updated[idx], role: input.role, table_id: input.table_id };
        else updated.push(entry);
        qc.setQueryData(key, updated);
      });
      return { queries };
    },
    onError: (err: any, _input, ctx: any) => {
      if (ctx?.queries) ctx.queries.forEach(([key, data]: [any, any]) => qc.setQueryData(key, data));
      const msg = err?.message || "Unknown error";
      toast.error(`Breaklist not saved: ${msg}`, { duration: 4000 });
    },
    onSettled: () => { qc.invalidateQueries({ queryKey: ["breaklist"] }); },
  });
};

export const useLockBreaklistCell = () => {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { activeCasinoId: casinoId } = useCasino();
  return useMutation({
    mutationFn: async ({ id, lock }: { id: string; lock: boolean }) => {
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase.from("breaklist").update({
        is_locked: lock,
        locked_by: lock ? user.id : null,
        updated_by: user.id,
      }).eq("id", id);
      if (error) throw error;
      await logAction(casinoId!, "lock", lock ? "CELL_LOCKED" : "CELL_UNLOCKED", { breaklist_id: id });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["breaklist", casinoId] }); },
  });
};

export const useClearBreaklistCell = () => {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { activeCasinoId: casinoId } = useCasino();
  return useMutation({
    mutationKey: ["breaklist-cell"],
    mutationFn: async (input: { id: string; dealer_id: string; time_slot: string; date: string }) => {
      if (!casinoId || !user) throw new Error("Not authenticated");

      const { data: existing } = await supabase
        .from("breaklist")
        .select("role, table_id")
        .eq("id", input.id)
        .maybeSingle();

      const { error } = await supabase.from("breaklist").update({
        role: "CLR" as any,
        table_id: null,
        is_locked: false,
        locked_by: null,
        updated_by: user.id,
      }).eq("id", input.id);
      if (error) throw error;

      await supabase.from("breaklist_logs").insert({
        casino_id: casinoId,
        breaklist_id: input.id,
        dealer_id: input.dealer_id,
        date: input.date,
        time_slot: input.time_slot,
        action: "CELL_CLEARED",
        old_role: existing?.role ?? null,
        new_role: null,
        old_table_id: existing?.table_id ?? null,
        new_table_id: null,
        operator_id: user.id,
      });

      await logAction(casinoId, "breaklist", "CELL_CLEARED", input);
    },
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: ["breaklist", casinoId] });
      const queries = qc.getQueriesData<any[]>({ queryKey: ["breaklist"] })
        .filter(([key]) => (key as any[])[1] === casinoId);
      queries.forEach(([key, data]) => {
        if (!data) return;
        const updated = data.map((b: any) =>
          b.dealer_id === input.dealer_id && b.time_slot === input.time_slot
            ? { ...b, role: "CLR", table_id: null, is_locked: false, locked_by: null }
            : b,
        );
        qc.setQueryData(key, updated);
      });
      return { queries };
    },
    onError: (err: any, _input, ctx: any) => {
      if (ctx?.queries) ctx.queries.forEach(([key, data]: [any, any]) => qc.setQueryData(key, data));
      const msg = err?.message || "Unknown error";
      toast.error(`Breaklist clear failed: ${msg}`, { duration: 4000 });
    },
    onSettled: () => { qc.invalidateQueries({ queryKey: ["breaklist"] }); },
  });
};

export const useDeleteBreaklistCell = useClearBreaklistCell;
