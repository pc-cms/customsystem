/**
 * RoleDefaultsEditor — super-admin tool to edit `role_module_defaults`.
 *
 * Pick a role, see/edit its baseline (View/Write/Day depth) per module.
 * Applies to ALL users with that role immediately. Includes bulk presets.
 */
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { MODULES } from "@/lib/modules";
import { ALL_ROLES, ROLE_LABELS } from "./users/users-hooks";
import {
  useRoleModuleDefaults,
  useSetRoleModuleDefault,
  type DayHorizon,
} from "@/hooks/use-module-permissions";
import {
  PermissionMatrix,
  HORIZON_OPTIONS,
  HORIZON_LABEL,
  type RowState,
} from "./PermissionMatrix";
import { Save, Eye, Pencil } from "lucide-react";
import { toast } from "sonner";

const FALLBACK: RowState = { can_view: false, can_write: false, day_horizon: "today" };

export const RoleDefaultsEditor = () => {
  const [role, setRole] = useState<string>("manager");
  const { data: rows, isLoading } = useRoleModuleDefaults(role);
  const setOne = useSetRoleModuleDefault();

  const initial = useMemo(() => {
    const m = new Map<string, RowState>();
    MODULES.forEach(mod => m.set(mod.key, { ...FALLBACK }));
    (rows ?? []).forEach(r => {
      m.set(r.module_key, {
        can_view: r.can_view, can_write: r.can_write, day_horizon: r.day_horizon,
      });
    });
    return m;
  }, [rows]);

  const [drafts, setDrafts] = useState<Map<string, RowState>>(new Map());
  useEffect(() => { setDrafts(new Map(initial)); }, [initial]);

  const getRow = (k: string): RowState => drafts.get(k) ?? FALLBACK;
  const isDirty = (k: string): boolean => {
    const d = drafts.get(k); const b = initial.get(k) ?? FALLBACK;
    if (!d) return false;
    return d.can_view !== b.can_view || d.can_write !== b.can_write || d.day_horizon !== b.day_horizon;
  };

  const onChange = (k: string, patch: Partial<RowState>) => {
    setDrafts(prev => {
      const next = new Map(prev);
      const cur = next.get(k) ?? FALLBACK;
      next.set(k, { ...cur, ...patch });
      return next;
    });
  };

  const dirtyCount = useMemo(() => {
    let n = 0; drafts.forEach((_, k) => { if (isDirty(k)) n++; }); return n;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drafts, initial]);

  const bulkHorizon = (h: DayHorizon) => {
    setDrafts(prev => {
      const next = new Map<string, RowState>();
      MODULES.forEach(m => {
        const cur = prev.get(m.key) ?? FALLBACK;
        next.set(m.key, { ...cur, day_horizon: h });
      });
      return next;
    });
  };
  const bulkWrite = (canWrite: boolean) => {
    setDrafts(prev => {
      const next = new Map<string, RowState>();
      MODULES.forEach(m => {
        const cur = prev.get(m.key) ?? FALLBACK;
        next.set(m.key, { ...cur, can_write: cur.can_view ? canWrite : false });
      });
      return next;
    });
  };

  const handleSave = async () => {
    const ops: Promise<unknown>[] = [];
    drafts.forEach((d, module_key) => {
      if (!isDirty(module_key)) return;
      ops.push(setOne.mutateAsync({
        role,
        module_key,
        can_view: d.can_view,
        can_write: d.can_write,
        day_horizon: d.day_horizon,
      }));
    });
    if (ops.length === 0) { toast.info("Nothing to save"); return; }
    await Promise.all(ops);
    toast.success(`Saved ${ops.length} change(s) for ${ROLE_LABELS[role] || role}`);
  };

  const toolbar = (
    <div className="flex flex-wrap items-center gap-2 p-2 rounded-md border border-border bg-muted/20">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Bulk:</span>
      <span className="text-[10px] text-muted-foreground">Day depth →</span>
      {HORIZON_OPTIONS.map(h => (
        <Button key={h} variant="outline" size="sm" className="h-6 px-2 text-[11px]" onClick={() => bulkHorizon(h)}>
          {HORIZON_LABEL[h]}
        </Button>
      ))}
      <span className="mx-1 h-4 w-px bg-border" />
      <Button variant="outline" size="sm" className="h-6 px-2 text-[11px] gap-1" onClick={() => bulkWrite(false)}>
        <Eye className="w-3 h-3" /> View only
      </Button>
      <Button variant="outline" size="sm" className="h-6 px-2 text-[11px] gap-1" onClick={() => bulkWrite(true)}>
        <Pencil className="w-3 h-3" /> View + Write
      </Button>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-card-foreground">Role Defaults</h3>
          <p className="text-xs text-muted-foreground">
            Edit baseline View / Write / Day depth per role. Applies to every user holding the role.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={role} onValueChange={setRole}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              {ALL_ROLES.map(r => (
                <SelectItem key={r} value={r}>{ROLE_LABELS[r] || r}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Badge variant="outline" className="text-[10px]">{dirtyCount} pending</Badge>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <PermissionMatrix
          getRow={getRow}
          isOverridden={isDirty}
          onChange={onChange}
          toolbar={toolbar}
        />
      )}

      <div className="rounded-md border border-border bg-muted/30 p-2 text-xs text-muted-foreground">
        Note: Financial visibility (player drop, cashout, lifetime totals) remains hard-coded per role for safety —
        granting <span className="font-semibold">View</span> on a finance module here does not unlock player financial fields.
      </div>

      <div className="flex justify-end gap-2 pt-2 border-t border-border">
        <Button onClick={handleSave} disabled={setOne.isPending || dirtyCount === 0}>
          <Save className="w-4 h-4 mr-1" /> Save {dirtyCount > 0 ? `(${dirtyCount})` : ""}
        </Button>
      </div>
    </div>
  );
};
