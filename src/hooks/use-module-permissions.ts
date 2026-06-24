/**
 * Module permissions — backed by `effective_module_perms(user_id)` RPC which
 * merges role baselines (`role_module_defaults`) with per-user overrides
 * (`user_module_permissions.can_view/can_write/day_horizon`).
 *
 * Semantics:
 *   - super_admin sees everything (bypass at hook level).
 *   - If RPC returns rows → those are the effective allow-list.
 *   - If RPC returns nothing (legacy seed missing) → fall back to "no restriction".
 *   - RLS remains the real security boundary; this hook only gates UI.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import type { ModuleKey } from "@/lib/modules";
import { toast } from "sonner";

export type DayHorizon = "today" | "7d" | "30d" | "all";

export interface EffectivePerm {
  module_key: string;
  can_view: boolean;
  can_write: boolean;
  day_horizon: DayHorizon;
}

const fetchEffective = async (userId: string): Promise<EffectivePerm[]> => {
  const { data, error } = await supabase.rpc("effective_module_perms", { p_user_id: userId });
  if (error) throw error;
  return (data ?? []) as EffectivePerm[];
};

/** Full effective permission map for current user. */
export const useMyEffectivePerms = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["my-effective-perms", user?.id],
    queryFn: async () => {
      if (!user?.id) return [] as EffectivePerm[];
      return fetchEffective(user.id);
    },
    enabled: !!user?.id,
    // On older on-prem nodes the RPC may be temporarily missing until schema
    // repair catches up. Don't keep the whole CMS on Loading while retrying a
    // UI-only permission check; RoleGuard falls back to rendering and RLS stays
    // the real security boundary.
    retry: false,
    // Permissions effectively never change mid-session. Cache for the
    // entire session; mutations explicitly invalidate this key.
    staleTime: Infinity,
    gcTime: 1000 * 60 * 60 * 24,
  });
};

/**
 * Returns a Set of allowed module keys (view=true) for the current user.
 * `undefined` while loading; empty Set if the matrix has no rows for this role.
 * The matrix is the single source of truth — there is no implicit role
 * whitelist that grants access without an explicit row.
 */
export const useMyModulePermissions = () => {
  const { data, ...rest } = useMyEffectivePerms();
  const allowed: Set<string> | undefined = data === undefined
    ? undefined
    : new Set(data.filter(r => r.can_view).map(r => r.module_key));
  return { ...rest, data: allowed };
};

/** Single module: can the current user view it? Matrix is the source of truth. */
export const useModuleAccess = (moduleKey: ModuleKey): boolean => {
  const { roles } = useAuth();
  const { data, isLoading } = useMyEffectivePerms();
  if (roles.includes("super_admin")) return true;
  if (isLoading || !data) return true; // avoid flicker while loading
  const row = data.find(r => r.module_key === moduleKey);
  return row ? row.can_view : false;
};

/** Single module: can write? Matrix is the source of truth. */
export const useModuleWrite = (moduleKey: ModuleKey): boolean => {
  const { roles } = useAuth();
  const { data, isLoading } = useMyEffectivePerms();
  if (roles.includes("super_admin")) return true;
  if (isLoading || !data) return false;
  const row = data.find(r => r.module_key === moduleKey);
  return row ? row.can_write : false;
};

/** Single module: day horizon for history filtering. */
export const useModuleHorizon = (moduleKey: ModuleKey): DayHorizon => {
  const { roles } = useAuth();
  const { data, isLoading } = useMyEffectivePerms();
  if (roles.includes("super_admin")) return "all";
  if (isLoading || !data) return "today";
  const row = data.find(r => r.module_key === moduleKey);
  return row?.day_horizon ?? "today";
};

/** Admin: read another user's effective permissions (merged). */
export const useUserEffectivePerms = (userId: string | null) => {
  return useQuery({
    queryKey: ["user-effective-perms", userId],
    queryFn: async () => {
      if (!userId) return [] as EffectivePerm[];
      return fetchEffective(userId);
    },
    enabled: !!userId,
  });
};

/** Admin: read raw per-user override rows (NULL = inherit). */
export interface OverrideRow {
  module_key: string;
  can_view: boolean | null;
  can_write: boolean | null;
  day_horizon: DayHorizon | null;
}

export const useUserModuleOverrides = (userId: string | null) => {
  return useQuery({
    queryKey: ["user-module-overrides", userId],
    queryFn: async (): Promise<OverrideRow[]> => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from("user_module_permissions")
        .select("module_key, can_view, can_write, day_horizon")
        .eq("user_id", userId);
      if (error) throw error;
      return (data ?? []) as OverrideRow[];
    },
    enabled: !!userId,
  });
};

/** Admin: read role baseline rows from `role_module_defaults`. */
export interface RoleDefaultRow {
  module_key: string;
  can_view: boolean;
  can_write: boolean;
  day_horizon: DayHorizon;
}

export const useRoleModuleDefaults = (role: string | null) => {
  return useQuery({
    queryKey: ["role-module-defaults", role],
    queryFn: async (): Promise<RoleDefaultRow[]> => {
      if (!role) return [];
      const { data, error } = await supabase
        .from("role_module_defaults")
        .select("module_key, can_view, can_write, day_horizon")
        .eq("role", role as any);
      if (error) throw error;
      return (data ?? []) as RoleDefaultRow[];
    },
    enabled: !!role,
    staleTime: 1000 * 60 * 60, // 1h — admin screen only
  });
};

/**
 * Admin: upsert one role-default row. Super-admin only (RLS enforced).
 * Pass `null` to delete (revert to global default = no access).
 */
export const useSetRoleModuleDefault = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      role: string;
      module_key: string;
      can_view: boolean;
      can_write: boolean;
      day_horizon: DayHorizon;
    } | { role: string; module_key: string; remove: true }) => {
      if ("remove" in input) {
        const { error } = await supabase
          .from("role_module_defaults")
          .delete()
          .eq("role", input.role as any)
          .eq("module_key", input.module_key);
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from("role_module_defaults").upsert({
        role: input.role as any,
        module_key: input.module_key,
        can_view: input.can_view,
        can_write: input.can_write,
        day_horizon: input.day_horizon,
      } as any, { onConflict: "role,module_key" });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["role-module-defaults", vars.role] });
      qc.invalidateQueries({ queryKey: ["my-effective-perms"] });
      qc.invalidateQueries({ queryKey: ["user-effective-perms"] });
    },
    onError: (e: Error) => toast.error(`Failed: ${e.message}`),
  });
};

/**
 * Admin: write per-user overrides. Pass an array of rows; any row omitted is
 * deleted (= inherit role default). To revert everything, pass [].
 */
export const useSetUserModuleOverrides = () => {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ userId, rows }: { userId: string; rows: OverrideRow[] }) => {
      const { error: delErr } = await supabase
        .from("user_module_permissions")
        .delete()
        .eq("user_id", userId);
      if (delErr) throw delErr;
      if (rows.length === 0) return;
      const insert = rows.map(r => ({
        user_id: userId,
        module_key: r.module_key,
        can_view: r.can_view ?? true,
        can_write: r.can_write,
        day_horizon: r.day_horizon,
        granted_by: user?.id ?? null,
      }));
      const { error: insErr } = await supabase.from("user_module_permissions").insert(insert);
      if (insErr) throw insErr;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["user-module-overrides", vars.userId] });
      qc.invalidateQueries({ queryKey: ["user-effective-perms", vars.userId] });
      qc.invalidateQueries({ queryKey: ["my-effective-perms"] });
      toast.success("Permissions updated");
    },
    onError: (e: Error) => toast.error(`Failed: ${e.message}`),
  });
};
