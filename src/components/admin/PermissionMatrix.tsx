/**
 * PermissionMatrix — shared grid used by both:
 *   - UserPermissionsDialog (per-user overrides on top of role baseline)
 *   - RoleDefaultsEditor (role baseline itself)
 *
 * Layout: left sticky nav (group anchors + search) + right matrix
 * grouped by module category. Same visual language as the app sidebar.
 */
import { useMemo, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { MODULES, MODULE_GROUPS } from "@/lib/modules";
import { RotateCcw, Search } from "lucide-react";
import type { DayHorizon } from "@/hooks/use-module-permissions";

export const HORIZON_OPTIONS: DayHorizon[] = ["today", "7d", "30d", "all"];
export const HORIZON_LABEL: Record<DayHorizon, string> = {
  today: "Today only",
  "7d": "7 days",
  "30d": "30 days",
  all: "All time",
};

export interface RowState {
  can_view: boolean;
  can_write: boolean;
  day_horizon: DayHorizon;
}

export interface RowBaseline {
  can_view: boolean;
  can_write: boolean;
  day_horizon: DayHorizon;
}

export interface PermissionMatrixProps {
  getRow: (moduleKey: string) => RowState;
  getBaseline?: (moduleKey: string) => RowBaseline | null;
  isOverridden?: (moduleKey: string) => boolean;
  onChange: (moduleKey: string, patch: Partial<RowState>) => void;
  onReset?: (moduleKey: string) => void;
  toolbar?: React.ReactNode;
}

const formatBaseline = (b: RowBaseline | null): React.ReactNode => {
  if (!b) return <span className="text-muted-foreground/50">no access</span>;
  if (!b.can_view) return <span className="text-muted-foreground/50">no access</span>;
  return (
    <span className="text-muted-foreground">
      {b.can_write ? "View+Write" : "View"} · {HORIZON_LABEL[b.day_horizon]}
    </span>
  );
};

const anchorId = (g: string) => `pm-group-${g.replace(/\s+/g, "-").toLowerCase()}`;

export const PermissionMatrix = ({
  getRow,
  getBaseline,
  isOverridden,
  onChange,
  onReset,
  toolbar,
}: PermissionMatrixProps) => {
  const [search, setSearch] = useState("");
  const q = search.trim().toLowerCase();

  const grouped = useMemo(() => MODULE_GROUPS.map(g => ({
    group: g,
    items: MODULES
      .filter(m => m.group === g)
      .filter(m => !q || m.label.toLowerCase().includes(q) || m.key.toLowerCase().includes(q)),
  })).filter(g => g.items.length > 0), [q]);

  const groupCounts = useMemo(() => {
    const map = new Map<string, number>();
    MODULE_GROUPS.forEach(g => {
      map.set(g, MODULES.filter(m => m.group === g).length);
    });
    return map;
  }, []);

  const showBaseline = !!getBaseline;
  const showReset = !!onReset;
  const tplCols = [
    "minmax(0,1fr)",
    showBaseline ? "minmax(140px,180px)" : null,
    "56px",
    "56px",
    "120px",
    showReset ? "44px" : null,
  ].filter(Boolean).join(" ");

  const scrollTo = (g: string) => {
    const el = document.getElementById(anchorId(g));
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="space-y-3">
      {toolbar}
      <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] gap-4">
        {/* LEFT: group nav + search */}
        <aside className="md:sticky md:top-2 md:self-start space-y-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2 top-2.5 text-muted-foreground" />
            <Input
              placeholder="Search module..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="h-8 pl-7 text-xs"
            />
          </div>
          <nav className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible">
            {MODULE_GROUPS.map(g => (
              <button
                key={g}
                type="button"
                onClick={() => scrollTo(g)}
                className="text-left text-xs px-2 py-1.5 rounded hover:bg-muted flex items-center justify-between gap-2 whitespace-nowrap"
              >
                <span>{g}</span>
                <span className="text-[10px] text-muted-foreground">{groupCounts.get(g)}</span>
              </button>
            ))}
          </nav>
        </aside>

        {/* RIGHT: matrix */}
        <div className="min-w-0">
          <div
            className="border-b border-border pb-2 hidden md:grid gap-2 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold sticky top-0 bg-background z-10"
            style={{ gridTemplateColumns: tplCols }}
          >
            <span>Module</span>
            {showBaseline && <span>Role default</span>}
            <span className="text-center">View</span>
            <span className="text-center">Write</span>
            <span className="text-center">Day depth</span>
            {showReset && <span className="text-center">Reset</span>}
          </div>

          <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1 pt-2">
            {grouped.length === 0 && (
              <p className="text-xs text-muted-foreground py-4 text-center">No modules match "{search}"</p>
            )}
            {grouped.map(({ group, items }) => (
              <div key={group} id={anchorId(group)}>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1 sticky top-8 bg-background py-1">{group}</p>
                <div className="space-y-0.5">
                  {items.map(m => {
                    const row = getRow(m.key);
                    const base = getBaseline ? getBaseline(m.key) : null;
                    const overridden = isOverridden ? isOverridden(m.key) : false;
                    return (
                      <div
                        key={m.key}
                        className="grid items-center gap-2 px-1 py-1 rounded hover:bg-muted/30"
                        style={{ gridTemplateColumns: tplCols }}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-sm truncate">{m.label}</span>
                          {overridden && (
                            <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4">override</Badge>
                          )}
                        </div>
                        {showBaseline && (
                          <div className="text-[11px] truncate">
                            {formatBaseline(base)}
                          </div>
                        )}
                        <div className="flex justify-center">
                          <Checkbox
                            checked={row.can_view}
                            onCheckedChange={v => onChange(m.key, { can_view: !!v })}
                          />
                        </div>
                        <div className="flex justify-center">
                          <Checkbox
                            checked={row.can_write}
                            disabled={!row.can_view}
                            onCheckedChange={v => onChange(m.key, { can_write: !!v })}
                          />
                        </div>
                        <div className="flex justify-center">
                          <Select
                            value={row.day_horizon}
                            onValueChange={(v: DayHorizon) => onChange(m.key, { day_horizon: v })}
                          >
                            <SelectTrigger className="h-7 text-xs">
                              <SelectValue>{HORIZON_LABEL[row.day_horizon]}</SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              {HORIZON_OPTIONS.map(o => (
                                <SelectItem key={o} value={o} className="text-xs">{HORIZON_LABEL[o]}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        {showReset && (
                          <div className="flex justify-center">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-1"
                              disabled={!overridden}
                              onClick={() => onReset?.(m.key)}
                              title="Reset to role default"
                            >
                              <RotateCcw className="w-3 h-3" />
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
