/**
 * ManagementGrid — network-wide monthly grid for managers & CCTV.
 *
 * Rows are SLOTS (4 per block by default), not fixed people: the name in a
 * slot is picked from the global roster, so any manager can be assigned to
 * any city for the month (relocation / cover).
 *
 * Rota mode      : cell = shift D / M / N / L (CCTV: city code ARU/MWZ/MBI/DOD).
 * Attendance mode: cell = auto value from the rota, overridable with A / L / S.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { CellPicker } from "@/components/grids/CellPicker";
import { UNIFIED_ATT_COLORS, UNIFIED_SHIFT_COLORS } from "@/lib/shift-colors";
import {
  CCTV_HOURS,
  CITY_CODES,
  MGMT_SHIFT_HOURS,
  MGMT_SHIFT_LABELS,
  monthBounds,
  useAddManagementSlot,
  useEnsureManagementSlots,
  useManagementAttendance,
  useManagementPeople,
  useManagementRota,
  useManagementSlots,
  useSetManagementAttendance,
  useSetManagementRota,
  useSetSlotPerson,
  type MgmtBlock,
  type MgmtShift,
  type MgmtSlot,
} from "@/hooks/use-management-rota";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const SHIFTS: MgmtShift[] = ["D", "M", "N", "L"];
const NO_PERSON = "__none__";

type Casino = { id: string; name: string; slug: string | null };

const useAllCasinos = () =>
  useQuery({
    queryKey: ["management-casinos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("casinos").select("id, name, slug").order("name");
      if (error) throw error;
      return (data || []) as Casino[];
    },
    staleTime: 10 * 60_000,
  });

interface Props {
  month: string;
  mode: "rota" | "attendance";
  canEdit: boolean;
  /** Surveillance users may only edit the CCTV block. */
  cctvOnly?: boolean;
}

