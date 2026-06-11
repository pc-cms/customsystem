import { useMemo } from "react";
import { useGamingTables, useTableTracker } from "@/hooks/use-casino-data";
import { useChipSnapshotsFull } from "@/hooks/use-chips";
import { formatCurrency } from "@/lib/currency";
import { chipSnapshotResult } from "@/lib/table-live-result";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend, ReferenceLine,
} from "recharts";

const CHART_COLORS = [
  "#2563eb", "#10b981", "#f59e0b", "#7c3aed", "#e11d48",
  "#0891b2", "#ea580c", "#c026d3", "#65a30d", "#4f46e5",
  "#0d9488", "#db2777", "#ca8a04", "#0284c7", "#dc2626",
];
const tableColor = (i: number) => CHART_COLORS[i % CHART_COLORS.length];

const eatDecimalHours = (iso: string): number => {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Dar_es_Salaam",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(d);
  const h = Number(parts.find(p => p.type === "hour")?.value ?? 0);
  const m = Number(parts.find(p => p.type === "minute")?.value ?? 0);
  return h + m / 60;
};

const buildSlots = (): { label: string; key: number }[] => {
  const slots: { label: string; key: number }[] = [];
  for (let mins = 18 * 60; mins <= 29 * 60; mins += 30) {
    const h = Math.floor(mins / 60) % 24;
    const m = mins % 60;
    slots.push({ label: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`, key: mins });
  }
  return slots;
};

const slotKeyFor = (decH: number): number | null => {
  let h = decH;
  if (h < 6) h += 24;
  if (h < 18 || h > 29.5) return null;
  return Math.floor((h * 60) / 30) * 30;
};

const niceMax = (v: number): number => {
  if (v <= 0) return 10;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const norm = v / pow;
  let step: number;
  if (norm <= 1) step = 1;
  else if (norm <= 2) step = 2;
  else if (norm <= 5) step = 5;
  else step = 10;
  return step * pow;
};

export function TableAnalyticsChart({ date }: { date: string }) {
  const { data: tables = [] } = useGamingTables();
  const { data: tracker = [] } = useTableTracker(date);
  const { data: snapshots = [] } = useChipSnapshotsFull(date);

  const activeTables = useMemo(
    () => tables.filter(t => !(t as any).is_archived),
    [tables]
  );
  const slots = useMemo(buildSlots, []);

  const dataBySlot = useMemo(() => {
    const map: Record<string, Record<number, { value: number; ts: string }>> = {};
    const put = (tableId: string, slotKey: number, value: number, ts: string) => {
      if (!map[tableId]) map[tableId] = {};
      const cur = map[tableId][slotKey];
      if (!cur || ts > cur.ts) map[tableId][slotKey] = { value, ts };
    };
    const groups: Record<string, Record<string, { actual: Record<number, number>; expected: Record<number, number> }>> = {};
    snapshots.forEach((s: any) => {
      if (s.location_type !== "table" || !s.location_id) return;
      const ts = s.created_at;
      if (!groups[ts]) groups[ts] = {};
      if (!groups[ts][s.location_id]) groups[ts][s.location_id] = { actual: {}, expected: {} };
      groups[ts][s.location_id].actual[Number(s.denomination)] = Number(s.actual_quantity);
      groups[ts][s.location_id].expected[Number(s.denomination)] = Number(s.expected_quantity);
    });
    Object.entries(groups).forEach(([ts, perTableDenoms]) => {
      const slotKey = slotKeyFor(eatDecimalHours(ts));
      if (slotKey == null) return;
      Object.entries(perTableDenoms).forEach(([tableId, denoms]) => {
        const value = chipSnapshotResult(denoms.actual, denoms.expected);
        put(tableId, slotKey, value, ts);
      });
    });
    tracker.forEach((t: any) => {
      const [h, m] = String(t.time_slot).split(":").map(Number);
      let normH = h;
      if (normH < 6) normH += 24;
      const slotKey = normH * 60 + (m || 0);
      if (slotKey < 18 * 60 || slotKey > 29 * 60) return;
      const ts = `tracker-${t.time_slot}-${t.id || ""}`;
      put(t.table_id, slotKey, Number(t.value), ts);
    });
    return map;
  }, [snapshots, tracker]);

  const chartData = useMemo(() => {
    return slots.map(slot => {
      const row: any = { label: slot.label };
      activeTables.forEach(tbl => {
        const cell = dataBySlot[tbl.id]?.[slot.key];
        row[tbl.id] = cell ? cell.value : null;
      });
      return row;
    });
  }, [slots, activeTables, dataBySlot]);

  const yDomain = useMemo<[number, number]>(() => {
    let maxAbs = 0;
    chartData.forEach(row => {
      activeTables.forEach(tbl => {
        const v = row[tbl.id];
        if (v != null && Number.isFinite(Number(v))) {
          const a = Math.abs(Number(v));
          if (a > maxAbs) maxAbs = a;
        }
      });
    });
    const top = niceMax(Math.max(maxAbs, 10));
    return [-top, top];
  }, [chartData, activeTables]);

  return (
    <div className="h-[420px] w-full">
      <ResponsiveContainer>
        <LineChart data={chartData} margin={{ top: 10, right: 24, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis
            dataKey="label"
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
            interval={0}
            angle={-45}
            textAnchor="end"
            height={50}
          />
          <YAxis
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
            tickFormatter={(v) => formatCurrency(v)}
            width={88}
            domain={yDomain}
            allowDataOverflow={false}
          />
          <ReferenceLine y={0} stroke="hsl(var(--border))" />
          <Tooltip
            contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 }}
            formatter={(v: any) => formatCurrency(Number(v))}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {activeTables.map((tbl, i) => (
            <Line
              key={tbl.id}
              type="monotone"
              dataKey={tbl.id}
              name={tbl.name}
              stroke={tableColor(i)}
              strokeWidth={2}
              dot={{ r: 3 }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
