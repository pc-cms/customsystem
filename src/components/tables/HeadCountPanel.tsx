import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Save } from "lucide-react";
import { useGamingTables, useTableHeadCount, useBatchSetTableHeadCount } from "@/hooks/use-casino-data";
import { nowEAT, getBusinessDate } from "@/lib/business-day";
import { useAuth } from "@/lib/auth-context";

// 19:00 → 05:00 hourly slots (matches TableTracker SLOTS)
const SLOTS = (() => {
  const s: string[] = [];
  for (let h = 19; h <= 29; h++) s.push(`${String(h % 24).padStart(2, "0")}:00`);
  return s;
})();

const getCurrentHourSlot = (): string => {
  const now = nowEAT();
  const h = now.getHours();
  // Map current real hour to nearest valid slot
  if (h >= 19 && h <= 23) return `${String(h).padStart(2, "0")}:00`;
  if (h >= 0 && h <= 4) return `${String(h).padStart(2, "0")}:00`;
  if (h === 5 || h === 6 || h === 7) return "05:00";
  return SLOTS[0];
};

const clamp99 = (s: string): string => {
  const digits = s.replace(/\D/g, "").slice(0, 2);
  if (digits === "") return "";
  const n = Math.min(99, Math.max(0, parseInt(digits, 10)));
  return String(n);
};

interface HeadCountPanelProps {
  date: string;
}

export const HeadCountPanel = ({ date }: HeadCountPanelProps) => {
  const { isManager } = useAuth();
  const today = getBusinessDate();
  const readOnly = date !== today && !isManager;

  const { data: tables = [] } = useGamingTables();
  const { data: rows = [] } = useTableHeadCount(date);
  const batch = useBatchSetTableHeadCount();

  const tablesWithData = useMemo(() => new Set(rows.map((r: any) => r.table_id)), [rows]);
  const openTables = useMemo(
    () => tables.filter((t: any) => t.status === "open" || tablesWithData.has(t.id)),
    [tables, tablesWithData],
  );

  const [slot, setSlot] = useState<string>(() => getCurrentHourSlot());
  const [draft, setDraft] = useState<Record<string, string>>({});

  // Reset draft when slot / date / row set changes — show saved values.
  useEffect(() => {
    const next: Record<string, string> = {};
    openTables.forEach((t: any) => {
      const r = rows.find((x: any) => x.table_id === t.id && x.time_slot === slot);
      next[t.id] = r && r.value !== null && r.value !== undefined ? String(r.value) : "";
    });
    setDraft(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slot, date, rows.length, openTables.length]);

  const slotIdx = SLOTS.indexOf(slot);
  const goPrev = () => slotIdx > 0 && setSlot(SLOTS[slotIdx - 1]);
  const goNext = () => slotIdx < SLOTS.length - 1 && setSlot(SLOTS[slotIdx + 1]);

  const total = useMemo(
    () => Object.values(draft).reduce((s, v) => s + (v === "" ? 0 : Number(v) || 0), 0),
    [draft],
  );

  const handleSave = () => {
    if (readOnly) return;
    const entries: Array<{ table_id: string; time_slot: string; value: number }> = [];
    openTables.forEach((t: any) => {
      const raw = draft[t.id];
      if (raw === undefined || raw === "") return;
      const n = Math.min(99, Math.max(0, parseInt(raw, 10) || 0));
      const existing = rows.find((r: any) => r.table_id === t.id && r.time_slot === slot);
      if (existing && Number(existing.value) === n) return;
      entries.push({ table_id: t.id, time_slot: slot, value: n });
    });
    if (entries.length === 0) return;
    batch.mutate({ date, entries });
  };

  return (
    <div className="rounded-md border border-border bg-card">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div>
          <h3 className="text-sm font-semibold text-card-foreground">Head Count</h3>
          <p className="text-[10px] text-muted-foreground">
            Per-table head count for the selected hour · 0–99
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={goPrev} disabled={slotIdx <= 0} className="h-8 w-8 p-0">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="font-mono text-sm font-bold tabular-nums px-2 min-w-[64px] text-center">
            {slot === "05:00" ? "Final" : slot}
          </div>
          <Button size="sm" variant="outline" onClick={goNext} disabled={slotIdx >= SLOTS.length - 1} className="h-8 w-8 p-0">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button size="sm" onClick={handleSave} disabled={readOnly || batch.isPending} className="gap-1.5 h-8">
            <Save className="h-4 w-4" />
            Save
          </Button>
        </div>
      </div>

      {openTables.length === 0 ? (
        <p className="text-muted-foreground text-sm text-center py-8">No open tables</p>
      ) : (
        <div className="p-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
          {openTables.map((t: any) => (
            <label
              key={t.id}
              className="flex items-center justify-between gap-2 rounded-md border border-border bg-background px-2 py-1.5"
            >
              <span className="text-xs font-medium text-card-foreground truncate">{t.name}</span>
              <input
                type="text"
                inputMode="numeric"
                maxLength={2}
                value={draft[t.id] ?? ""}
                onChange={(e) => {
                  if (readOnly) return;
                  setDraft((d) => ({ ...d, [t.id]: clamp99(e.target.value) }));
                }}
                onBlur={() => {
                  if (readOnly) return;
                  // Auto-save on blur if value changed
                  const raw = draft[t.id];
                  if (raw === undefined || raw === "") return;
                  const n = Math.min(99, Math.max(0, parseInt(raw, 10) || 0));
                  const existing = rows.find((r: any) => r.table_id === t.id && r.time_slot === slot);
                  if (existing && Number(existing.value) === n) return;
                  batch.mutate({ date, entries: [{ table_id: t.id, time_slot: slot, value: n }] });
                }}
                readOnly={readOnly}
                placeholder="·"
                className="w-14 h-9 text-center text-sm font-mono tabular-nums bg-transparent border border-border rounded-md focus:border-primary focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
            </label>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between px-3 py-2 border-t border-border bg-muted/30">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Slot total
        </span>
        <span className="font-mono tabular-nums text-sm font-bold text-card-foreground">
          {total || "·"}
        </span>
      </div>
    </div>
  );
};

export default HeadCountPanel;
