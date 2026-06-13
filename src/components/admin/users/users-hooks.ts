/**
 * Hooks for the Users & Roles admin tab.
 *
 * Why these live in their own file:
 *   The Admin page used to be a 1000-line file with role-specific UI (super_admin
 *   vs manager) tangled inside the same JSX. Editing a "manager view" feature
 *   would unintentionally affect "super_admin view" because both branches shared
 *   the same component tree. Splitting per-feature data hooks + UI keeps each
 *   role's view physically separate.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useCasino } from "@/lib/casino-context";
import { toast } from "sonner";

export const ALL_ROLES = [
  "super_admin",
  "manager",
  "shift_manager",
  "cashier",
  "cashier_slots",
  "pit",
  "reception",
  "finance_manager",
  "surveillance",
  "hr",
  "account_manager",
  "pos_manager",
  "pos_bartender",
  "pos_waiter",
] as const;

export const NON_SUPER_ROLES = ALL_ROLES.filter(r => r !== "super_admin") as readonly string[];

export const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  manager: "Manager",
  shift_manager: "Shift Manager",
  cashier: "Cashier Live",
  cashier_slots: "Cashier Slots",
  pit: "Pit Boss",
  reception: "Reception",
  finance_manager: "Finance",
  surveillance: "Surveillance",
  hr: "HR",
  account_manager: "Account Manager",
  pos_manager: "Bar Manager",
  pos_bartender: "Bartender",
  pos_waiter: "Waiter",
};

export type Profile = {
  user_id: string;
  display_name: string | null;
  casino_id: string | null;
  disabled_at?: string | null;
  created_at?: string;
  /** Aggregated casino IDs the user can access (primary + user_casino_access). */
  casino_ids: string[];
};

export type AdminUserRow = {
  user_id: string;
  email: string;
  login: string;
  display_name: string | null;
  casino_id: string | null;
  casino_ids: string[];
  disabled_at: string | null;
  created_at?: string;
  roles: string[];
};

/** Single batched call: returns enriched user list with login (email) + roles. */
export const useAdminUsers = () =>
  useQuery({
    queryKey: ["admin-users:list-v2"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("admin-list-users", { body: {} });
      if (error) throw new Error(await readFunctionError(error));
      if (data?.error) throw new Error(data.error);
      return (data?.rows ?? []) as AdminUserRow[];
    },
  });

