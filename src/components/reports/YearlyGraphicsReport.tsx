/**
 * Statistics → Graphics
 *
 * Yearly overview for the current casino: Jan 1 – Dec 31 of the selected year,
 * 12 monthly points.
 *
 *   Drop Table    — player_day_drop_cache (single Drop source of truth)
 *   Result Table  — fin_day_closing.tables_result
 *   Drop Slots    — cage_slots_shifts.manual_drop_slots
 *   Result Slots  — fin_day_closing.slots_result
 *   HeadCount     — casino_visits rows per day (background bars, right axis)
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, LineChart as LineChartIcon } from "lucide-react";
import {
  ComposedChart, Line, Area, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

import { supabase } from "@/integrations/supabase/client";
import { fetchPaged } from "@/lib/fetch-paged";
import { useAuth } from "@/lib/auth-context";
import { PageSection } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/button";
import { formatNumberSpaces } from "@/lib/currency";
import { cn } from "@/lib/utils";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

type Point = {
  month: string;
  dropTable: number | null;
  resultTable: number | null;
  dropSlots: number | null;
  resultSlots: number | null;
  headCount: number | null;
};

type SeriesKey = "dropTable" | "resultTable" | "dropSlots" | "resultSlots" | "headCount";

const SERIES: { key: SeriesKey; name: string; color: string }[] = [
  { key: "dropTable", name: "Drop Table", color: "hsl(var(--chart-blue))" },
  { key: "resultTable", name: "Result Table", color: "hsl(var(--chart-green))" },
  { key: "dropSlots", name: "Drop Slots", color: "hsl(var(--chart-violet))" },
  { key: "resultSlots", name: "Result Slots", color: "hsl(var(--chart-pink))" },
  { key: "headCount", name: "HeadCount", color: "hsl(var(--chart-grey))" },
];

const compact = (v: number): string => {
  const abs = Math.abs(v);
  if (abs >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
  return String(Math.round(v));
};

const monthIndex = (d: string) => Number(d.slice(5, 7)) - 1;

const YearlyGraphicsReport = () => {
  const { casinoId } = useAuth();
  const now = new Date();
  const [year, setYear] = useState(() => now.getFullYear());
  const [hidden, setHidden] = useState<Set<SeriesKey>>(new Set());
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;

  // Only completed months are plotted — the running month is left blank.
  const lastMonth = year === now.getFullYear() ? now.getMonth() - 1 : 11;

  const toggle = (k: SeriesKey) =>
    setHidden(prev => {
      const next = new Set(prev);
      next.has(k) ? next.delete(k) : next.add(k);
      return next;
    });

  const { data, isLoading } = useQuery({
    queryKey: ["yearly-graphics", casinoId, year],
    enabled: !!casinoId,
    staleTime: 60_000,
    queryFn: async (): Promise<Point[]> => {
      const acc = MONTHS.map(m => ({
        month: m, dropTable: 0, resultTable: 0, dropSlots: 0, resultSlots: 0, headCount: 0,
      }));
      if (!casinoId) return acc;

      const [dropRows, closings, slotShifts, visits] = await Promise.all([
        fetchPaged<{ business_date: string; peak: number | string | null }>((a, b) =>
          supabase.from("player_day_drop_cache")
            .select("business_date, peak")
            .eq("casino_id", casinoId)
            .gte("business_date", from).lte("business_date", to)
            .order("business_date", { ascending: true })
            .range(a, b)),
        supabase.from("fin_day_closing")
          .select("business_date, tables_result, slots_result")
          .eq("casino_id", casinoId)
          .gte("business_date", from).lte("business_date", to),
        supabase.from("cage_slots_shifts")
          .select("business_date, manual_drop_slots")
          .eq("casino_id", casinoId)
          .gte("business_date", from).lte("business_date", to),
        fetchPaged<{ date: string }>((a, b) =>
          supabase.from("casino_visits")
            .select("date")
            .eq("casino_id", casinoId)
            .gte("date", from).lte("date", to)
            .order("date", { ascending: true })
            .range(a, b)),
      ]);

      for (const r of dropRows) {
        const i = monthIndex(r.business_date);
        if (i >= 0 && i < 12) acc[i].dropTable += Number(r.peak || 0);
      }
      for (const r of (closings.data || []) as any[]) {
        const i = monthIndex(r.business_date);
        if (i < 0 || i > 11) continue;
        acc[i].resultTable += Number(r.tables_result || 0);
        acc[i].resultSlots += Number(r.slots_result || 0);
      }
      for (const r of (slotShifts.data || []) as any[]) {
        const i = monthIndex(r.business_date);
        if (i >= 0 && i < 12) acc[i].dropSlots += Number(r.manual_drop_slots || 0);
      }
      for (const r of visits) {
        const i = monthIndex(r.date);
        if (i >= 0 && i < 12) acc[i].headCount += 1;
      }
      return acc;
    },
  });

  const raw = data || [];

  // Blank-out future months so lines stop at the current month instead of dropping to zero.
  const points: Point[] = useMemo(
    () =>
      (raw.length ? raw : MONTHS.map(m => ({
        month: m, dropTable: 0, resultTable: 0, dropSlots: 0, resultSlots: 0, headCount: 0,
      }))).map((p, i) =>
        i > lastMonth
          ? { month: p.month, dropTable: null, resultTable: null, dropSlots: null, resultSlots: null, headCount: null }
          : p),
    [raw, lastMonth],
  );

  const totals = useMemo(() => {
    const acc: Record<SeriesKey, number> = {
      dropTable: 0, resultTable: 0, dropSlots: 0, resultSlots: 0, headCount: 0,
    };
    for (const p of points) {
      for (const s of SERIES) acc[s.key] += Number(p[s.key] || 0);
    }
    return acc;
  }, [points]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const row = payload[0]?.payload as Point;
    const totalDrop = Number(row.dropTable || 0) + Number(row.dropSlots || 0);
    const totalResult = Number(row.resultTable || 0) + Number(row.resultSlots || 0);
    return (
      <div className="rounded-lg border border-border bg-card/95 backdrop-blur px-3 py-2 shadow-lg text-xs">
        <div className="font-semibold mb-1.5">{label} {year}</div>
        <div className="space-y-1">
          {SERIES.filter(s => !hidden.has(s.key)).map(s => (
            <div key={s.key} className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: s.color }} />
              <span className="text-muted-foreground flex-1">{s.name}</span>
              <span className="font-mono tabular-nums">
                {s.key === "headCount"
                  ? formatNumberSpaces(Number(row.headCount || 0))
                  : formatNumberSpaces(Math.round(Number(row[s.key] || 0)))}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-1.5 pt-1.5 border-t border-border space-y-1">
          <div className="flex items-center gap-4 justify-between">
            <span className="text-muted-foreground">Total Drop</span>
            <span className="font-mono tabular-nums">{formatNumberSpaces(Math.round(totalDrop))}</span>
          </div>
          <div className="flex items-center gap-4 justify-between">
            <span className="text-muted-foreground">Total Result</span>
            <span className="font-mono tabular-nums">{formatNumberSpaces(Math.round(totalResult))}</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <PageSection
      title={`Yearly overview · ${year}`}
      titleRight={
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setYear(y => y - 1)}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="font-mono text-sm w-14 text-center">{year}</span>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            disabled={year >= now.getFullYear()}
            onClick={() => setYear(y => y + 1)}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      }
    >
      {isLoading && <p className="text-xs text-muted-foreground mb-2">Loading…</p>}

      {/* Interactive legend */}
      <div className="flex flex-wrap items-center gap-2 mb-2">
        {SERIES.map(s => {
          const off = hidden.has(s.key);
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => toggle(s.key)}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-colors",
                off
                  ? "border-border text-muted-foreground/60 opacity-60"
                  : "border-border bg-muted/40 text-foreground",
              )}
            >
              <span
                className="w-2.5 h-2.5 rounded-sm"
                style={{ background: off ? "hsl(var(--muted-foreground))" : s.color, opacity: off ? 0.4 : 1 }}
              />
              {s.name}
            </button>
          );
        })}
      </div>

      <div className="h-[480px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={points} margin={{ top: 16, right: 16, bottom: 8, left: 4 }}>
            <defs>
              <linearGradient id="gradDropTable" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.28} />
                <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="2 6" stroke="hsl(var(--border))" opacity={0.5} vertical={false} />
            <XAxis
              dataKey="month"
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              tickLine={false}
              axisLine={{ stroke: "hsl(var(--border))" }}
              dy={4}
            />
            <YAxis
              yAxisId="left"
              tickFormatter={compact}
              width={62}
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tickFormatter={(v: number) => compact(v)}
              width={46}
              allowDecimals={false}
              domain={[0, (max: number) => Math.max(10, Math.ceil(max * 2))]}
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ stroke: "hsl(var(--border))", strokeWidth: 1 }} />

            <Bar
              yAxisId="right"
              dataKey="headCount"
              name="HeadCount"
              fill="hsl(var(--muted-foreground))"
              fillOpacity={0.22}
              barSize={18}
              radius={[3, 3, 0, 0]}
              hide={hidden.has("headCount")}
              isAnimationActive
              animationDuration={500}
            />

            <Area
              yAxisId="left"
              type="natural"
              dataKey="dropTable"
              name="Drop Table"
              stroke="hsl(var(--primary))"
              strokeWidth={2.5}
              fill="url(#gradDropTable)"
              dot={false}
              activeDot={{ r: 5, strokeWidth: 0 }}
              connectNulls={false}
              hide={hidden.has("dropTable")}
              isAnimationActive
              animationDuration={700}
            />

            {SERIES.filter(s => s.key !== "headCount" && s.key !== "dropTable").map(s => (
              <Line
                key={s.key}
                yAxisId="left"
                type="natural"
                dataKey={s.key}
                name={s.name}
                stroke={s.color}
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 5, strokeWidth: 0 }}
                connectNulls={false}
                hide={hidden.has(s.key)}
                isAnimationActive
                animationDuration={700}
              />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mt-3">
        {SERIES.map(s => {
          const off = hidden.has(s.key);
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => toggle(s.key)}
              className={cn("cms-panel p-2.5 text-left transition-opacity", off && "opacity-50")}
            >
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                <span className="w-2.5 h-0.5 rounded" style={{ background: s.color }} />
                {s.name}
              </div>
              <div className="font-mono tabular-nums text-sm font-semibold mt-1">
                {formatNumberSpaces(Math.round(totals[s.key]))}
              </div>
            </button>
          );
        })}
      </div>

      <p className="text-[10px] text-muted-foreground mt-2 flex items-center gap-1">
        <LineChartIcon className="w-3 h-3" />
        Monthly totals for the selected year · current casino · click legend or tiles to toggle series
      </p>
    </PageSection>
  );
};

export default YearlyGraphicsReport;
