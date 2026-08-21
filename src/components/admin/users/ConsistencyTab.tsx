/**
 * ConsistencyTab — shows per-role divergence matrix.
 *
 * Compares each user's effective module permissions against the role baseline
 * and highlights users whose overrides differ. Allows super-admins to align
 * selected users (or a whole module) back to the role default.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  DataTable,
  DTHead,
  DTBody,
  DTRow,
  DTHeader,
  DTCell,
} from "@/components/ui/data-table";
import { RotateCcw, Users } from "lucide-react";
import { toast } from "sonner";
import {
  ALL_ROLES,
  ROLE_LABELS,
  useAdminUsers,
} from "./users-hooks";
import {
  useRoleModuleDefaults,
  useSetUserModuleOverrides,
  type OverrideRow,
} from "@/hooks/use-module-permissions";
import { HORIZON_LABEL } from "@/components/admin/PermissionMatrix";
import { MODULES } from "@/lib/modules";
import type { AdminUserRow } from "./users-hooks";

export const ConsistencyTab = () => {
  const { roles } = useAuth();
  const isSuperAdmin = roles.includes("super_admin");
  const [selectedRole, setSelectedRole] = useState<string>("manager");
  const [onlyDiffs, setOnlyDiffs] = useState(true);
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());

  const { data: users = [] } = useAdminUsers();
  const { data: roleDefaults } = useRoleModuleDefaults(selectedRole);
  const setOverrides = useSetUserModuleOverrides();

  const roleUsers = useMemo(() => {
    return users.filter((u) => u.roles.includes(selectedRole));
  }, [users, selectedRole]);

  const userIds = useMemo(() => roleUsers.map((u) => u.user_id), [roleUsers]);
  const { data: overridesByUser } = useAllUserOverrides(userIds);

  const baselineMap = useMemo(() => {
    const m = new Map<string, { can_view: boolean; can_write: boolean; day_horizon: string }>();
    (roleDefaults ?? []).forEach((r) => m.set(r.module_key, r));
    return m;
  }, [roleDefaults]);

  const rows = useMemo(() => {
    return MODULES.map((m) => {
      const baseline = baselineMap.get(m.key) ?? { can_view: false, can_write: false, day_horizon: "today" };
      const diffs: { user: AdminUserRow; overrides: OverrideRow[] }[] = [];
      roleUsers.forEach((u) => {
        const ovs = overridesByUser?.get(u.user_id) ?? [];
        const ov = ovs.find((o) => o.module_key === m.key);
        const effective = {
          can_view: ov?.can_view ?? baseline.can_view,
          can_write: ov?.can_write ?? baseline.can_write,
          day_horizon: ov?.day_horizon ?? baseline.day_horizon,
        };
        const isDiff =
          effective.can_view !== baseline.can_view ||
          effective.can_write !== baseline.can_write ||
          effective.day_horizon !== baseline.day_horizon;
        if (isDiff) diffs.push({ user: u, overrides: ovs });
      });
      return { module: m, baseline, diffs, hasDiff: diffs.length > 0 };
    });
  }, [MODULES, baselineMap, roleUsers, overridesByUser]);

  const visibleRows = useMemo(() => {
    return onlyDiffs ? rows.filter((r) => r.hasDiff) : rows;
  }, [rows, onlyDiffs]);

  const totalDiffs = useMemo(() => rows.filter((r) => r.hasDiff).length, [rows]);
  const totalUsersWithDiffs = useMemo(() => {
    const s = new Set<string>();
    rows.forEach((r) => r.diffs.forEach((d) => s.add(d.user.user_id)));
    return s.size;
  }, [rows]);

  const toggleUser = (userId: string, checked: boolean) => {
    setSelectedUsers((prev) => {
      const next = new Set(prev);
      if (checked) next.add(userId);
      else next.delete(userId);
      return next;
    });
  };

  const alignUserToRole = async (userId: string) => {
    // Empty rows = delete all overrides for this user
    await setOverrides.mutateAsync({ userId, rows: [] });
  };

  const alignSelectedUsers = async () => {
    const promises: Promise<unknown>[] = [];
    selectedUsers.forEach((uid) => promises.push(alignUserToRole(uid)));
    await Promise.all(promises);
    toast.success(`Aligned ${selectedUsers.size} user(s) to role defaults`);
    setSelectedUsers(new Set());
  };

  const alignModuleForAll = async (moduleKey: string) => {
    const usersWithDiff = visibleRows.find((r) => r.module.key === moduleKey)?.diffs.map((d) => d.user.user_id) ?? [];
    if (usersWithDiff.length === 0) return;
    const promises = usersWithDiff.map(async (uid) => {
      const ovs = overridesByUser?.get(uid) ?? [];
      const filtered = ovs.filter((o) => o.module_key !== moduleKey);
      const rows: OverrideRow[] = filtered.map((o) => ({
        module_key: o.module_key,
        can_view: o.can_view ?? null,
        can_write: o.can_write ?? null,
        day_horizon: o.day_horizon ?? null,
      }));
      await setOverrides.mutateAsync({ userId: uid, rows });
    });
    await Promise.all(promises);
    toast.success(`Aligned module for ${usersWithDiff.length} user(s)`);
  };

  const formatRow = (baseline: { can_view: boolean; can_write: boolean; day_horizon: string }) => {
    if (!baseline.can_view) return <span className="text-muted-foreground/50">no access</span>;
    return (
      <span className="text-muted-foreground">
        {baseline.can_write ? "View+Write" : "View"} · {HORIZON_LABEL[baseline.day_horizon as any]}
      </span>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-card-foreground">Role Consistency Matrix</h3>
          <p className="text-xs text-muted-foreground">
            Highlights users whose personal overrides differ from the role baseline.
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Select value={selectedRole} onValueChange={setSelectedRole}>
            <SelectTrigger className="w-44 h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ALL_ROLES.map((r) => (
                <SelectItem key={r} value={r}>{ROLE_LABELS[r] || r}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2 border rounded-md px-3 py-1.5 h-9">
            <Switch id="only-diffs" checked={onlyDiffs} onCheckedChange={setOnlyDiffs} />
            <Label htmlFor="only-diffs" className="text-xs cursor-pointer">Only differences</Label>
          </div>
          {isSuperAdmin && selectedUsers.size > 0 && (
            <Button size="sm" variant="outline" onClick={alignSelectedUsers} disabled={setOverrides.isPending}>
              <RotateCcw className="w-3.5 h-3.5 mr-1" /> Align {selectedUsers.size}
            </Button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Users className="w-3.5 h-3.5" />
        {roleUsers.length} {ROLE_LABELS[selectedRole] || selectedRole} users
        {totalUsersWithDiffs > 0 && (
          <Badge variant="secondary" className="text-[10px]">{totalUsersWithDiffs} with overrides</Badge>
        )}
        {totalDiffs > 0 && (
          <Badge variant="outline" className="text-[10px]">{totalDiffs} modules affected</Badge>
        )}
      </div>

      <DataTable>
        <DTHead>
          <DTRow>
            <DTHeader className="w-[240px]">Module</DTHeader>
            <DTHeader className="w-[160px]">Role default</DTHeader>
            {roleUsers.map((u) => (
              <DTHeader key={u.user_id} className="text-center min-w-[120px]">
                <div className="flex items-center justify-center gap-1">
                  {isSuperAdmin && (
                    <Checkbox
                      checked={selectedUsers.has(u.user_id)}
                      onCheckedChange={(c) => toggleUser(u.user_id, c === true)}
                      aria-label={`Select ${u.display_name || u.login}`}
                    />
                  )}
                  <span className="truncate max-w-[100px]" title={u.display_name || u.login}>
                    {u.display_name || u.login}
                  </span>
                </div>
              </DTHeader>
            ))}
            <DTHeader className="w-[100px]"></DTHeader>
          </DTRow>
        </DTHead>
        <DTBody>
          {visibleRows.map((r) => (
            <DTRow key={r.module.key}>
              <DTCell className="text-sm">{r.module.label}</DTCell>
              <DTCell className="text-[11px]">{formatRow(r.baseline)}</DTCell>
              {roleUsers.map((u) => {
                const ov = overridesByUser?.get(u.user_id)?.find((o) => o.module_key === r.module.key);
                const effective = {
                  can_view: ov?.can_view ?? r.baseline.can_view,
                  can_write: ov?.can_write ?? r.baseline.can_write,
                  day_horizon: ov?.day_horizon ?? r.baseline.day_horizon,
                };
                const isDiff =
                  effective.can_view !== r.baseline.can_view ||
                  effective.can_write !== r.baseline.can_write ||
                  effective.day_horizon !== r.baseline.day_horizon;
                return (
                  <DTCell key={u.user_id} className="text-center">
                    {isDiff ? (
                      <div className="flex flex-col items-center gap-0.5">
                        <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4">
                          {effective.can_view ? (effective.can_write ? "V+W" : "View") : "None"}
                        </Badge>
                        <span className="text-[9px] text-muted-foreground">{HORIZON_LABEL[effective.day_horizon as any]}</span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground/40">·</span>
                    )}
                  </DTCell>
                );
              })}
              <DTCell align="right">
                {isSuperAdmin && r.hasDiff && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-[11px]"
                    onClick={() => alignModuleForAll(r.module.key)}
                    disabled={setOverrides.isPending}
                  >
                    <RotateCcw className="w-3 h-3 mr-1" /> Align
                  </Button>
                )}
              </DTCell>
            </DTRow>
          ))}
          {visibleRows.length === 0 && (
            <DTRow>
              <DTCell colSpan={roleUsers.length + 3} className="text-center py-10 text-sm text-muted-foreground">
                {onlyDiffs
                  ? "All selected users match the role baseline"
                  : "No modules to display"}
              </DTCell>
            </DTRow>
          )}
        </DTBody>
      </DataTable>

      {!isSuperAdmin && (
        <div className="rounded-md border border-border bg-muted/30 p-2 text-xs text-muted-foreground">
          Only Super Admin can align users to role defaults. Contact a Super Admin to remove overrides.
        </div>
      )}
    </div>
  );
};

const useAllUserOverrides = (userIds: string[]) => {
  return useQuery({
    queryKey: ["user-module-overrides-bulk", userIds.slice().sort().join(",")],
    queryFn: async (): Promise<Map<string, OverrideRow[]>> => {
      if (userIds.length === 0) return new Map();
      const { data, error } = await supabase
        .from("user_module_permissions")
        .select("user_id, module_key, can_view, can_write, day_horizon")
        .in("user_id", userIds);
      if (error) throw error;
      const map = new Map<string, OverrideRow[]>();
      (data || []).forEach((row: any) => {
        const list = map.get(row.user_id) || [];
        list.push({
          module_key: row.module_key,
          can_view: row.can_view,
          can_write: row.can_write,
          day_horizon: row.day_horizon,
        });
        map.set(row.user_id, list);
      });
      return map;
    },
    enabled: userIds.length > 0,
  });
};
