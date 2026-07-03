/**
 * TimeSettingsPanel — extended casino working-hours settings.
 * Adds N/D shift starts + cage deadlines to the classic schedule form.
 * Shift End / Breaklist Lock changes are deferred to next business day
 * (see useUpdateCasinoSchedule).
 */
import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useCasino } from "@/lib/casino-context";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Clock } from "lucide-react";
import { useCasinoInfo, useUpdateCasinoSchedule, useCancelPendingSchedule } from "@/hooks/use-table-lifecycle";

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
  const [nShiftStart, setNShiftStart] = useState("");
  const [dShiftStart, setDShiftStart] = useState("");
  const [cageDeadline, setCageDeadline] = useState("");
  const [overrideWindow, setOverrideWindow] = useState("");
  const [savingExtended, setSavingExtended] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!casino || loaded) return;
    setTablesOpen(casino.tables_open || "17:30");
    setShiftStart(casino.shift_start || "18:00");
    setShiftEnd(casino.shift_end || "05:00");
    setBreaklistLock(casino.breaklist_lock || "05:30");
    setCageFloat(String(casino.cage_float || 0));
    setNShiftStart(casino.n_shift_start || "18:00");
    setDShiftStart(casino.d_shift_start || "06:00");
    setCageDeadline(String(casino.cage_close_deadline_min ?? 30));
    setOverrideWindow(String(casino.manager_override_window_min ?? 15));
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

  const handleSaveExtended = async () => {
    if (!activeCasinoId) return;
    setSavingExtended(true);
    try {
      const { error } = await supabase
        .from("casinos")
        .update({
          n_shift_start: nShiftStart || null,
          d_shift_start: dShiftStart || null,
          cage_close_deadline_min: Number(cageDeadline) || null,
          manager_override_window_min: Number(overrideWindow) || null,
        } as any)
        .eq("id", activeCasinoId);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["casino-info"] });
      toast.success("Extended time settings saved");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSavingExtended(false);
    }
  };

  const formatPendingDate = (d?: string | null) => {
    if (!d) return "";
    const [y, m, day] = d.split("-");
    return `${day}.${m}.${y}`;
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
    <div className="space-y-4">
      <div className="cms-panel p-6 max-w-lg">
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

      <div className="cms-panel p-6 max-w-lg">
        <h3 className="text-sm font-semibold text-card-foreground mb-1">Shift & Cage Times</h3>
        <p className="text-xs text-muted-foreground mb-4">
          Customizable boundaries used by rota, live, and cage close windows.
        </p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1 block">N Shift Start</label>
            <Input type="time" value={nShiftStart} onChange={e => setNShiftStart(e.target.value)} className="w-32 font-mono" />
            <p className="text-[10px] text-muted-foreground mt-0.5">Night shift starts at this time</p>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1 block">D Shift Start</label>
            <Input type="time" value={dShiftStart} onChange={e => setDShiftStart(e.target.value)} className="w-32 font-mono" />
            <p className="text-[10px] text-muted-foreground mt-0.5">Day shift starts at this time</p>
          </div>
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
        <Button onClick={handleSaveExtended} className="mt-5" disabled={savingExtended}>
          {savingExtended ? "Saving..." : "Save Shift & Cage Times"}
        </Button>
      </div>
    </div>
  );
};

export default TimeSettingsPanel;
