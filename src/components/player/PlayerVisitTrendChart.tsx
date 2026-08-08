import { useMemo } from "react";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  BarChart,
} from "recharts";
import { fmtDate } from "@/lib/format";

export type VisitTrendRow = {
  key: string;
  date: string | null;
  drop: number;
  result: number;
};

const compact = (n: number) => {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${Math.round(n / 1000)}k`;
  return String(n);
};

const money = (n: number) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n).replace(/,/g, " ");

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Per-visit Drop (bars) + Result (line), plus a visit "rhythm" chart
 * (visits per weekday). Presentation only — all values come from the caller.
 */
export const PlayerVisitTrendChart = ({
  rows,
  rhythmDates,
}: {
  rows: VisitTrendRow[];
  rhythmDates: (string | null)[];
}) => {
  const data = useMemo(
    () =>
      rows
        .slice()
        .sort((a, b) => String(a.date ?? "").localeCompare(String(b.date ?? "")))
        .slice(-40)
        .map(r => ({ ...r, label: r.date ? fmtDate(r.date) : "—" })),
    [rows],
  );

  const rhythm = useMemo(() => {
    const counts = Array(7).fill(0) as number[];
    for (const d of rhythmDates) {
      if (!d) continue;
      const dt = new Date(`${d}T12:00:00`);
      if (Number.isNaN(dt.getTime())) continue;
      counts[dt.getDay()] += 1;
    }
    // Monday-first ordering.
    return [1, 2, 3, 4, 5, 6, 0].map(i => ({ day: WEEKDAYS[i], visits: counts[i] }));
  }, [rhythmDates]);

  if (data.length === 0) {
    return <div className="text-sm text-muted-foreground">No visits in this period.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 10 }} tickFormatter={compact} width={48} />
            <Tooltip
              formatter={(v: number, name: string) => [money(Number(v)), name]}
              contentStyle={{ fontSize: 12 }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="drop" name="Drop" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} />
            <Line
              type="monotone"
              dataKey="result"
              name="Result"
              stroke="hsl(var(--destructive))"
              strokeWidth={2}
              dot={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div>
        <div className="text-xs uppercase text-muted-foreground mb-1">Rhythm — visits by weekday</div>
        <div className="h-[160px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rhythm} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} width={32} />
              <Tooltip contentStyle={{ fontSize: 12 }} />
              <Bar dataKey="visits" name="Visits" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

export default PlayerVisitTrendChart;
