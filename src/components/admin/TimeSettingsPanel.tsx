/**
 * TimeSettingsPanel — casino working-hours settings.
 * Layout: two-column grid.
 *   Left  = Classic working hours (Tables Open / Shift Start / Shift End / Breaklist Lock / Cage Float).
 *   Right = Shift Matrix (Day/Night/Middle...) + Cage close deadlines.
 *
 * The shift matrix is stored on casinos.shift_matrix (jsonb array) and can be
 * consumed by rota, breaklist and cage-close logic via `applies_to`.
 * Legacy n_shift_start/d_shift_start remain as fallback.
 */
import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useCasino } from "@/lib/casino-context";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Clock, Plus, Trash2 } from "lucide-react";
import { useCasinoInfo, useUpdateCasinoSchedule, useCancelPendingSchedule } from "@/hooks/use-table-lifecycle";
import { Checkbox } from "@/components/ui/checkbox";

type ShiftApplyTarget = "rota" | "breaklist" | "cage";
interface ShiftRow {
  key: string;
  label: string;
  start: string;
  end: string;
  applies_to: ShiftApplyTarget[];
}

const APPLY_TARGETS: { key: ShiftApplyTarget; label: string }[] = [
  { key: "rota", label: "Rota" },
  { key: "breaklist", label: "Breaklist" },
  { key: "cage", label: "Cage" },
];

const DEFAULT_MATRIX: ShiftRow[] = [
  { key: "D", label: "Day",    start: "06:00", end: "18:00", applies_to: ["rota", "breaklist", "cage"] },
  { key: "N", label: "Night",  start: "18:00", end: "05:00", applies_to: ["rota", "breaklist", "cage"] },
  { key: "M", label: "Middle", start: "12:00", end: "00:00", applies_to: ["rota"] },
];

