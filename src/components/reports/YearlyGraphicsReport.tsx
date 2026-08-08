/**
 * Statistics → Graphics
 *
 * Yearly overview for the current casino: Jan 1 – Dec 31 of the selected year,
 * 12 monthly points, five smooth lines.
 *
 *   Drop Table    — player_day_drop_cache (single Drop source of truth)
 *   Result Table  — fin_day_closing.tables_result
 *   Drop Slots    — cage_slots_shifts.manual_drop_slots
 *   Result Slots  — fin_day_closing.slots_result
 *   HeadCount     — casino_visits rows per day
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, LineChart as LineChartIcon } from "lucide-react";
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
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
  dropTable: number;
  resultTable: number;
  dropSlots: number;
  resultSlots: number;
  headCount: number;
};

const SERIES = [
  { key: "dropTable", name: "Drop Table", color: "hsl(var(--primary))", axis: "left" },
  { key: "resultTable", name: "Result Table", color: "hsl(var(--success))", axis: "left" },
  { key: "dropSlots", name: "Drop Slots", color: "hsl(var(--info))", axis: "left" },
  { key: "resultSlots", name: "Result Slots", color: "hsl(var(--warning))", axis: "left" },
  { key: "headCount", name: "HeadCount", color: "hsl(var(--destructive))", axis: "right" },
] as const;

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
  const [year, setYear] = useState(() => new Date().getFullYear());
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;

  const { data, isLoading } = useQuery({
    queryKey: ["yearly-graphics", casinoId, year],
    enabled: !!casinoId,
    staleTime: 60_000,
    queryFn: async (): Promise<Point[]> => {
      const empty: Point[] = MONTHS.map(m => ({
        month: m, dropTable: 0, resultTable: 0, dropSlots: 0, resultSlots: 0, headCount: 0,
      }));
      if (!casinoId) return empty;

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

      const out = empty;
      for (const r of dropRows) {
        const i = monthIndex(r.business_date);
        if (i >= 0 && i < 12) out[i].dropTable += Number(r.peak || 0);
      }
      for (const r of (closings.data || []) as any[]) {
        const i = monthIndex(r.business_date);
        if (i < 0 || i > 11) continue;
        out[i].resultTable += Number(r.tables_result || 0);
        out[i].resultSlots += Number(r.slots_result || 0);
      }
      for (const r of (slotShifts.data || []) as any[]) {
        const i = monthIndex(r.business_date);
        if (i >= 0 && i < 12) out[i].dropSlots += Number(r.manual_drop_slots || 0);
      }
      for (const r of visits) {
        const i = monthIndex(r.date);
        if (i >= 0 && i < 12) out[i].headCount += 1;
      }
      return out;
    },
  });

  const points = data || [];

  const totals = useMemo(() => {
    const acc: Record<string, number> = { dropTable: 0, resultTable: 0, dropSlots: 0, resultSlots: 0, headCount: 0 };
    for (const p of points) {
      acc.dropTable += p.dropTable;
      acc.resultTable += p.resultTable;
      acc.dropSlots += p.dropSlots;
      acc.resultSlots += p.resultSlots;
      acc.headCount += p.headCount;
    }
    return acc;
  }, [points]);

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
            disabled={year >= new Date().getFullYear()}
            onClick={() => setYear(y => y + 1)}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      }
    >
      {isLoading && <p className="text-xs text-muted-foreground mb-2">Loading…</p>}

      <div className="h-[440px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={points} margin={{ top: 10, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis
              dataKey="month"
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              tickLine={false}
              axisLine={{ stroke: "hsl(var(--border))" }}
            />
            <YAxis
              yAxisId="left"
              tickFormatter={compact}
              width={60}
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tickFormatter={(v: number) => String(v)}
              width={48}
              tick={{ fontSize: 11, fill: "hsl(var(--destructive))" }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              contentStyle={{
                background: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 8,
                fontSize: 12,
              }}
              formatter={(value: any, name: any) =>
                [name === "HeadCount" ? String(value) : formatNumberSpaces(Number(value)), name]}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} iconType="plainline" />
            {SERIES.map(s => (
              <Line
                key={s.key}
                yAxisId={s.axis}
                type="monotone"
                dataKey={s.key}
                name={s.name}
                stroke={s.color}
                strokeWidth={2}
                dot={{ r: 2.5, strokeWidth: 0, fill: s.color }}
                activeDot={{ r: 5 }}
                connectNulls
                isAnimationActive
                animationDuration={600}
              />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mt-3">
        {SERIES.map(s => (
          <div key={s.key} className="cms-panel p-2.5">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
              <span className="w-2.5 h-0.5 rounded" style={{ background: s.color }} />
              {s.name}
            </div>
            <div className={cn("font-mono tabular-nums text-sm font-semibold mt-1")}>
              {s.key === "headCount"
                ? formatNumberSpaces(totals.headCount)
                : formatNumberSpaces(Math.round(totals[s.key]))}
            </div>
          </div>
        ))}
      </div>

      <p className="text-[10px] text-muted-foreground mt-2 flex items-center gap-1">
        <LineChartIcon className="w-3 h-3" />
        Monthly totals for the selected year · current casino
      </p>
    </PageSection>
  );
};

export default YearlyGraphicsReport;
