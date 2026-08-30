import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useCasino } from "@/lib/casino-context";

/**
 * Weekly Bonus — Sun..Sat, manager-driven distribution of a cash pool
 * across Live Game staff (dealers + pit bosses) based on:
 *   points = hours + extra + bonus_points
 * Anyone with at least one Absent (A or hours-then-A) → excluded (0).
 */

export const getWeekStartSunday = (d: Date): string => {
  const day = d.getDay(); // 0 = Sunday
  const sun = new Date(d.getFullYear(), d.getMonth(), d.getDate() - day);
  return `${sun.getFullYear()}-${String(sun.getMonth() + 1).padStart(2, "0")}-${String(sun.getDate()).padStart(2, "0")}`;
};

export const addDaysIso = (iso: string, days: number): string => {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
};

export interface BonusEntry {
  id?: string;
  dealer_id: string;
  week_start: string;
  extra_override: number | null;
  bonus_points: number;
  /** Multiplier applied to (hours + extra + bonus). 1.00 – 2.00, default 1.00 */
  coefficient: number;
}

export interface BonusPool {
  id?: string;
  week_start: string;
  pool_amount: number;
  currency: string;
  is_calculated: boolean;
  calculated_at: string | null;
}

// Phase 3: alias employee_id → dealer_id so consumers (Live-Game-keyed) stay unchanged.
export const useWeeklyBonusEntries = (weekStart: string) => {
  const { activeCasinoId: casinoId } = useCasino();
  return useQuery({
    queryKey: ["weekly-bonus-entries", casinoId, weekStart],
    queryFn: async () => {
      if (!casinoId) return [] as BonusEntry[];
      const { data, error } = await supabase
        .from("weekly_bonus_entries" as any)
        .select("*")
        .eq("casino_id", casinoId)
        .eq("week_start", weekStart);
      if (error) throw error;
      return ((data ?? []) as any[]).map((r) => ({
        ...r,
        dealer_id: r.employee_id,
        coefficient: r.coefficient == null ? 1 : Number(r.coefficient),
      })) as unknown as BonusEntry[];
    },
    enabled: !!casinoId,
  });
};

export const useWeeklyBonusPool = (weekStart: string) => {
  const { activeCasinoId: casinoId } = useCasino();
  return useQuery({
    queryKey: ["weekly-bonus-pool", casinoId, weekStart],
    queryFn: async () => {
      if (!casinoId) return null;
      const { data, error } = await supabase
        .from("weekly_bonus_pools" as any)
        .select("*")
        .eq("casino_id", casinoId)
        .eq("week_start", weekStart)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as unknown as BonusPool | null;
    },
    enabled: !!casinoId,
  });
};

export const useUpsertBonusEntry = () => {
  const qc = useQueryClient();
  const { activeCasinoId: casinoId } = useCasino();
  return useMutation({
    mutationFn: async (input: { dealer_id: string; week_start: string; extra_override?: number | null; bonus_points?: number; coefficient?: number }) => {
      if (!casinoId) throw new Error("No casino");
      const { error } = await supabase
        .from("weekly_bonus_entries" as any)
        .upsert(
          {
            casino_id: casinoId,
            employee_id: input.dealer_id,
            week_start: input.week_start,
            extra_override: input.extra_override ?? null,
            bonus_points: input.bonus_points ?? 0,
            coefficient: input.coefficient ?? 1,
          } as any,
          { onConflict: "casino_id,employee_id,week_start" },
        );
      if (error) throw error;
    },
    // Optimistic: PTS column updates instantly without waiting for refetch.
    onMutate: async (input) => {
      const key = ["weekly-bonus-entries", casinoId, input.week_start];
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<BonusEntry[]>(key);
      const list = prev ? [...prev] : [];
      const idx = list.findIndex((e) => e.dealer_id === input.dealer_id);
      const patched: BonusEntry = {
        dealer_id: input.dealer_id,
        week_start: input.week_start,
        extra_override: input.extra_override ?? null,
        bonus_points: input.bonus_points ?? 0,
        coefficient: input.coefficient ?? 1,
      };
      if (idx >= 0) list[idx] = { ...list[idx], ...patched };
      else list.push(patched);
      qc.setQueryData(key, list);
      return { prev, key };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev !== undefined) qc.setQueryData(ctx.key, ctx.prev);
    },
    onSettled: (_d, _e, vars) => {
      qc.invalidateQueries({ queryKey: ["weekly-bonus-entries", casinoId, vars.week_start] });
    },
  });
};

export const useUpsertBonusPool = () => {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { activeCasinoId: casinoId } = useCasino();
  return useMutation({
    mutationFn: async (input: { week_start: string; pool_amount: number; currency?: string; calculate: boolean }) => {
      if (!casinoId) throw new Error("No casino");
      const { error } = await supabase
        .from("weekly_bonus_pools" as any)
        .upsert(
          {
            casino_id: casinoId,
            week_start: input.week_start,
            pool_amount: input.pool_amount,
            currency: input.currency ?? "TZS",
            is_calculated: input.calculate,
            calculated_at: input.calculate ? new Date().toISOString() : null,
            calculated_by: input.calculate ? user?.id ?? null : null,
          },
          { onConflict: "casino_id,week_start" },
        );
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["weekly-bonus-pool", casinoId, vars.week_start] });
    },
  });
};
