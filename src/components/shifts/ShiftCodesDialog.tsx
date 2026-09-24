/**
 * Shift Codes editor — letters with start/end time (15-min steps) per casino + department.
 * Hours are derived from the times; used by Rota (plan) and Attendance (fact).
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Clock, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/lib/auth-context";
import { useCasino } from "@/lib/casino-context";
import {
  hoursBetween,
  useDeleteShiftCode,
  useShiftCodes,
  useUpsertShiftCode,
  type ShiftCode,
  type ShiftDept,
} from "@/hooks/use-shift-codes";

export const SHIFT_CODE_EDIT_ROLES = ["super_admin", "finance_manager", "shift_manager", "boss", "general_manager"];
const NETWORK_ROLES = ["super_admin", "finance_manager", "boss", "general_manager"];
const PIT_ENUM = ["M", "N", "A", "S", "E", "L", "EM", "EN", "T", "SW", "ESW"];
const DEPTS: { key: ShiftDept; label: string }[] = [
  { key: "pit", label: "Live Game" },
  { key: "floor", label: "Floor" },
  { key: "security", label: "Security" },
  { key: "office", label: "Office" },
  { key: "management", label: "Management" },
];

const TIMES = Array.from({ length: 96 }, (_, i) => {
  const h = String(Math.floor(i / 4)).padStart(2, "0");
  const m = String((i % 4) * 15).padStart(2, "0");
  return `${h}:${m}`;
});

const TimeSelect = ({ value, onChange, disabled }: { value: string | null; onChange: (v: string) => void; disabled?: boolean }) => (
  <Select value={value?.slice(0, 5) || ""} onValueChange={onChange} disabled={disabled}>
    <SelectTrigger className="h-8 w-[88px] font-mono text-xs"><SelectValue placeholder="—" /></SelectTrigger>
    <SelectContent className="max-h-64">
      {TIMES.map((t) => <SelectItem key={t} value={t} className="font-mono text-xs">{t}</SelectItem>)}
    </SelectContent>
  </Select>
);

type Draft = Pick<ShiftCode, "code" | "start_time" | "end_time" | "is_working"> & { id?: string };

function Row({ row, casinoId, dept, isNew, onDone }: { row: Draft; casinoId: string; dept: ShiftDept; isNew?: boolean; onDone?: () => void }) {
  const [d, setD] = useState<Draft>(row);
  useEffect(() => setD(row), [row.id, row.start_time, row.end_time, row.is_working, row.code]);
  const upsert = useUpsertShiftCode();
  const del = useDeleteShiftCode();
  const hours = d.is_working ? hoursBetween(d.start_time, d.end_time) : 0;
  const dirty = isNew || d.start_time !== row.start_time || d.end_time !== row.end_time || d.is_working !== row.is_working || d.code !== row.code;

  const save = () => {
    const code = d.code.trim().toUpperCase();
    if (!code) return toast.error("Code is required");
    if (dept === "pit" && !PIT_ENUM.includes(code)) return toast.error(`Live Game codes: ${PIT_ENUM.join(", ")}`);
    if (d.is_working && (!d.start_time || !d.end_time)) return toast.error("Set start and end time");
    upsert.mutate(
      { id: d.id, casino_id: casinoId, department: dept, code, start_time: d.is_working ? d.start_time : null, end_time: d.is_working ? d.end_time : null, is_working: d.is_working },
      { onSuccess: () => { toast.success(`${code} saved`); onDone?.(); }, onError: (e: any) => toast.error(e.message) },
    );
  };

  return (
    <tr className="border-b border-border">
      <td className="px-2 py-1">
        <Input value={d.code} disabled={!isNew} onChange={(e) => setD({ ...d, code: e.target.value.toUpperCase() })} className="h-8 w-16 font-mono font-bold text-xs" maxLength={4} />
      </td>
      <td className="px-2 py-1"><TimeSelect value={d.start_time} disabled={!d.is_working} onChange={(v) => setD({ ...d, start_time: v })} /></td>
      <td className="px-2 py-1"><TimeSelect value={d.end_time} disabled={!d.is_working} onChange={(v) => setD({ ...d, end_time: v })} /></td>
      <td className="px-2 py-1 text-center">
        <Checkbox checked={d.is_working} onCheckedChange={(v) => setD({ ...d, is_working: !!v })} />
      </td>
      <td className="px-2 py-1 text-right font-mono text-xs">{hours}h</td>
      <td className="px-2 py-1 text-right whitespace-nowrap">
        {dirty && <Button size="sm" className="h-7 text-xs" onClick={save} disabled={upsert.isPending}>Save</Button>}
        {!isNew && d.id && (
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => del.mutate(d.id!, { onError: (e: any) => toast.error(e.message) })}>
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        )}
      </td>
    </tr>
  );
}

export default function ShiftCodesDialog({ defaultDept = "floor" }: { defaultDept?: ShiftDept }) {
  const { roles } = useAuth();
  const { activeCasinoId } = useCasino();
  const isNetwork = roles.some((r) => NETWORK_ROLES.includes(r));
  const canEdit = roles.some((r) => SHIFT_CODE_EDIT_ROLES.includes(r));
  const { data: casinos = [] } = useQuery({
    queryKey: ["management-casinos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("casinos").select("id, name, slug").order("name");
      if (error) throw error;
      return data || [];
    },
    staleTime: 10 * 60_000,
  });
  const [casinoId, setCasinoId] = useState<string | null>(activeCasinoId);
  const [dept, setDept] = useState<ShiftDept>(defaultDept);
  const [adding, setAdding] = useState(false);
  useEffect(() => { if (!casinoId && (activeCasinoId || casinos[0])) setCasinoId(activeCasinoId || (casinos[0] as any)?.id); }, [activeCasinoId, casinos]);
  const { data: codes } = useShiftCodes(casinoId, dept);
  const visibleCasinos = useMemo(() => (isNetwork ? casinos : casinos.filter((c: any) => c.id === activeCasinoId)), [isNetwork, casinos, activeCasinoId]);

  if (!canEdit) return null;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1 text-xs"><Clock className="w-3.5 h-3.5" /> Shift Codes</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Shift Codes</DialogTitle></DialogHeader>
        <div className="flex gap-2 flex-wrap">
          <Select value={casinoId || ""} onValueChange={setCasinoId}>
            <SelectTrigger className="h-8 w-[160px] text-xs"><SelectValue placeholder="Casino" /></SelectTrigger>
            <SelectContent>{visibleCasinos.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={dept} onValueChange={(v) => setDept(v as ShiftDept)}>
            <SelectTrigger className="h-8 w-[160px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>{DEPTS.map((d) => <SelectItem key={d.key} value={d.key}>{d.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <p className="text-[11px] text-muted-foreground">Hours changes apply from 01/09/2026 onwards. Earlier months are not changed.</p>
        <div className="border border-border rounded-md overflow-auto max-h-[60vh]">
          <table className="w-full text-xs">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-2 py-1 text-left">Code</th>
                <th className="px-2 py-1 text-left">Start</th>
                <th className="px-2 py-1 text-left">End</th>
                <th className="px-2 py-1">Working</th>
                <th className="px-2 py-1 text-right">Hours</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {casinoId && codes.map((c) => <Row key={c.id} row={c} casinoId={casinoId} dept={dept} />)}
              {casinoId && adding && (
                <Row isNew row={{ code: "", start_time: "09:00", end_time: "17:00", is_working: true }} casinoId={casinoId} dept={dept} onDone={() => setAdding(false)} />
              )}
            </tbody>
          </table>
        </div>
        {!adding && (
          <Button variant="outline" size="sm" className="gap-1 text-xs w-fit" onClick={() => setAdding(true)}>
            <Plus className="w-3.5 h-3.5" /> Add code
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