export const TimeSettingsPanel = () => {
  const { data: casino } = useCasinoInfo() as { data: any };
  const { activeCasinoId } = useCasino();
  const qc = useQueryClient();
  const updateSchedule = useUpdateCasinoSchedule();
  const cancelPending = useCancelPendingSchedule();

  const [tablesOpen, setTablesOpen] = useState("");
  const [shiftStart, setShiftStart] = useState("");
  const [shiftEnd, setShiftEnd] = useState("");
  const [breaklistLock, setBreaklistLock] = useState("");
  const [cageFloat, setCageFloat] = useState("");
  const [cageDeadline, setCageDeadline] = useState("");
  const [overrideWindow, setOverrideWindow] = useState("");
  const [matrix, setMatrix] = useState<ShiftRow[]>(DEFAULT_MATRIX);
  const [savingRight, setSavingRight] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!casino || loaded) return;
    setTablesOpen(casino.tables_open || "17:30");
    setShiftStart(casino.shift_start || "18:00");
    setShiftEnd(casino.shift_end || "05:00");
    setBreaklistLock(casino.breaklist_lock || "05:30");
    setCageFloat(String(casino.cage_float || 0));
    setCageDeadline(String(casino.cage_close_deadline_min ?? 30));
    setOverrideWindow(String(casino.manager_override_window_min ?? 15));
    const m = Array.isArray(casino.shift_matrix) && casino.shift_matrix.length > 0
      ? (casino.shift_matrix as ShiftRow[])
      : DEFAULT_MATRIX;
    setMatrix(m.map(r => ({ ...r, applies_to: r.applies_to ?? [] })));
    setLoaded(true);
  }, [casino, loaded]);

  const handleSaveClassic = () => {
    updateSchedule.mutate({
      tables_open: tablesOpen,
      shift_start: shiftStart,
      shift_end: shiftEnd,
      breaklist_lock: breaklistLock,
      cage_float: Number(cageFloat) || 0,
      current_shift_end: casino?.shift_end,
      current_breaklist_lock: casino?.breaklist_lock,
    });
  };

  const handleSaveRight = async () => {
    if (!activeCasinoId) return;
    setSavingRight(true);
    try {
      // Validate matrix
      const keys = new Set<string>();
      for (const r of matrix) {
        if (!r.key.trim()) throw new Error("Shift key is required");
        if (keys.has(r.key)) throw new Error(`Duplicate shift key: ${r.key}`);
        keys.add(r.key);
      }
      const { error } = await supabase
        .from("casinos")
        .update({
          shift_matrix: matrix as any,
          cage_close_deadline_min: Number(cageDeadline) || null,
          manager_override_window_min: Number(overrideWindow) || null,
          // Sync legacy fields from matrix for backward compat with rota/breaklist reads
          d_shift_start: (matrix.find(r => r.key === "D")?.start || null) as any,
          n_shift_start: (matrix.find(r => r.key === "N")?.start || null) as any,
        } as any)
        .eq("id", activeCasinoId);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["casino-info"] });
      toast.success("Shift matrix saved");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSavingRight(false);
    }
  };

  const formatPendingDate = (d?: string | null) => {
    if (!d) return "";
    const [y, m, day] = d.split("-");
    return `${day}.${m}.${y}`;
  };

  const updateShift = (idx: number, patch: Partial<ShiftRow>) => {
    setMatrix(prev => prev.map((r, i) => i === idx ? { ...r, ...patch } : r));
  };
  const toggleApply = (idx: number, target: ShiftApplyTarget) => {
    setMatrix(prev => prev.map((r, i) => {
      if (i !== idx) return r;
      const has = r.applies_to.includes(target);
      return { ...r, applies_to: has ? r.applies_to.filter(t => t !== target) : [...r.applies_to, target] };
    }));
  };
  const addShift = () => {
    setMatrix(prev => [...prev, { key: "S" + (prev.length + 1), label: "Shift", start: "09:00", end: "17:00", applies_to: ["rota"] }]);
  };
  const removeShift = (idx: number) => {
    setMatrix(prev => prev.filter((_, i) => i !== idx));
  };

  type Field = { label: string; value: string; set: (v: string) => void; hint: string;
    pending?: { value?: string | null; from?: string | null; field: "shift_end" | "breaklist_lock" } };

  const classicFields: Field[] = [
    { label: "Tables Open (Cage/Pit)", value: tablesOpen, set: setTablesOpen, hint: "When cashiers/pit can open tables" },
    { label: "Shift Start (Dealers)", value: shiftStart, set: setShiftStart, hint: "When dealer breaklist starts" },
    { label: "Shift End", value: shiftEnd, set: setShiftEnd,
      hint: "Applied from next business day. Active: " + (casino?.shift_end || "—"),
      pending: { value: casino?.shift_end_pending, from: casino?.shift_end_pending_from, field: "shift_end" } },
    { label: "Breaklist Lock", value: breaklistLock, set: setBreaklistLock,
      hint: "Applied from next business day. Active: " + (casino?.breaklist_lock || "—"),
      pending: { value: casino?.breaklist_lock_pending, from: casino?.breaklist_lock_pending_from, field: "breaklist_lock" } },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* LEFT: Classic working hours */}
      <div className="cms-panel p-6">
        <h3 className="text-sm font-semibold text-card-foreground mb-4">Working Hours</h3>
        <div className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-[11px] text-warning-foreground mb-4">
          Shift End and Breaklist Lock changes apply from the <strong>next business day</strong>. The current shift continues with old values.
        </div>
        <div className="space-y-4">
          {classicFields.map(f => (
            <div key={f.label}>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1 block">{f.label}</label>
              <Input type="time" value={f.value} onChange={e => f.set(e.target.value)} className="w-32 font-mono" />
              <p className="text-[10px] text-muted-foreground mt-0.5">{f.hint}</p>
              {f.pending?.value && (
                <div className="mt-1.5 flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-2 py-1 text-[11px]">
                  <Clock className="w-3 h-3 text-primary" />
                  <span className="font-mono">Pending: {f.pending.value}</span>
                  <span className="text-muted-foreground">from {formatPendingDate(f.pending.from)}</span>
                  <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px] ml-auto"
                    onClick={() => cancelPending.mutate(f.pending!.field)} disabled={cancelPending.isPending}>Cancel</Button>
                </div>
              )}
            </div>
          ))}
          <div className="border-t border-border pt-4">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1 block">Cage Float Target (TZS)</label>
            <Input type="number" value={cageFloat} onChange={e => setCageFloat(e.target.value)} className="w-48 font-mono" placeholder="e.g. 10000000" />
            <p className="text-[10px] text-muted-foreground mt-0.5">Target cash amount in cage at all times</p>
          </div>
        </div>
        <Button onClick={handleSaveClassic} className="mt-5" disabled={updateSchedule.isPending}>
          {updateSchedule.isPending ? "Saving..." : "Save Working Hours"}
        </Button>
      </div>

      {/* RIGHT: Shift matrix + cage deadlines */}
      <div className="space-y-4">
        <div className="cms-panel p-6">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold text-card-foreground">Shift Matrix</h3>
              <p className="text-xs text-muted-foreground">Custom shifts used by rota / breaklist / cage.</p>
            </div>
            <Button size="sm" variant="outline" onClick={addShift} className="gap-1"><Plus className="w-3 h-3" /> Add</Button>
          </div>
          <div className="space-y-2">
            <div className="hidden md:grid grid-cols-[40px_1fr_90px_90px_1fr_36px] gap-2 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-1">
              <span>Key</span><span>Label</span><span>Start</span><span>End</span><span>Applies to</span><span/>
            </div>
            {matrix.map((row, i) => (
              <div key={i} className="grid grid-cols-[40px_1fr_90px_90px_1fr_36px] gap-2 items-center">
                <Input value={row.key} maxLength={3} onChange={e => updateShift(i, { key: e.target.value.toUpperCase() })} className="h-8 text-center font-mono text-xs" />
                <Input value={row.label} onChange={e => updateShift(i, { label: e.target.value })} className="h-8 text-xs" />
                <Input type="time" value={row.start} onChange={e => updateShift(i, { start: e.target.value })} className="h-8 font-mono text-xs" />
                <Input type="time" value={row.end} onChange={e => updateShift(i, { end: e.target.value })} className="h-8 font-mono text-xs" />
                <div className="flex flex-wrap gap-2">
                  {APPLY_TARGETS.map(t => (
                    <label key={t.key} className="flex items-center gap-1 text-[11px] cursor-pointer">
                      <Checkbox checked={row.applies_to.includes(t.key)} onCheckedChange={() => toggleApply(i, t.key)} className="h-3.5 w-3.5" />
                      {t.label}
                    </label>
                  ))}
                </div>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => removeShift(i)}>
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            ))}
          </div>
        </div>

        <div className="cms-panel p-6">
          <h3 className="text-sm font-semibold text-card-foreground mb-1">Cage Close Window</h3>
          <p className="text-xs text-muted-foreground mb-4">How long cage can stay open after shift end.</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1 block">Cage Close Deadline (min)</label>
              <Input type="number" value={cageDeadline} onChange={e => setCageDeadline(e.target.value)} className="w-32 font-mono" placeholder="30" />
              <p className="text-[10px] text-muted-foreground mt-0.5">Minutes after shift end</p>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1 block">Manager Override (min)</label>
              <Input type="number" value={overrideWindow} onChange={e => setOverrideWindow(e.target.value)} className="w-32 font-mono" placeholder="15" />
              <p className="text-[10px] text-muted-foreground mt-0.5">Extra minutes managers can grant</p>
            </div>
          </div>
        </div>

        <Button onClick={handleSaveRight} disabled={savingRight}>
          {savingRight ? "Saving..." : "Save Shift Matrix & Cage Window"}
        </Button>
      </div>
    </div>
  );
};

export default TimeSettingsPanel;