/** Update display_name and/or login (email) of any user (scoped). */
export const useUpdateUserProfile = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { userId: string; display_name?: string; login?: string }) => {
      const { data, error } = await supabase.functions.invoke("admin-update-user", {
        body: {
          user_id: input.userId,
          display_name: input.display_name,
          login: input.login,
        },
      });
      if (error) throw new Error(await readFunctionError(error));
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-users:list-v2"] });
      qc.invalidateQueries({ queryKey: ["admin-users:profiles"] });
      toast.success("User updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};


const readFunctionError = async (error: Error) => {
  let detail = error.message;
  try {
    const ctx = (error as any).context;
    const response = typeof ctx?.clone === "function" ? ctx.clone() : ctx;
    if (response && typeof response.json === "function") {
      const parsed = await response.json();
      if (parsed?.error) detail = parsed.error;
    }
  } catch { /* ignore */ }
  return detail;
};

/**
 * Profiles visible on the current surface.
 *
 * Per-domain rule (matches global "single casino per subdomain" policy):
 *   - On premier subdomain (isSummaryMode) — every super_admin/FM/surveillance
 *     sees ALL profiles across the network.
 *   - On any casino subdomain (Arusha/Mwanza/...) — even super_admin sees ONLY
 *     users that belong to this casino, either as `profiles.casino_id`
 *     (primary) OR via a row in `user_casino_access`. This collapses the
 *     "CCTV with 4 casinos" case into a single row that appears on each
 *     relevant casino subdomain.
 */
export const useUsersProfiles = () => {
  const { activeCasinoId, isSummaryMode } = useCasino();

  return useQuery({
    queryKey: ["admin-users:profiles", isSummaryMode ? "summary" : activeCasinoId],
    queryFn: async () => {
      // 1. Fetch profiles. RLS already restricts non-privileged viewers; we
      //    only narrow by primary casino when on a casino subdomain to keep
      //    the response small. Multi-casino users (primary != activeCasino)
      //    are picked up via the user_casino_access join below.
      const { data: profiles, error: pErr } = await supabase
        .from("profiles")
        .select("user_id, display_name, casino_id, disabled_at, created_at")
        .order("display_name");
      if (pErr) throw pErr;

      // 2. Fetch all access grants for the same set of users (single round-trip).
      const userIds = (profiles || []).map((p: any) => p.user_id);
      let accessByUser = new Map<string, string[]>();
      if (userIds.length > 0) {
        const { data: access, error: aErr } = await supabase
          .from("user_casino_access")
          .select("user_id, casino_id")
          .in("user_id", userIds);
        if (aErr) throw aErr;
        (access || []).forEach((row: any) => {
          const list = accessByUser.get(row.user_id) || [];
          list.push(row.casino_id);
          accessByUser.set(row.user_id, list);
        });
      }

      // 3. Build the unified Profile[]: one row per user, with casino_ids
      //    union(primary, access).
      const rows: Profile[] = (profiles || []).map((p: any) => {
        const ids = new Set<string>();
        if (p.casino_id) ids.add(p.casino_id);
        (accessByUser.get(p.user_id) || []).forEach(id => ids.add(id));
        return { ...p, casino_ids: Array.from(ids) } as Profile;
      });

      // 4. Per-domain scoping: keep only users that touch this casino.
      if (!isSummaryMode && activeCasinoId) {
        return rows.filter(r =>
          r.casino_id === activeCasinoId || r.casino_ids.includes(activeCasinoId)
        );
      }
      return rows;
    },
    enabled: isSummaryMode || !!activeCasinoId,
  });
};

/**
 * Fetches all (user_id, role) rows in ONE query, scoped by RLS.
 * Replaces the old N×R rpc('has_role') loop.
 */
export const useUsersRoles = (userIds: string[]) => {
  return useQuery({
    queryKey: ["admin-users:roles", userIds.slice().sort().join(",")],
    queryFn: async () => {
      if (userIds.length === 0) return {} as Record<string, string[]>;
      const { data, error } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("user_id", userIds);
      if (error) throw error;
      const map: Record<string, string[]> = {};
      (data || []).forEach(r => {
        const uid = (r as any).user_id as string;
        const role = (r as any).role as string;
        if (!map[uid]) map[uid] = [];
        map[uid].push(role);
      });
      return map;
    },
    enabled: userIds.length > 0,
  });
};

export const useAllCasinos = () =>
  useQuery({
    queryKey: ["admin-users:casinos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("casinos").select("id, name").order("name");
      if (error) throw error;
      return data || [];
    },
  });

/** Atomic role-set update via SECURITY DEFINER RPC (manager scoped to own casino). */
export const useUpdateUserRoles = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, roles }: { userId: string; roles: string[] }) => {
      const { error } = await supabase.rpc("update_user_roles", {
        _user_id: userId,
        _roles: roles as any,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-users:roles"] });
      toast.success("Roles updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

/** Create a brand-new user via the create-user edge function. */
export const useCreateUser = () => {
  const qc = useQueryClient();
  const { roles } = useAuth();
  const isSuperAdmin = roles.includes("super_admin");
  return useMutation({
    mutationFn: async (input: {
      login: string;
      password: string;
      display_name: string;
      roles: string[];
      casino_id?: string;
    }) => {
      const body: any = {
        login: input.login,
        password: input.password,
        display_name: input.display_name,
        roles: input.roles,
      };
      if (isSuperAdmin && input.casino_id) body.casino_id = input.casino_id;
      const { data, error } = await supabase.functions.invoke("create-user", { body });
      if (error) {
        throw new Error(await readFunctionError(error));
      }
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["admin-users:profiles"] });
      qc.invalidateQueries({ queryKey: ["admin-users:roles"] });
      toast.success(`User "${vars.login}" created`);
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

/** Reset another user's password (manager scoped to own casino). */
export const useResetPassword = () => {
  return useMutation({
    mutationFn: async ({ userId, newPassword }: { userId: string; newPassword: string }) => {
      const { data, error } = await supabase.functions.invoke("reset-user-password", {
        body: { user_id: userId, new_password: newPassword },
      });
      if (error) throw new Error(await readFunctionError(error));
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => toast.success("Password reset"),
    onError: (e: Error) => toast.error(e.message),
  });
};

/** Disable a user login while keeping historical audit records intact. */
export const useDisableUser = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId }: { userId: string }) => {
      const { data, error } = await supabase.functions.invoke("disable-user", {
        body: { user_id: userId },
      });
      if (error) throw new Error(await readFunctionError(error));
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-users:profiles"] });
      toast.success("User disabled");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};
