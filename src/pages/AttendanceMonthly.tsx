/**
 * Monthly Attendance — single big grid (employees × days of month).
 * Cells show hours (number) or code (A=absent). Holiday columns highlighted
 * with their pay multiplier. Right-side columns aggregate totals.
 */
import { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Sparkles, Trash2 } from "lucide-react";
import { PageShell, PageSection } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth-context";
import {
  useMonthlyAttendance, useHolidays, useUpsertHoliday, useDeleteHoliday, useSetAttendanceHours, useSetAttendanceCode,
  type MonthlyAttendanceRow,
} from "@/hooks/use-attendance-monthly";
import { buildDisplayNames, splitFullName } from "@/lib/display-name";

const DEPT_ORDER = ["Pit", "Floor", "Security", "Office"] as const;
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const WEEKDAYS = ["Su","Mo","Tu","We","Th","Fr","Sa"];

const fmtNum = (n: number) =>
  Number.isInteger(n) ? String(n) : n.toFixed(1);

const firstName = (full: string | null | undefined) =>
  (full ?? "").trim().split(/\s+/)[0] || (full ?? "");

const today = () => new Date();
const monthFirst = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;

const AttendanceMonthly = () => {
  const { roles } = useAuth();
  const canEdit = roles.includes("hr") || roles.includes("manager") || roles.includes("shift_manager") || roles.includes("super_admin") || roles.includes("finance_manager");

  const [cursor, setCursor] = useState<Date>(() => {
    const d = today();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const monthStr = monthFirst(cursor);
  const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const { data: rows = [], isLoading } = useMonthlyAttendance(monthStr);
  const { data: holidays = [] } = useHolidays(monthStr);
  const setHours = useSetAttendanceHours();
  const setCode = useSetAttendanceCode();

  const [holidayOpen, setHolidayOpen] = useState(false);

  // Group rows by employee
  const employees = useMemo(() => {
    const map = new Map<string, { meta: MonthlyAttendanceRow; byDay: Map<number, MonthlyAttendanceRow> }>();
    for (const r of rows) {
      const day = Number(r.d.slice(8, 10));
      if (!map.has(r.employee_id)) map.set(r.employee_id, { meta: r, byDay: new Map() });
      map.get(r.employee_id)!.byDay.set(day, r);
    }
    return Array.from(map.values());
  }, [rows]);

  const grouped = useMemo(() => {
    const by: Record<string, typeof employees> = { Pit: [], Floor: [], Security: [], Office: [], Other: [] };
    for (const e of employees) {
      const k = (DEPT_ORDER as readonly string[]).includes(e.meta.department) ? e.meta.department : "Other";
      (by as any)[k].push(e);
    }
    for (const k of Object.keys(by)) by[k].sort((a, b) => a.meta.full_name.localeCompare(b.meta.full_name));
    return by;
  }, [employees]);

  // Display the FULL name as stored; disambiguate only when full_names collide.
  const displayNameMap = useMemo(() => {
    const inputs = employees.map((e) => {
      const split = splitFullName(e.meta.full_name);
      const fullDisplay = (e.meta.full_name && String(e.meta.full_name).trim()) || split.first;
      return { id: e.meta.employee_id, first: fullDisplay, last: split.last };
    });
    return buildDisplayNames(inputs);
  }, [employees]);
  const displayName = (e: { meta: MonthlyAttendanceRow }) =>
    displayNameMap.get(e.meta.employee_id) || (e.meta.full_name || firstName(e.meta.full_name));

  const holidayByDay = useMemo(() => {
    const m = new Map<number, { name: string; multiplier: number; id: string }>();
    for (const h of holidays) m.set(Number(h.date.slice(8, 10)), { name: h.name, multiplier: h.multiplier, id: h.id });
    return m;
  }, [holidays]);

  // Per-employee totals memoized against `rows` — without this every keystroke
  // (or click) re-runs the totals math for every employee × every day.
  const totalsByEmployee = useMemo(() => {
    const out = new Map<string, { hours: number; dWorked: number; leave: number; holH: number; otH: number }>();
    for (const e of employees) {
      let hours = 0, dWorked = 0, leave = 0, holH = 0, otH = 0;
      for (const [, r] of e.byDay) {
        const h = r.effective_hours || 0;
        const code = (r.raw_value || "").toUpperCase();
        hours += h;
        if (h > 0) dWorked += 1;
        if (code === "L" || code === "S") leave += 1;
        if (r.is_holiday) holH += h;
        if (h > 9) otH += h - 9;
      }
      out.set(e.meta.employee_id, { hours, dWorked, leave, holH, otH });
    }
    return out;
  }, [employees]);


  return (
    <PageShell>
      <PageHeader
        icon={CalendarDays}
        title="Monthly Attendance"
        subtitle="All employees × days of month — hours, holidays, totals"
      >
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <div className="text-sm font-medium px-2 min-w-32 text-center">{MONTHS[cursor.getMonth()]} {cursor.getFullYear()}</div>
          <Button variant="ghost" size="icon" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
        {canEdit && (
          <Button variant="outline" size="sm" onClick={() => setHolidayOpen(true)}>
            <Sparkles className="w-4 h-4 mr-1" /> Mark Holiday
          </Button>
        )}
      </PageHeader>

      <PageSection card={false}>
        {isLoading ? (
          <div className="text-sm text-muted-foreground p-4">Loading…</div>
        ) : employees.length === 0 ? (
          <div className="text-sm text-muted-foreground p-4">No employees — open Staff Master and click Reimport.</div>
        ) : (
          <div className="overflow-auto border border-border rounded-md bg-card">
            <table className="text-[11px] font-mono w-full border-collapse">
              <thead className="sticky top-0 bg-muted/80 z-10">
                <tr>
                  <th className="sticky left-0 z-20 bg-muted/95 px-2 py-1 text-left min-w-48">Employee</th>
                  {days.map(d => {
                    const dt = new Date(cursor.getFullYear(), cursor.getMonth(), d);
                    const wd = WEEKDAYS[dt.getDay()];
                    const isWeekend = dt.getDay() === 0 || dt.getDay() === 6;
                    const hol = holidayByDay.get(d);
                    return (
                      <th
                        key={d}
                        className={`px-1 py-0.5 text-center border-l border-border min-w-9 ${
                          hol ? "bg-amber-200/60 dark:bg-amber-900/30" : isWeekend ? "bg-muted" : ""
                        }`}
                        title={hol ? `${hol.name} ×${hol.multiplier}` : ""}
                      >
                        <div className="text-xs">{d}</div>
                        <div className="text-[9px] text-muted-foreground">{wd}</div>
                        {hol && <div className="text-[8px] text-amber-700 dark:text-amber-400">×{hol.multiplier}</div>}
                      </th>
                    );
                  })}
                  <th className="px-2 py-1 text-right border-l-2 border-border">Days</th>
                  <th className="px-2 py-1 text-right">Hours</th>
                  <th className="px-2 py-1 text-right">Leave</th>
                  <th className="px-2 py-1 text-right">Hol H</th>
                  <th className="px-2 py-1 text-right">OT H</th>
                </tr>
              </thead>
              <tbody>
                {(["Pit", "Floor", "Security", "Office", "Other"] as const).flatMap(dept => {
                  const list = grouped[dept];
                  if (!list || list.length === 0) return [] as JSX.Element[];
                  const rowsOut: JSX.Element[] = [];
                  rowsOut.push(
                    <tr key={`hdr-${dept}`} className="bg-muted/40">
                      <td colSpan={daysInMonth + 6} className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                        {dept} <span className="ml-2 text-[9px]">({list.length})</span>
                      </td>
                    </tr>
                  );
                  for (const e of list) {
                    const t = totalsByEmployee.get(e.meta.employee_id) ?? { hours: 0, dWorked: 0, leave: 0, holH: 0, otH: 0 };
                    rowsOut.push(
                      <tr key={e.meta.employee_id} className="border-t border-border hover:bg-muted/20">
                        <td className="sticky left-0 z-10 bg-card px-2 py-0.5 font-sans">
                          <div className="font-medium text-xs flex items-center gap-1">
                            {displayName(e)}
                            {e.meta.is_pit_boss && <Badge variant="secondary" className="px-1 text-[9px]">PB</Badge>}
                            {e.meta.dealer_category === "dealer" && <Badge variant="outline" className="px-1 text-[9px]">D</Badge>}
                            {e.meta.dealer_category === "inspector" && <Badge variant="outline" className="px-1 text-[9px]">I</Badge>}
                            {e.meta.dealer_category === "trainee" && <Badge variant="outline" className="px-1 text-[9px]">T</Badge>}
                          </div>
                        </td>
                        {days.map(d => {
                          const cell = e.byDay.get(d);
                          const hol = holidayByDay.get(d);
                          const code = (cell?.raw_value || "").toUpperCase();
                          const h = cell?.effective_hours || 0;
                          const display =
                            cell?.manual_hours != null ? fmtNum(Number(cell.manual_hours)) :
                            h > 0 ? fmtNum(h) :
                            code === "A" ? "A" :
                            code === "SP" ? "SP" :
                            code === "L" ? "L" :
                            code === "S" ? "S" :
                            "·";
                          let cls = "text-muted-foreground";
                          let pillCls = "";
                          if (h > 0) cls = "text-foreground font-semibold";
                          if (code === "A") {
                            cls = "";
                            pillCls = "inline-flex items-center justify-center min-w-[22px] px-1 rounded text-[11px] font-extrabold bg-rose-500 text-white shadow-sm";
                          }
                          if (code === "SP") {
                            cls = "";
                            pillCls = "inline-flex items-center justify-center min-w-[22px] px-1 rounded text-[11px] font-extrabold bg-red-600 text-white shadow-sm ring-1 ring-red-700";
                          }
                          if (code === "S") {
                            cls = "";
                            pillCls = "inline-flex items-center justify-center min-w-[22px] px-1 rounded text-[11px] font-extrabold bg-orange-500 text-white shadow-sm";
                          }
                          if (code === "L") {
                            cls = "";
                            pillCls = "inline-flex items-center justify-center min-w-[22px] px-1 rounded text-[11px] font-extrabold bg-amber-400 text-amber-950 dark:bg-amber-500 dark:text-amber-950 shadow-sm";
                          }
                          const cellBg = hol ? "bg-amber-100/50 dark:bg-amber-900/20" : "";
                          return (
                            <td
                              key={d}
                              className={`text-center border-l border-border px-0.5 py-0.5 ${cellBg}`}
                              onClick={canEdit ? () => {
                                const v = prompt(`Hours OR code (A/S/SP/L) for ${displayName(e)} on ${d} ${MONTHS[cursor.getMonth()]} (current ${display}):`, h ? String(h) : code || "");
                                if (v === null) return;
                                const trimmed = v.trim().toUpperCase();
                                const dateStr = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
                                if (trimmed === "" || trimmed === "A" || trimmed === "S" || trimmed === "SP" || trimmed === "L") {
                                  setCode.mutate({ employee_id: e.meta.employee_id, date: dateStr, department: e.meta.department, value: trimmed });
                                  return;
                                }
                                const n = Number(trimmed);
                                if (Number.isFinite(n) && n >= 0 && n <= 24) {
                                  setHours.mutate({ employee_id: e.meta.employee_id, date: dateStr, hours: n });
                                }
                              } : undefined}
                              role={canEdit ? "button" : undefined}
                              style={canEdit ? { cursor: "pointer" } : undefined}
                            >
                              {pillCls ? (
                                <span className={pillCls}>{display}</span>
                              ) : (
                                <span className={cls}>{display}</span>
                              )}
                            </td>
                          );
                        })}
                        <td className="text-right px-2 py-0.5 border-l-2 border-border">{t.dWorked}</td>
                        <td className="text-right px-2 py-0.5 font-semibold">{fmtNum(t.hours)}</td>
                        <td className="text-right px-2 py-0.5">{t.leave}</td>
                        <td className="text-right px-2 py-0.5 text-amber-700 dark:text-amber-400">{fmtNum(t.holH)}</td>
                        <td className="text-right px-2 py-0.5">{fmtNum(t.otH)}</td>
                      </tr>
                    );
                  }
                  return rowsOut;
                })}
              </tbody>
            </table>
          </div>
        )}
      </PageSection>

      {holidayOpen && (
        <HolidayDialog
          monthCursor={cursor}
          holidays={holidays.map(h => ({ id: h.id, date: h.date, name: h.name, multiplier: h.multiplier }))}
          onClose={() => setHolidayOpen(false)}
        />
      )}
    </PageShell>
  );
};

const HolidayDialog = ({ monthCursor, holidays, onClose }: {
  monthCursor: Date;
  holidays: { id: string; date: string; name: string; multiplier: number }[];
  onClose: () => void;
}) => {
  const upsert = useUpsertHoliday();
  const del = useDeleteHoliday();
  const todayStr = `${monthCursor.getFullYear()}-${String(monthCursor.getMonth() + 1).padStart(2, "0")}-01`;
  const [date, setDate] = useState<string>(todayStr);
  const [name, setName] = useState<string>("");
  const [multiplier, setMultiplier] = useState<string>("1.5");
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Public Holidays</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid grid-cols-3 gap-2">
            <label className="space-y-1 text-xs col-span-1">
              <span className="text-muted-foreground">Date</span>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
            </label>
            <label className="space-y-1 text-xs col-span-1">
              <span className="text-muted-foreground">Name</span>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Eid al-Fitr" />
            </label>
            <label className="space-y-1 text-xs col-span-1">
              <span className="text-muted-foreground">Multiplier</span>
              <Input type="number" step="0.1" min="1" max="3" value={multiplier} onChange={e => setMultiplier(e.target.value)} />
            </label>
          </div>
          <Button
            size="sm"
            onClick={async () => {
              if (!name.trim() || !date) return;
              await upsert.mutateAsync({ date, name: name.trim(), multiplier: Number(multiplier) || 1.5 });
              setName("");
            }}
          >
            Save Holiday
          </Button>

          <div className="border-t pt-3 space-y-1 max-h-64 overflow-auto">
            {holidays.length === 0 ? (
              <div className="text-xs text-muted-foreground">No holidays this month.</div>
            ) : holidays.map(h => (
              <div key={h.id} className="flex items-center justify-between text-xs py-1">
                <div>
                  <span className="font-mono">{h.date}</span> · {h.name}
                  <Badge variant="outline" className="ml-2 px-1 text-[9px]">×{h.multiplier}</Badge>
                </div>
                <Button size="icon" variant="ghost" onClick={() => del.mutate(h.id)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AttendanceMonthly;
