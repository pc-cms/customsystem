/**
 * Rota Lock hooks.
 *
 * One row per (casino_id, scope, month) in `rota_locks` means that month
 * is locked for the given scope. Manager / HR / Super Admin may lock or
 * unlock; everyone else can only read the status. A BEFORE trigger on
 * pit_rota / staff_rota refuses any write that targets a locked month.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCasino } from "@/lib/casino-context";
import { useAuth } from "@/lib/auth-context";
import { liveQueryOptions, liveQueryOptionsWithFallback } from "@/lib/live-query-options";
import { toast } from "sonner";

export type RotaScope = "pit" | "floor" | "security" | "office";

const monthFirstDay = (yyyyMm: string) => `${yyyyMm}-01`;

export const useRotaLock = (scope: RotaScope, month: string) => {
  const { activeCasinoId: casinoId } = useCasino();
  return useQuery({
    queryKey: ["rota-lock", casinoId, scope, month],
    queryFn: async () => {
      if (!casinoId) return null;
      const { data, error } = await supabase
        .from("rota_locks" as any)
        .select("*")
        .eq("casino_id", casinoId)
        .eq("scope", scope)
        .eq("month", monthFirstDay(month))
        .maybeSingle();
      if (error) throw error;
      return data as unknown as { casino_id: string; scope: RotaScope; month: string; locked_by: string; locked_at: string } | null;
    },
    enabled: !!casinoId,
    ...liveQueryOptions(),
  });
};

export const useLockRota = () => {
  const qc = useQueryClient();
  const { activeCasinoId: casinoId } = useCasino();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ scope, month }: { scope: RotaScope; month: string }) => {
      if (!casinoId || !user) throw new Error("Not authenticated");
      const { error } = await supabase.from("rota_locks" as any).insert({
        casino_id: casinoId,
        scope,
        month: monthFirstDay(month),
        locked_by: user.id,
      });
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["rota-lock", casinoId, v.scope, v.month] });
      toast.success("Rota locked");
    },
    onError: (e: any) => toast.error(e?.message || "Failed to lock rota"),
  });
};

export const useUnlockRota = () => {
  const qc = useQueryClient();
  const { activeCasinoId: casinoId } = useCasino();
  return useMutation({
    mutationFn: async ({ scope, month }: { scope: RotaScope; month: string }) => {
      if (!casinoId) throw new Error("No casino");
      const { error } = await supabase
        .from("rota_locks" as any)
        .delete()
        .eq("casino_id", casinoId)
        .eq("scope", scope)
        .eq("month", monthFirstDay(month));
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["rota-lock", casinoId, v.scope, v.month] });
      toast.success("Rota unlocked");
    },
    onError: (e: any) => toast.error(e?.message || "Failed to unlock rota"),
  });
};

/** Returns map(employee_id → { department, position, dealer_category, is_pit_boss }) on a given date. */
export const useRolesAtDate = (onDate: string) => {
  const { activeCasinoId: casinoId } = useCasino();
  return useQuery({
    queryKey: ["roles-at-date", casinoId, onDate],
    queryFn: async () => {
      if (!casinoId) return new Map<string, { department: string; position: string; dealer_category: string | null; is_pit_boss: boolean }>();
      const { data, error } = await supabase.rpc("employee_roles_at" as any, {
        _casino_id: casinoId,
        _on_date: onDate,
      });
      if (error) throw error;
      const m = new Map<string, { department: string; position: string; dealer_category: string | null; is_pit_boss: boolean }>();
      (data as any[] || []).forEach((r) => {
        m.set(r.employee_id, {
          department: r.department,
          position: r.job_position,
          dealer_category: r.dealer_category,
          is_pit_boss: !!r.is_pit_boss,
        });
      });
      return m;
    },
    enabled: !!casinoId,
    staleTime: 60_000,
    select: (d: any) => {
      if (d instanceof Map) return d;
      const m = new Map<string, { department: string; position: string; dealer_category: string | null; is_pit_boss: boolean }>();
      for (const [k, v] of Object.entries(d ?? {})) m.set(k, v as any);
      return m;
    },
  });
};