export default function ManagementGrid({ month, mode, canEdit, cctvOnly = false }: Props) {
  const { days } = monthBounds(month);
  const { data: casinos = [] } = useAllCasinos();
  const { data: people = [] } = useManagementPeople();
  const { data: slots = [], isLoading } = useManagementSlots(month);
  const { data: rota = [] } = useManagementRota(month);
  const { data: attendance = [] } = useManagementAttendance(month);

  const ensureSlots = useEnsureManagementSlots();
  const addSlot = useAddManagementSlot();
  const setPerson = useSetSlotPerson();
  const setRota = useSetManagementRota();
  const setAtt = useSetManagementAttendance();

  // Auto-create slots for a fresh month (carrying over last month's people).
  const needsSeed = !isLoading && slots.length === 0 && casinos.length > 0;
  const seedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!needsSeed || ensureSlots.isPending || seedRef.current === month) return;
    seedRef.current = month;
    ensureSlots.mutate({ month, casinoIds: casinos.map((c) => c.id) });
  }, [needsSeed, month, casinos]);

  const dates = useMemo(
    () => Array.from({ length: days }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`),
    [month, days],
  );

  const rotaMap = useMemo(() => {
    const m = new Map<string, { shift: MgmtShift | null; city: string | null }>();
    for (const r of rota) m.set(`${r.slot_id}|${r.date}`, { shift: r.shift, city: r.city_casino_id });
    return m;
  }, [rota]);

  const attMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of attendance) if (a.value) m.set(`${a.slot_id}|${a.date}`, a.value);
    return m;
  }, [attendance]);

  const peopleById = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const cityCodeById = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of casinos) m.set(c.id, CITY_CODES[c.slug || ""] || c.name.slice(0, 3).toUpperCase());
    return m;
  }, [casinos]);

  const blocks = useMemo(() => {
    const list: { key: string; label: string; block: MgmtBlock; casinoId: string | null; slots: MgmtSlot[] }[] = [];
    const byKey = (block: MgmtBlock, casinoId: string | null) =>
      slots
        .filter((s) => s.block === block && (s.casino_id ?? null) === casinoId)
        .sort((a, b) => a.slot_index - b.slot_index);
    for (const c of casinos) {
      list.push({ key: `casino-${c.id}`, label: c.name.toUpperCase(), block: "casino", casinoId: c.id, slots: byKey("casino", c.id) });
    }
    list.push({ key: "office", label: "OFFICE", block: "office", casinoId: null, slots: byKey("office", null) });
    list.push({ key: "cctv", label: "CCTV", block: "cctv", casinoId: null, slots: byKey("cctv", null) });
    return list;
  }, [slots, casinos]);

  const usedPersonIds = useMemo(() => new Set(slots.map((s) => s.person_id).filter(Boolean) as string[]), [slots]);

  const rotaRows = (isCctv: boolean) =>
    isCctv
      ? [{
          label: "City",
          options: casinos.map((c) => ({
            value: `city:${c.id}`,
            label: cityCodeById.get(c.id) || "?",
            className: "bg-blue-700 text-white",
          })),
        }, {
          label: "Other",
          options: [{ value: "L", label: "L", className: UNIFIED_SHIFT_COLORS.L }],
        }]
      : [{
          label: "Shift",
          options: SHIFTS.map((s) => ({
            value: s,
            label: s,
            title: MGMT_SHIFT_LABELS[s],
            className: UNIFIED_SHIFT_COLORS[s],
          })),
        }];

  const attRows = [
    { label: "Status", options: (["A", "L", "S"] as const).map((v) => ({ value: v, label: v, className: UNIFIED_ATT_COLORS[v] })) },
  ];

  const cellFor = (slot: MgmtSlot, date: string, isCctv: boolean) => {
    const r = rotaMap.get(`${slot.id}|${date}`);
    const editable = canEdit && (!cctvOnly || isCctv) && !!slot.person_id;

    if (mode === "rota") {
      const value = r?.city ? `city:${r.city}` : r?.shift || null;
      const display = r?.city ? cityCodeById.get(r.city) || "?" : r?.shift || "·";
      const cls = r?.city
        ? "bg-blue-700 text-white font-bold"
        : r?.shift
          ? UNIFIED_SHIFT_COLORS[r.shift]
          : "text-muted-foreground/40";
      return (
        <CellPicker
          value={value}
          display={display}
          disabled={!editable}
          rows={rotaRows(isCctv)}
          title={r?.shift ? MGMT_SHIFT_LABELS[r.shift] : undefined}
          cellClassName={`w-full h-6 rounded text-[10px] font-mono ${cls} ${editable ? "hover:ring-1 hover:ring-primary" : ""}`}
          onSelect={(v) => {
            if (!v) return setRota.mutate({ slotId: slot.id, date, shift: null, cityCasinoId: null, month });
            if (v.startsWith("city:")) {
              return setRota.mutate({ slotId: slot.id, date, shift: "N", cityCasinoId: v.slice(5), month });
            }
            setRota.mutate({ slotId: slot.id, date, shift: v as MgmtShift, cityCasinoId: null, month });
          }}
        />
      );
    }

    // Attendance: auto from rota unless manually overridden.
    const manual = attMap.get(`${slot.id}|${date}`);
    const worked = !!r && (!!r.city || (r.shift && r.shift !== "L"));
    const auto = worked ? (isCctv ? String(CCTV_HOURS) : String(MGMT_SHIFT_HOURS[r!.shift || "D"] ?? 8)) : "";
    const display = manual || (auto ? auto : "·");
    const cls = manual
      ? UNIFIED_ATT_COLORS[manual]
      : worked
        ? "bg-muted/60 text-foreground"
        : "text-muted-foreground/40";
    return (
      <CellPicker
        value={manual || null}
        display={display}
        disabled={!editable}
        rows={attRows}
        title={manual ? undefined : worked ? `${auto}h (auto)` : undefined}
        cellClassName={`w-full h-6 rounded text-[10px] font-mono ${cls} ${editable ? "hover:ring-1 hover:ring-primary" : ""}`}
        onSelect={(v) => setAtt.mutate({ slotId: slot.id, date, value: (v as any) || null, month })}
      />
    );
  };

  const totalsFor = (slot: MgmtSlot, isCctv: boolean) => {
    let days = 0;
    let hours = 0;
    const cities = new Map<string, number>();
    for (const date of dates) {
      const manual = attMap.get(`${slot.id}|${date}`);
      if (mode === "attendance" && manual) continue;
      const r = rotaMap.get(`${slot.id}|${date}`);
      if (!r) continue;
      if (r.city) {
        days++;
        hours += CCTV_HOURS;
        cities.set(r.city, (cities.get(r.city) || 0) + 1);
      } else if (r.shift && r.shift !== "L") {
        days++;
        hours += MGMT_SHIFT_HOURS[r.shift] ?? 8;
      }
    }
    const cityText = isCctv
      ? [...cities.entries()].map(([id, n]) => `${cityCodeById.get(id)} ${n}`).join(" · ")
      : "";
    return { days, hours, cityText };
  };

  if (isLoading) return <div className="p-4 text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="overflow-x-auto border border-border rounded-lg">
      <table className="w-full border-collapse text-[11px]">
        <thead className="sticky top-0 z-10 bg-card">
          <tr>
            <th className="sticky left-0 z-20 bg-card border-b border-r border-border px-2 py-1 text-left font-semibold min-w-[160px]">
              Name
            </th>
            {dates.map((d) => {
              const dt = new Date(d + "T12:00:00Z");
              const dow = WEEKDAYS[dt.getUTCDay()];
              const weekend = dt.getUTCDay() === 0 || dt.getUTCDay() === 6;
              return (
                <th key={d} className={`border-b border-border px-0.5 py-1 font-mono font-normal min-w-[30px] ${weekend ? "bg-muted/40" : ""}`}>
                  <div className="text-[10px] font-bold">{d.slice(-2)}</div>
                  <div className="text-[8px] text-muted-foreground">{dow}</div>
                </th>
              );
            })}
            <th className="border-b border-l border-border px-2 py-1 text-right font-semibold min-w-[110px]">Total</th>
          </tr>
        </thead>
        <tbody>
          {blocks.map((b) => {
            const isCctv = b.block === "cctv";
            const roster = people.filter((p) => (isCctv ? p.kind === "cctv" : p.kind === "manager"));
            return (
              <>
                <tr key={`${b.key}-h`} className="bg-primary/10">
                  <td
                    colSpan={dates.length + 2}
                    className="sticky left-0 border-y border-border px-2 py-1 text-[10px] font-bold tracking-wider uppercase"
                  >
                    {b.label}
                    {canEdit && (!cctvOnly || isCctv) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-5 ml-2 px-1.5 text-[10px]"
                        onClick={() =>
                          addSlot.mutate({
                            block: b.block,
                            casinoId: b.casinoId,
                            month,
                            nextIndex: (b.slots.at(-1)?.slot_index ?? 0) + 1,
                          })
                        }
                      >
                        <Plus className="w-3 h-3 mr-0.5" /> Slot
                      </Button>
                    )}
                  </td>
                </tr>
                {b.slots.map((slot) => {
                  const person = slot.person_id ? peopleById.get(slot.person_id) : null;
                  const t = totalsFor(slot, isCctv);
                  const slotEditable = canEdit && (!cctvOnly || isCctv);
                  return (
                    <tr key={slot.id} className="hover:bg-muted/30">
                      <td className="sticky left-0 z-10 bg-card border-b border-r border-border px-1 py-0.5">
                        <Select
                          value={slot.person_id || NO_PERSON}
                          disabled={!slotEditable}
                          onValueChange={(v) =>
                            setPerson.mutate({ slotId: slot.id, personId: v === NO_PERSON ? null : v, month })
                          }
                        >
                          <SelectTrigger className="h-6 text-[11px] border-none shadow-none focus:ring-0 px-1">
                            <SelectValue placeholder="— select —" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NO_PERSON}>— empty —</SelectItem>
                            {roster.map((p) => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.name}
                                {usedPersonIds.has(p.id) && p.id !== slot.person_id ? " •" : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      {dates.map((d) => {
                        const dt = new Date(d + "T12:00:00Z");
                        const weekend = dt.getUTCDay() === 0 || dt.getUTCDay() === 6;
                        return (
                          <td key={d} className={`border-b border-border p-0.5 ${weekend ? "bg-muted/20" : ""}`}>
                            {person ? cellFor(slot, d, isCctv) : <div className="h-6" />}
                          </td>
                        );
                      })}
                      <td className="border-b border-l border-border px-2 py-0.5 text-right font-mono text-[10px] whitespace-nowrap">
                        {person ? (
                          <>
                            <span className="font-bold">{t.days}d</span>{" "}
                            <span className="text-muted-foreground">{t.hours}h</span>
                            {t.cityText && <div className="text-[9px] text-muted-foreground">{t.cityText}</div>}
                          </>
                        ) : (
                          <span className="text-muted-foreground/40">·</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
