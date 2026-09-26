/**
 * Vacation planner — managers × 12 months, each month split into 1–10 / 11–20 / 21–end.
 * Vacations have exact dates; bars are positioned by day inside each month.
 * Saving a vacation puts L into Management Rota for those days (DB trigger).
 */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Pencil } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useManagementPeople } from "@/hooks/use-management-rota";
import { fmtDate } from "@/lib/format-date";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const EDIT_ROLES = ["super_admin", "finance_manager", "boss", "general_manager"];
const COLORS: Record<string, string> = {
  emerald: "bg-emerald-500",
  sky: "bg-sky-500",
  amber: "bg-amber-500",
  rose: "bg-rose-500",
  violet: "bg-violet-500",
  slate: "bg-slate-500",
};

type Vacation = { id: string; person_id: string; start_date: string; end_date: string; color: string; note: string | null };
type Draft = { id?: string; person_id: string; start_date: string; end_date: string; color: string; note: string };

const dim = (y: number, m: number) => new Date(y, m + 1, 0).getDate();
const toDate = (s: string) => new Date(s + "T00:00:00");

export default function VacationPlanner({ year: initialYear }: { year: number }) {
  const [year, setYear] = useState(initialYear);
  useEffect(() => setYear(initialYear), [initialYear]);
  const { roles } = useAuth();
  const canEdit = roles.some((r) => EDIT_ROLES.includes(r));
  const qc = useQueryClient();
  const { data: people = [] } = useManagementPeople();
  const managers = useMemo(
    () => people.filter((p) => p.kind === "manager").sort((a, b) => a.name.localeCompare(b.name)),
    [people],
  );

  const { data: vacations = [] } = useQuery({
    queryKey: ["management-vacations", year],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("management_vacations" as any)
        .select("*")
        .lte("start_date", `${year}-12-31`)
        .gte("end_date", `${year}-01-01`);
      if (error) throw error;
      return (data || []) as unknown as Vacation[];
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["management-vacations"] });
    qc.invalidateQueries({ queryKey: ["management-rota"] });
  };
  const save = useMutation({
    mutationFn: async (d: Draft) => {
      const row = { person_id: d.person_id, start_date: d.start_date, end_date: d.end_date, color: d.color, note: d.note || null };
      const { error } = d.id
        ? await supabase.from("management_vacations" as any).update(row).eq("id", d.id)
        : await supabase.from("management_vacations" as any).insert(row);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); setDraft(null); toast.success("Vacation saved"); },
    onError: (e: any) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("management_vacations" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); setDraft(null); },
    onError: (e: any) => toast.error(e.message),
  });

  const [draft, setDraft] = useState<Draft | null>(null);
  const [personDraft, setPersonDraft] = useState<{ id: string; name: string } | null>(null);

  const savePerson = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase.from("management_people" as any).update({ name }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["management-people"] }); setPersonDraft(null); toast.success("Name updated"); },
    onError: (e: any) => toast.error(e.message),
  });
  const removePerson = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("management_people" as any).update({ is_active: false }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["management-people"] }); setPersonDraft(null); toast.success("Removed from the list"); },
    onError: (e: any) => toast.error(e.message),
  });

  const segments = (v: Vacation, m: number) => {
    const ms = new Date(year, m, 1);
    const me = new Date(year, m, dim(year, m));
    const s = toDate(v.start_date);
    const e = toDate(v.end_date);
    if (e < ms || s > me) return null;
    const from = s < ms ? 1 : s.getDate();
    const to = e > me ? dim(year, m) : e.getDate();
    const n = dim(year, m);
    return { left: ((from - 1) / n) * 100, width: ((to - from + 1) / n) * 100 };
  };

  const openNew = (personId: string, m: number, third: number) => {
    if (!canEdit) return;
    const start = Math.min(third * 10 + 1, dim(year, m));
    const end = third === 2 ? dim(year, m) : third * 10 + 10;
    const ds = (d: number) => `${year}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    setDraft({ person_id: personId, start_date: ds(start), end_date: ds(end), color: "emerald", note: "" });
  };

  const daysOf = (d: Draft) => Math.round((toDate(d.end_date).getTime() - toDate(d.start_date).getTime()) / 86400000) + 1;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setYear(year - 1)}><ChevronLeft className="w-4 h-4" /></Button>
        <span className="text-sm font-semibold min-w-[60px] text-center">{year}</span>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setYear(year + 1)}><ChevronRight className="w-4 h-4" /></Button>
      </div>
      <div className="overflow-x-auto border border-border rounded-lg">
        <table className="border-collapse text-[11px] w-full">
          <thead className="bg-card">
            <tr>
              <th className="sticky left-0 z-10 bg-card border-b border-r border-border px-2 py-1 text-left min-w-[130px]">Manager</th>
              {MONTHS.map((mn) => (
                <th key={mn} className="border-b border-r border-border px-1 py-1 min-w-[90px]">
                  <div className="font-semibold">{mn}</div>
                  <div className="grid grid-cols-3 text-[8px] text-muted-foreground font-mono font-normal">
                    <span>1</span><span>11</span><span>21</span>
                  </div>
                </th>
              ))}
              <th className="border-b border-border px-2 py-1 text-right">Days</th>
            </tr>
          </thead>
          <tbody>
            {managers.map((p) => {
              const mine = vacations.filter((v) => v.person_id === p.id);
              const total = mine.reduce((acc, v) => {
                const s = toDate(v.start_date < `${year}-01-01` ? `${year}-01-01` : v.start_date);
                const e = toDate(v.end_date > `${year}-12-31` ? `${year}-12-31` : v.end_date);
                return acc + Math.round((e.getTime() - s.getTime()) / 86400000) + 1;
              }, 0);
              return (
                <tr key={p.id} className="hover:bg-muted/30">
                  <td className="sticky left-0 z-10 bg-card border-b border-r border-border px-2 py-1 font-medium">
                    <span className="inline-flex items-center gap-1">
                      {p.name}
                      {canEdit && (
                        <button
                          className="text-muted-foreground hover:text-foreground"
                          onClick={() => setPersonDraft({ id: p.id, name: p.name })}
                          aria-label={`Edit ${p.name}`}
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                      )}
                    </span>
                  </td>
                  {MONTHS.map((_, m) => (
                    <td key={m} className="border-b border-r border-border p-0 relative h-7">
                      <div className="absolute inset-0 grid grid-cols-3">
                        {[0, 1, 2].map((t) => (
                          <button
                            key={t}
                            className={`h-full ${t < 2 ? "border-r border-dashed border-border/60" : ""} ${canEdit ? "hover:bg-primary/10" : "cursor-default"}`}
                            onClick={() => openNew(p.id, m, t)}
                            aria-label={`Add vacation ${p.name} ${MONTHS[m]}`}
                          />
                        ))}
                      </div>
                      {mine.map((v) => {
                        const seg = segments(v, m);
                        if (!seg) return null;
                        return (
                          <button
                            key={v.id}
                            title={`${fmtDate(v.start_date)} – ${fmtDate(v.end_date)}${v.note ? ` · ${v.note}` : ""}`}
                            className={`absolute top-1 bottom-1 rounded-sm ${COLORS[v.color] || COLORS.emerald} opacity-90 hover:opacity-100`}
                            style={{ left: `${seg.left}%`, width: `${seg.width}%` }}
                            onClick={() => canEdit && setDraft({ id: v.id, person_id: v.person_id, start_date: v.start_date, end_date: v.end_date, color: v.color, note: v.note || "" })}
                          />
                        );
                      })}
                    </td>
                  ))}
                  <td className="border-b border-border px-2 py-1 text-right font-mono">{total || "·"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Edit vacation" : "New vacation"} · {managers.find((p) => p.id === draft?.person_id)?.name}</DialogTitle>
          </DialogHeader>
          {draft && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs space-y-1">From
                  <Input type="date" value={draft.start_date} onChange={(e) => setDraft({ ...draft, start_date: e.target.value })} className="h-8" />
                </label>
                <label className="text-xs space-y-1">To
                  <Input type="date" value={draft.end_date} onChange={(e) => setDraft({ ...draft, end_date: e.target.value })} className="h-8" />
                </label>
              </div>
              <div className="text-xs text-muted-foreground">{daysOf(draft) > 0 ? `${daysOf(draft)} days` : "End date must be after start"}</div>
              <div className="flex gap-2">
                {Object.entries(COLORS).map(([k, cls]) => (
                  <button key={k} onClick={() => setDraft({ ...draft, color: k })} className={`w-6 h-6 rounded ${cls} ${draft.color === k ? "ring-2 ring-offset-2 ring-primary" : ""}`} aria-label={k} />
                ))}
              </div>
              <Input placeholder="Note" value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} className="h-8" />
            </div>
          )}
          <DialogFooter className="gap-2">
            {draft?.id && <Button variant="destructive" size="sm" onClick={() => remove.mutate(draft.id!)}>Delete</Button>}
            <Button size="sm" disabled={!draft || daysOf(draft) <= 0 || save.isPending} onClick={() => draft && save.mutate(draft)}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!personDraft} onOpenChange={(o) => !o && setPersonDraft(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit manager</DialogTitle>
          </DialogHeader>
          {personDraft && (
            <label className="text-xs space-y-1">Name
              <Input value={personDraft.name} onChange={(e) => setPersonDraft({ ...personDraft, name: e.target.value })} className="h-8" />
            </label>
          )}
          <DialogFooter className="gap-2">
            <Button variant="destructive" size="sm" disabled={removePerson.isPending} onClick={() => personDraft && removePerson.mutate(personDraft.id)}>Remove from list</Button>
            <Button size="sm" disabled={!personDraft?.name.trim() || savePerson.isPending} onClick={() => personDraft && savePerson.mutate({ id: personDraft.id, name: personDraft.name.trim() })}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
