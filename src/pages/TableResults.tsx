import { Fragment, useEffect, useMemo, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { useSessionState } from "@/hooks/use-session-state";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useDailyResults } from "@/hooks/use-import-reports";
import { formatSpaced } from "@/lib/import-helpers";
import { CalendarIcon, ChevronRight, Loader2, FileSpreadsheet, FileText, Filter } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { downloadXlsx } from "@/lib/excel-export";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { fmtDate, fmtWeekdayShort } from "@/lib/format-date";
import { useAuth } from "@/lib/auth-context";
import { useCasino } from "@/lib/casino-context";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchPaged } from "@/lib/fetch-paged";
import { GAME_GROUP_ORDER, gameGroupOf, naturalCompare, type GameGroup } from "@/lib/table-game-group";

/* ------------------------------------------------------------------ */
/* Layout config — order of columns in the horizontal report          */
/* ------------------------------------------------------------------ */
type GroupKey0 = GameGroup;
const GROUP_ORDER: GroupKey0[] = GAME_GROUP_ORDER;
const tint = (v: string, a: number) =>
  `[background-image:linear-gradient(hsl(var(--${v})/${a}),hsl(var(--${v})/${a})),linear-gradient(hsl(var(--muted)),hsl(var(--muted)))]`;
const GROUPS: Record<GroupKey0, {
  label: string; short: string;
  sub: "amber" | "emerald" | "rose" | "info" | "other";
  tot: "warning" | "success" | "destructive" | "info" | "other";
  headBg: string;
}> = {
  AR: { label: "American Roulette", short: "AR", sub: "amber", tot: "warning", headBg: "[background-image:linear-gradient(hsl(var(--warning)/0.12),hsl(var(--warning)/0.12)),linear-gradient(hsl(var(--muted)),hsl(var(--muted)))]" },
  PK: { label: "Poker (PK)", short: "PK", sub: "emerald", tot: "success", headBg: "[background-image:linear-gradient(hsl(var(--success)/0.12),hsl(var(--success)/0.12)),linear-gradient(hsl(var(--muted)),hsl(var(--muted)))]" },
  BJ: { label: "Blackjack", short: "BJ", sub: "rose", tot: "destructive", headBg: "[background-image:linear-gradient(hsl(var(--destructive)/0.12),hsl(var(--destructive)/0.12)),linear-gradient(hsl(var(--muted)),hsl(var(--muted)))]" },
  NIU: { label: "Niu Niu", short: "NIU", sub: "other", tot: "other", headBg: "[background-image:linear-gradient(hsl(var(--primary)/0.12),hsl(var(--primary)/0.12)),linear-gradient(hsl(var(--muted)),hsl(var(--muted)))]" },
  BAC: { label: "Baccarat", short: "BAC", sub: "info", tot: "info", headBg: "[background-image:linear-gradient(hsl(var(--info)/0.10),hsl(var(--info)/0.10)),linear-gradient(hsl(var(--muted)),hsl(var(--muted)))]" },
  CLUB: { label: "Club Poker", short: "CLUB", sub: "info", tot: "info", headBg: "[background-image:linear-gradient(hsl(var(--info)/0.18),hsl(var(--info)/0.18)),linear-gradient(hsl(var(--muted)),hsl(var(--muted)))]" },
  OTHER: { label: "Other Games", short: "OTHER", sub: "other", tot: "other", headBg: "[background-image:linear-gradient(hsl(var(--accent-foreground)/0.10),hsl(var(--accent-foreground)/0.10)),linear-gradient(hsl(var(--muted)),hsl(var(--muted)))]" },
};
void tint;

export const tableGroupOf = (name: string): GroupKey0 => gameGroupOf(name);

const PRESETS = [
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "year", label: "Year" },
  { key: "custom", label: "Custom" },
] as const;
type PresetKey = (typeof PRESETS)[number]["key"];

const isoDate = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};
const todayStr = () => isoDate(new Date());
const daysAgoStr = (n: number) => isoDate(new Date(Date.now() - n * 86400000));

/** Returns Sunday→Saturday week containing the given date (local time). */
const weekRangeFor = (d: Date): { from: string; to: string } => {
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  start.setDate(start.getDate() - start.getDay()); // Sunday
  const end = new Date(start);
  end.setDate(start.getDate() + 6); // Saturday
  return { from: isoDate(start), to: isoDate(end) };
};

/** ISO date → Sunday of that week (for week-grouping borders). */
const weekKey = (iso: string) => {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() - d.getDay());
  return isoDate(d);
};

const presetRange = (
  key: PresetKey,
  weekAnchor: Date,
  monthAnchor: Date,
  yearAnchor: Date,
): { from: string; to: string } => {
  switch (key) {
    case "week":
      return weekRangeFor(weekAnchor);
    case "month": {
      const first = new Date(monthAnchor.getFullYear(), monthAnchor.getMonth(), 1);
      const last = new Date(monthAnchor.getFullYear(), monthAnchor.getMonth() + 1, 0);
      return { from: isoDate(first), to: isoDate(last) };
    }
    case "year": {
      const first = new Date(yearAnchor.getFullYear(), 0, 1);
      const last = new Date(yearAnchor.getFullYear(), 11, 31);
      return { from: isoDate(first), to: isoDate(last) };
    }
    default: {
      const now = new Date();
      const first = isoDate(new Date(now.getFullYear(), now.getMonth(), 1));
      return { from: first, to: todayStr() };
    }
  }
};

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */
type Row = {
  id: string;
  date: string;
  table_id: string;
  open: number;
  fill: number;
  credit: number;
  close: number;
  drop_amount: number;
  result: number;
  source: string;
  gaming_tables?: { name?: string; game?: string } | null;
};

type DayCell = {
  drop: number;
  result: number;
  hasData: boolean;
};

type GroupKey = GroupKey0;

type DayBucket = {
  date: string;
  cells: Record<string, DayCell>; // by table name
  fullRows: Row[];                // for inline drilldown
  totalResult: number;            // all tables, regardless of filters
};

const emptyCell: DayCell = { drop: 0, result: 0, hasData: false };

const holdPct = (drop: number, result: number) =>
  drop > 0 ? (result / drop) * 100 : 0;

const dayName = (iso: string) => fmtWeekdayShort(iso);

/* ------------------------------------------------------------------ */

interface TableResultsProps {
  embedded?: boolean;
  embeddedFrom?: string;
  embeddedTo?: string;
}

type SortKey = string; // "date" | "all" | "g:AR" | "t:P1"

const TableResults = ({ embedded = false, embeddedFrom, embeddedTo }: TableResultsProps = {}) => {
  const { roles, casinoId } = useAuth();
  // Per-table Drop = raw Σ IN transactions per table (shown for ALL casinos).
  const isSurveillanceOnly = roles.includes("surveillance" as any) &&
    !roles.some((r) => ["manager", "super_admin", "finance_manager"].includes(r as string));
  const currentYear = new Date().getFullYear();
  const visiblePresets = isSurveillanceOnly
    ? PRESETS.filter((p) => p.key !== "custom")
    : PRESETS;

  const [preset, setPreset] = useSessionState<PresetKey>("preset", "month");
  const [weekAnchor, setWeekAnchor] = useState<Date>(new Date());
  const [monthAnchor, setMonthAnchor] = useState<Date>(new Date());
  const [yearAnchor, setYearAnchor] = useState<Date>(new Date());
  const [customFrom, setCustomFrom] = useSessionState<string>("customFrom", daysAgoStr(29));
  const [customTo, setCustomTo] = useSessionState<string>("customTo", todayStr());
  const [openDate, setOpenDate] = useState<string | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "date", dir: "asc" });

  /* Hidden groups / tables — remembered per casino on this device */
  const filterKey = `table-results-filter:${casinoId ?? "none"}`;
  const [hiddenGroups, setHiddenGroups] = useState<GroupKey[]>([]);
  const [hiddenTables, setHiddenTables] = useState<string[]>([]);
  const [showPerTableDrop, setShowPerTableDrop] = useState(true);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(filterKey);
      const v = raw ? JSON.parse(raw) : {};
      setHiddenGroups(Array.isArray(v.groups) ? v.groups : []);
      setHiddenTables(Array.isArray(v.tables) ? v.tables : []);
      setShowPerTableDrop(v.drop !== false);
    } catch {
      setHiddenGroups([]); setHiddenTables([]);
    }
  }, [filterKey]);
  const saveFilters = (groups: GroupKey[], tables: string[], drop: boolean = showPerTableDrop) => {
    setHiddenGroups(groups); setHiddenTables(tables); setShowPerTableDrop(drop);
    try { localStorage.setItem(filterKey, JSON.stringify({ groups, tables, drop })); } catch { /* ignore */ }
  };

  // Surveillance: clamp anchors to current calendar year, force off custom preset
  useEffect(() => {
    if (!isSurveillanceOnly) return;
    if (preset === "custom") setPreset("month");
    if (weekAnchor.getFullYear() !== currentYear) setWeekAnchor(new Date());
    if (monthAnchor.getFullYear() !== currentYear) setMonthAnchor(new Date());
    if (yearAnchor.getFullYear() !== currentYear) setYearAnchor(new Date(currentYear, 0, 1));
  }, [isSurveillanceOnly, preset, weekAnchor, monthAnchor, yearAnchor, currentYear]);

  const computed =
    preset === "custom"
      ? { from: customFrom, to: customTo }
      : presetRange(preset, weekAnchor, monthAnchor, yearAnchor);
  const from = embedded && embeddedFrom ? embeddedFrom : computed.from;
  const to = embedded && embeddedTo ? embeddedTo : computed.to;

  const { data = [], isLoading } = useDailyResults(from, to);

  /* Total Drop — SINGLE source of truth: `player_day_drop_cache` (matches
   * Player Statistics). */
  const { data: dropByDate = new Map<string, number>() } = useQuery({
    queryKey: ["table-results-drop-cache", casinoId, from, to],
    queryFn: async (): Promise<Map<string, number>> => {
      const m = new Map<string, number>();
      if (!casinoId || !from || !to) return m;
      const rows = await fetchPaged<any>((pageFrom, pageTo) => supabase
        .from("player_day_drop_cache")
        .select("business_date, peak")
        .eq("casino_id", casinoId)
        .gte("business_date", from)
        .lte("business_date", to)
        .order("business_date", { ascending: true })
        .order("player_id")
        .range(pageFrom, pageTo)
      );
      (rows ?? []).forEach((r: any) => {
        m.set(r.business_date, (m.get(r.business_date) || 0) + Number(r.peak || 0));
      });
      return m;
    },
    enabled: !!casinoId && !!from && !!to,
    staleTime: 30_000,
  });

  /* Per-table Drop = raw Σ IN transactions per (business_date, table_id).
   * type in ('in','buy'), cancelled_at IS NULL. Simple sum — no NEP-split. */
  const { data: inByDateTable = new Map<string, Map<string, number>>() } = useQuery({
    queryKey: ["table-results-in-by-table", casinoId, from, to],
    queryFn: async (): Promise<Map<string, Map<string, number>>> => {
      const m = new Map<string, Map<string, number>>();
      if (!casinoId || !from || !to) return m;
      const rows = await fetchPaged<any>((pageFrom, pageTo) => supabase
        .from("transactions")
        .select("business_date, table_id, type, amount, cancelled_at")
        .eq("casino_id", casinoId)
        .gte("business_date", from)
        .lte("business_date", to)
        .in("type", ["in", "buy"])
        .is("cancelled_at", null)
        .order("id")
        .range(pageFrom, pageTo)
      );
      (rows ?? []).forEach((r: any) => {
        if (!r.business_date || !r.table_id) return;
        let inner = m.get(r.business_date);
        if (!inner) { inner = new Map(); m.set(r.business_date, inner); }
        inner.set(r.table_id, (inner.get(r.table_id) || 0) + (Number(r.amount) || 0));
      });
      return m;
    },
    enabled: !!casinoId && !!from && !!to,
    staleTime: 30_000,
  });

  /* Build full date range — fill missing days with empty buckets so gaps are visible. */
  const allDates = useMemo(() => {
    const out: string[] = [];
    if (!from || !to) return out;
    const start = new Date(from + "T12:00:00");
    const end = new Date(to + "T12:00:00");
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) return out;
    const todayIso = todayStr();
    const cur = new Date(start);
    while (cur <= end) {
      const iso = isoDate(cur);
      if (iso <= todayIso) out.push(iso);
      cur.setDate(cur.getDate() + 1);
    }
    return out;
  }, [from, to]);

  /* Every table that has results in the period, grouped by game */
  const tablesByGroup = useMemo(() => {
    const names = new Set<string>();
    for (const r of data as Row[]) {
      const n = r.gaming_tables?.name;
      if (n) names.add(n);
    }
    const out: Record<GroupKey, string[]> = { AR: [], PK: [], BJ: [], NIU: [], BAC: [], CLUB: [], OTHER: [] };
    for (const n of names) out[tableGroupOf(n)].push(n);
    for (const g of GROUP_ORDER) out[g].sort(naturalCompare);
    return out;
  }, [data]);

  /* Visible columns after group/table filters */
  const visibleGroups = useMemo(
    () =>
      GROUP_ORDER
        .filter((g) => !hiddenGroups.includes(g))
        .map((g) => ({ key: g, tables: tablesByGroup[g].filter((t) => !hiddenTables.includes(t)) }))
        .filter((g) => g.tables.length > 0),
    [tablesByGroup, hiddenGroups, hiddenTables],
  );
  const visibleTables = visibleGroups.flatMap((g) => g.tables);

  /* Group rows by date */
  const buckets: DayBucket[] = useMemo(() => {
    const byDate: Record<string, Row[]> = {};
    for (const r of data as Row[]) (byDate[r.date] ||= []).push(r);
    for (const d of allDates) if (!byDate[d]) byDate[d] = [];
    return Object.entries(byDate).map(([date, rows]) => {
      const cells: Record<string, DayCell> = {};
      const byName = new Map<string, Row>();
      for (const r of rows) {
        const n = r.gaming_tables?.name;
        if (!n) continue;
        const existing = byName.get(n);
        if (!existing || r.id.localeCompare(existing.id) > 0) byName.set(n, r);
      }
      const dayIn = inByDateTable.get(date);
      let totalResult = 0;
      for (const [name, r] of byName.entries()) {
        const res = Number(r.result || 0);
        cells[name] = { drop: Number(dayIn?.get(r.table_id) || 0), result: res, hasData: true };
        totalResult += res;
      }
      return { date, cells, fullRows: rows, totalResult };
    });
  }, [data, allDates, inByDateTable]);

  const groupResult = (b: DayBucket, tables: string[]) =>
    tables.reduce((s, t) => s + (b.cells[t]?.result || 0), 0);
  const groupDrop = (b: DayBucket, tables: string[]) =>
    tables.reduce((s, t) => s + (b.cells[t]?.drop || 0), 0);

  /* Sorted rows */
  const sortedBuckets = useMemo(() => {
    const val = (b: DayBucket): number | string => {
      if (sort.key === "date") return b.date;
      if (sort.key === "all") return b.totalResult;
      if (sort.key.startsWith("g:")) {
        const g = visibleGroups.find((x) => x.key === sort.key.slice(2));
        return g ? groupResult(b, g.tables) : 0;
      }
      return b.cells[sort.key.slice(2)]?.result || 0;
    };
    const list = [...buckets];
    list.sort((a, b) => {
      const va = val(a), vb = val(b);
      const c = typeof va === "string" ? va.localeCompare(vb as string) : (va as number) - (vb as number);
      const r = sort.dir === "asc" ? c : -c;
      return r !== 0 ? r : a.date.localeCompare(b.date);
    });
    return list;
  }, [buckets, sort, visibleGroups]);
  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "date" ? "asc" : "desc" }));
  const sortMark = (key: SortKey) => (sort.key === key ? (sort.dir === "asc" ? " ▲" : " ▼") : "");

  /* Period totals (header row) */
  const totals = useMemo(() => {
    const cellsTotal: Record<string, { drop: number; result: number }> = {};
    let totalResult = 0;
    for (const b of buckets) {
      for (const [name, c] of Object.entries(b.cells)) {
        const acc = (cellsTotal[name] ||= { drop: 0, result: 0 });
        acc.drop += c.drop;
        acc.result += c.result;
      }
      totalResult += b.totalResult;
    }
    return { cellsTotal, totalResult };
  }, [buckets]);
  const groupTotal = (tables: string[]) =>
    tables.reduce((s, t) => s + (totals.cellsTotal[t]?.result || 0), 0);
  const groupTotalDrop = (tables: string[]) =>
    tables.reduce((s, t) => s + (totals.cellsTotal[t]?.drop || 0), 0);

  const periodTotalDrop = useMemo(() => {
    let s = 0;
    dropByDate.forEach((v) => { s += v; });
    return s;
  }, [dropByDate]);
  const dropForDay = (date: string) => dropByDate.get(date) ?? 0;

  const allTablesFlat = GROUP_ORDER.flatMap((g) => tablesByGroup[g]);
  const hasFilters = hiddenGroups.length > 0 || hiddenTables.length > 0;
  const pct = (d: number, r: number) => (d > 0 ? Number(((r / d) * 100).toFixed(2)) : "");

  const exportExcel = () => {
    const header: (string | number)[] = ["Date", "Weekday"];
    for (const t of visibleTables) header.push(...(showPerTableDrop ? [`${t} Drop`, `${t} Result`, `${t} Hold%`] : [`${t} Result`]));
    for (const g of visibleGroups) header.push(...(showPerTableDrop ? [`${g.key} Drop`, `${g.key} Result`] : [`${g.key} Result`]));
    header.push("Total Drop", "Total Result", "Total Hold%");
    const rows: (string | number | null)[][] = [header];
    for (const b of sortedBuckets) {
      const r: (string | number | null)[] = [b.date, dayName(b.date)];
      for (const t of visibleTables) {
        const c = b.cells[t];
        if (!showPerTableDrop) r.push(c?.hasData ? c.result : "");
        else if (c?.hasData) r.push(c.drop, c.result, pct(c.drop, c.result));
        else r.push("", "", "");
      }
      for (const g of visibleGroups) r.push(...(showPerTableDrop ? [groupDrop(b, g.tables)] : []), groupResult(b, g.tables));
      const dayTot = dropForDay(b.date);
      r.push(dayTot, b.totalResult, pct(dayTot, b.totalResult));
      rows.push(r);
    }
    const totalsRow: (string | number | null)[] = ["TOTAL", ""];
    for (const t of visibleTables) {
      const c = totals.cellsTotal[t];
      if (!showPerTableDrop) totalsRow.push(c ? c.result : "");
      else if (c) totalsRow.push(c.drop, c.result, pct(c.drop, c.result));
      else totalsRow.push("", "", "");
    }
    for (const g of visibleGroups) totalsRow.push(...(showPerTableDrop ? [groupTotalDrop(g.tables)] : []), groupTotal(g.tables));
    totalsRow.push(periodTotalDrop, totals.totalResult, pct(periodTotalDrop, totals.totalResult));
    rows.push([]);
    rows.push(totalsRow);
    downloadXlsx(`table-results_${from}_${to}.xlsx`, [{ name: "Table Results", rows }]);
  };

  return (
    <div className="space-y-3 h-full flex flex-col">
      {!embedded && (
        <PageHeader
          icon={FileText}
          title="Table Results"
          subtitle="Daily Drop / Result / Hold% per table — combined from imports and live shifts"
          date
        />
      )}

      {/* Filters */}
      <Card className="p-3 md:p-4">
        <div className="flex items-end gap-2 flex-wrap">
          {!embedded && (
            <div className="flex gap-1 flex-wrap">
              {visiblePresets.map((p) => (
                <Button
                  key={p.key}
                  size="sm"
                  variant={preset === p.key ? "default" : "outline"}
                  onClick={() => setPreset(p.key)}
                  className="h-8"
                >
                  {p.label}
                </Button>
              ))}
            </div>
          )}
          {!embedded && preset === "week" && (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 gap-1.5">
                  <CalendarIcon className="w-3.5 h-3.5" />
                  Pick week ({format(weekAnchor, "MMM d")})
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={weekAnchor}
                  onSelect={(d) => d && setWeekAnchor(d)}
                  weekStartsOn={0}
                  initialFocus
                  disabled={isSurveillanceOnly ? (date) => date.getFullYear() !== currentYear : undefined}
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
          )}

          {!embedded && preset === "month" && (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 gap-1.5">
                  <CalendarIcon className="w-3.5 h-3.5" />
                  Pick month ({format(monthAnchor, "MMM yyyy")})
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <div className="p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={isSurveillanceOnly}
                      onClick={() =>
                        setMonthAnchor(new Date(monthAnchor.getFullYear() - 1, monthAnchor.getMonth(), 1))
                      }
                    >
                      ‹
                    </Button>
                    <div className="text-sm font-semibold">{monthAnchor.getFullYear()}</div>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={isSurveillanceOnly}
                      onClick={() =>
                        setMonthAnchor(new Date(monthAnchor.getFullYear() + 1, monthAnchor.getMonth(), 1))
                      }
                    >
                      ›
                    </Button>
                  </div>
                  <div className="grid grid-cols-3 gap-1 w-56">
                    {Array.from({ length: 12 }).map((_, m) => {
                      const isActive = monthAnchor.getMonth() === m;
                      const label = new Date(2000, m, 1).toLocaleDateString("en-US", { month: "short" });
                      return (
                        <Button
                          key={m}
                          size="sm"
                          variant={isActive ? "default" : "outline"}
                          className="h-8"
                          onClick={() => setMonthAnchor(new Date(monthAnchor.getFullYear(), m, 1))}
                        >
                          {label}
                        </Button>
                      );
                    })}
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          )}

          {!embedded && preset === "year" && (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 gap-1.5">
                  <CalendarIcon className="w-3.5 h-3.5" />
                  Pick year ({yearAnchor.getFullYear()})
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <div className="p-3 grid grid-cols-3 gap-1 w-56">
                  {(isSurveillanceOnly
                    ? [currentYear]
                    : Array.from({ length: 12 }, (_, i) => new Date().getFullYear() - 8 + i)
                  ).map((y) => {
                    const isActive = yearAnchor.getFullYear() === y;
                    return (
                      <Button
                        key={y}
                        size="sm"
                        variant={isActive ? "default" : "outline"}
                        className="h-8"
                        onClick={() => setYearAnchor(new Date(y, 0, 1))}
                      >
                        {y}
                      </Button>
                    );
                  })}
                </div>
              </PopoverContent>
            </Popover>
          )}

          {!embedded && preset === "custom" && (
            <>
              <div>
                <Label className="text-xs">From</Label>
                <Input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="h-8 w-40"
                />
              </div>
              <div>
                <Label className="text-xs">To</Label>
                <Input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="h-8 w-40"
                />
              </div>
            </>
          )}
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {from} → {to} · {buckets.length} {buckets.length === 1 ? "day" : "days"}
            </span>
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5"
              disabled={buckets.length === 0}
              onClick={exportExcel}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" /> Export Excel
            </Button>
          </div>
        </div>

        {/* Game groups + tables filter */}
        {allTablesFlat.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap mt-3 pt-3 border-t border-border/60">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground mr-1">Games</span>
            {GROUP_ORDER.filter((g) => tablesByGroup[g].length > 0).map((g) => {
              const on = !hiddenGroups.includes(g);
              return (
                <Button
                  key={g}
                  size="sm"
                  variant={on ? "default" : "outline"}
                  className="h-7 px-2.5 text-xs"
                  onClick={() =>
                    saveFilters(on ? [...hiddenGroups, g] : hiddenGroups.filter((x) => x !== g), hiddenTables)
                  }
                >
                  {GROUPS[g].short} <span className="ml-1 opacity-70">{tablesByGroup[g].length}</span>
                </Button>
              );
            })}
            <Popover>
              <PopoverTrigger asChild>
                <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs gap-1">
                  <Filter className="w-3 h-3" /> Tables
                  {hiddenTables.length > 0 && <span className="opacity-70">({hiddenTables.length} hidden)</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-3" align="start">
                <div className="space-y-3 max-h-80 overflow-auto">
                  {GROUP_ORDER.filter((g) => tablesByGroup[g].length > 0).map((g) => (
                    <div key={g}>
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">{GROUPS[g].label}</div>
                      <div className="grid grid-cols-3 gap-1.5">
                        {tablesByGroup[g].map((t) => {
                          const on = !hiddenTables.includes(t);
                          return (
                            <label key={t} className="flex items-center gap-1.5 text-xs font-mono cursor-pointer">
                              <Checkbox
                                checked={on}
                                onCheckedChange={() =>
                                  saveFilters(hiddenGroups, on ? [...hiddenTables, t] : hiddenTables.filter((x) => x !== t))
                                }
                              />
                              {t}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
            <Button
              size="sm"
              variant={showPerTableDrop ? "secondary" : "outline"}
              className="h-7 px-2 text-xs"
              onClick={() => saveFilters(hiddenGroups, hiddenTables, !showPerTableDrop)}
            >
              Drop
            </Button>
            {hasFilters && (
              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => saveFilters([], [], showPerTableDrop)}>
                Show all
              </Button>
            )}
          </div>
        )}
      </Card>

      {/* Loading */}
      {isLoading && (
        <div className="flex justify-center py-10">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Empty */}
      {!isLoading && buckets.length === 0 && (
        <Card className="p-10 text-center text-sm text-muted-foreground">
          No results in the selected range.
        </Card>
      )}

      {/* Excel-style horizontal report */}
      {!isLoading && buckets.length > 0 && (
        <Card className="p-0 overflow-hidden">
          <div className="overflow-x-auto [container-type:inline-size] relative">
            <table className="w-full caption-bottom text-[13px] tabular-nums [&_tbody_tr]:transition-colors [&_tbody_tr:hover]:bg-primary/[0.06] [&_th]:h-8 [&_th]:px-2 [&_td]:p-2 [&_thead_th]:sticky [&_tbody_tr]:border-b [&_tbody_tr]:border-border/60">
              <TableHeader>
                <TableRow className="bg-muted hover:bg-muted">
                  <TableHead
                    className="sticky left-0 top-0 bg-muted z-30 w-36 min-w-36 border-r-2 border-r-border whitespace-nowrap cursor-pointer select-none"
                    onClick={() => toggleSort("date")}
                  >
                    Date{sortMark("date")}
                  </TableHead>
                  {visibleGroups.map((g) => (
                    <TableHead
                      key={g.key}
                      colSpan={g.tables.length}
                      className={cn("sticky top-0 z-20 text-center font-semibold border-r-2 border-r-border", GROUPS[g.key].headBg)}
                    >
                      {GROUPS[g.key].label}
                    </TableHead>
                  ))}
                  <TableHead
                    colSpan={1}
                    className="sticky top-0 z-20 text-center font-semibold [background-image:linear-gradient(hsl(var(--primary)/0.22),hsl(var(--primary)/0.22)),linear-gradient(hsl(var(--muted)),hsl(var(--muted)))]"
                  >
                    Total Tables
                  </TableHead>
                </TableRow>

                <TableRow className="bg-muted hover:bg-muted">
                  <TableHead className="sticky left-0 top-8 bg-muted z-30 w-36 min-w-36 border-r-2 border-r-border" />
                  {visibleGroups.map((g) =>
                    g.tables.map((t, i) => (
                      <SubHead
                        key={t}
                        name={(g.key === "PK" ? t.replace(/^P/i, "PK") : g.key === "CLUB" ? "CLUB" : t) + sortMark(`t:${t}`)}
                        accent={GROUPS[g.key].sub}
                        groupEnd={i === g.tables.length - 1}
                        onClick={() => toggleSort(`t:${t}`)}
                      />
                    )),
                  )}
                  <SubHead name={"ALL" + sortMark("all")} accent="primary" bold onClick={() => toggleSort("all")} />
                </TableRow>

                <TableRow className="bg-primary/10 hover:bg-primary/10 border-b-2 border-b-primary/40">
                  <TableHead className="sticky left-0 top-16 z-30 border-r-2 border-r-border text-[10px] uppercase tracking-wide font-semibold whitespace-nowrap [background-image:linear-gradient(hsl(var(--primary)/0.3),hsl(var(--primary)/0.3)),linear-gradient(hsl(var(--muted)),hsl(var(--muted)))]">
                    Σ Period ({buckets.length}d)
                  </TableHead>
                  {visibleGroups.map((g) =>
                    g.tables.map((t, i) => {
                      const c = totals.cellsTotal[t] || { drop: 0, result: 0 };
                      return <DRHeadCell key={t} drop={c.drop} result={c.result} groupEnd={i === g.tables.length - 1} alwaysShowDrop={showPerTableDrop} />;
                    }),
                  )}
                  <DRHeadCell drop={periodTotalDrop} result={totals.totalResult} bold alwaysShowDrop />
                </TableRow>
                <TableRow className="bg-muted hover:bg-muted border-b border-border">
                  <TableHead className="sticky left-0 top-24 z-30 bg-muted border-r-2 border-r-border text-[10px] uppercase font-semibold whitespace-nowrap">
                    Σ by group
                  </TableHead>
                  {visibleGroups.map((g) => (
                    <GroupTotalCells
                      key={g.key}
                      colSpan={g.tables.length}
                      drop={groupTotalDrop(g.tables)}
                      showDrop={showPerTableDrop}
                      result={groupTotal(g.tables)}
                      accent={GROUPS[g.key].tot}
                      header
                      onClick={() => toggleSort(`g:${g.key}`)}
                      suffix={sortMark(`g:${g.key}`)}
                    />
                  ))}
                  <GroupTotalCells colSpan={1} drop={periodTotalDrop} showDrop result={totals.totalResult} accent="primary" noBorder header />
                </TableRow>
              </TableHeader>

              <TableBody>
                {sortedBuckets.map((b, idx) => {
                  const isOpen = openDate === b.date;
                  const prev = sortedBuckets[idx - 1];
                  const isWeekBoundary = sort.key === "date" && (!prev || weekKey(prev.date) !== weekKey(b.date));
                  const zebra = idx % 2 === 0 ? "bg-card" : "bg-muted/30";
                  const stickyZebra = idx % 2 === 0 ? "bg-card" : "bg-muted";
                  return (
                    <Fragment key={b.date}>
                      <TableRow
                        className={cn(
                          "cursor-pointer hover:bg-accent/30 transition-colors",
                          zebra,
                          isWeekBoundary && "border-t-2 border-t-primary/40",
                        )}
                        onClick={() => setOpenDate(isOpen ? null : b.date)}
                      >
                        <TableCell className={cn("sticky left-0 z-10 border-r font-medium hover:bg-accent/30", stickyZebra)}>
                          <div className="flex items-center gap-1.5 whitespace-nowrap">
                            <ChevronRight
                              className={cn("w-3.5 h-3.5 transition-transform text-muted-foreground shrink-0", isOpen && "rotate-90")}
                            />
                            <span className="font-mono">{fmtDate(b.date)}</span>
                            <span className="text-[10px] text-muted-foreground ml-auto pl-2">{dayName(b.date)}</span>
                          </div>
                        </TableCell>

                        {visibleGroups.map((g) =>
                          g.tables.map((t, i) => {
                            const c = b.cells[t] || emptyCell;
                            return (
                              <DRCell
                                key={t}
                                drop={c.drop}
                                result={c.result}
                                hasData={c.hasData}
                                groupEnd={i === g.tables.length - 1}
                                alwaysShowDrop={showPerTableDrop}
                                accent={g.key === "CLUB" ? "info" : undefined}
                              />
                            );
                          }),
                        )}

                        <DRCell drop={dropForDay(b.date)} result={b.totalResult} hasData bold alwaysShowDrop />
                      </TableRow>

                      {isOpen && (
                        <TableRow className="bg-muted/10 hover:bg-muted/10">
                          <TableCell colSpan={1 + visibleTables.length + 1} className="p-0">
                            <div className="sticky left-0 w-[100cqw] max-w-full">
                              <DayDetail rows={b.fullRows} date={b.date} totalDropFromCache={dropForDay(b.date)} inByTable={inByDateTable.get(b.date)} />
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Sub-components                                                     */
/* ------------------------------------------------------------------ */

// Solid backgrounds via layered gradients so sticky headers fully cover scrolling content.
const accentBg: Record<string, string> = {
  amber: "[background-image:linear-gradient(hsl(var(--warning)/0.08),hsl(var(--warning)/0.08)),linear-gradient(hsl(var(--muted)),hsl(var(--muted)))]",
  emerald: "[background-image:linear-gradient(hsl(var(--success)/0.08),hsl(var(--success)/0.08)),linear-gradient(hsl(var(--muted)),hsl(var(--muted)))]",
  rose: "[background-image:linear-gradient(hsl(var(--destructive)/0.08),hsl(var(--destructive)/0.08)),linear-gradient(hsl(var(--muted)),hsl(var(--muted)))]",
  primary: "[background-image:linear-gradient(hsl(var(--primary)/0.15),hsl(var(--primary)/0.15)),linear-gradient(hsl(var(--muted)),hsl(var(--muted)))]",
  info: "[background-image:linear-gradient(hsl(var(--info)/0.10),hsl(var(--info)/0.10)),linear-gradient(hsl(var(--muted)),hsl(var(--muted)))]",
  other: "[background-image:linear-gradient(hsl(var(--accent-foreground)/0.08),hsl(var(--accent-foreground)/0.08)),linear-gradient(hsl(var(--muted)),hsl(var(--muted)))]",
};
const accentBgBold: Record<string, string> = {
  amber: "[background-image:linear-gradient(hsl(var(--warning)/0.2),hsl(var(--warning)/0.2)),linear-gradient(hsl(var(--muted)),hsl(var(--muted)))]",
  emerald: "[background-image:linear-gradient(hsl(var(--success)/0.2),hsl(var(--success)/0.2)),linear-gradient(hsl(var(--muted)),hsl(var(--muted)))]",
  rose: "[background-image:linear-gradient(hsl(var(--destructive)/0.2),hsl(var(--destructive)/0.2)),linear-gradient(hsl(var(--muted)),hsl(var(--muted)))]",
  primary: "[background-image:linear-gradient(hsl(var(--primary)/0.25),hsl(var(--primary)/0.25)),linear-gradient(hsl(var(--muted)),hsl(var(--muted)))]",
};

const SubHead = ({
  name,
  accent,
  bold,
  groupEnd,
  onClick,
}: {
  name: string;
  accent: keyof typeof accentBg;
  bold?: boolean;
  groupEnd?: boolean;
  onClick?: () => void;
}) => {
  const bg = bold ? accentBgBold[accent] : accentBg[accent];
  const endBorder = groupEnd ? "border-r-2 border-r-border" : "border-r border-r-border/40";
  // top-8 = 32px (height of first header row)
  const stickyTop = "top-8 z-10";
  return (
    <TableHead
      className={cn(
        "text-right font-medium text-[10px] uppercase tracking-wide whitespace-nowrap px-1.5",
        bg,
        endBorder,
        stickyTop,
        onClick && "cursor-pointer select-none hover:text-foreground",
      )}
      onClick={onClick}
    >
      {name}
    </TableHead>
  );
};

/* Result-only body cell — Drop and Hold% are intentionally not shown here */
const DRCell = ({
  result,
  hasData,
  bold,
  groupEnd,
  accent,
  drop = 0,
  alwaysShowDrop = false,
}: {
  drop?: number;
  result: number;
  hasData: boolean;
  bold?: boolean;
  groupEnd?: boolean;
  alwaysShowDrop?: boolean;
  accent?: keyof typeof accentBg;
}) => {
  const endBorder = groupEnd ? "border-r-2 border-r-border" : "border-r border-r-border/30";
  const tint = accent === "info" ? "bg-info/10" : undefined;
  if (!hasData && result === 0) {
    return (
      <TableCell className={cn("text-right text-muted-foreground/40 font-mono whitespace-nowrap px-1.5", endBorder, tint)}>—</TableCell>
    );
  }
  const isNeg = result < 0;
  return (
    <TableCell
      className={cn(
        "text-right font-mono tabular-nums whitespace-nowrap px-1.5",
        bold && "font-semibold",
        isNeg && "text-destructive",
        endBorder,
        tint,
      )}
    >
      {alwaysShowDrop && (
        <div className="text-[10px] font-normal text-muted-foreground leading-tight">
          D {drop === 0 ? "—" : formatSpaced(drop)}
        </div>
      )}
      {result === 0 ? "—" : formatSpaced(result)}
    </TableCell>
  );
};

/* Compact period-total head cell for the header Σ row (Result only) */
const DRHeadCell = ({
  result,
  bold,
  groupEnd,
  drop = 0,
  alwaysShowDrop = false,
}: {
  drop?: number;
  result: number;
  bold?: boolean;
  groupEnd?: boolean;
  alwaysShowDrop?: boolean;
  accent?: keyof typeof accentBg;
}) => {
  const endBorder = groupEnd ? "border-r-2 border-r-border" : "border-r border-r-border/30";
  const isNeg = result < 0;
  // top-16 = 64px (sum of first two header rows, both h-8)
  const stickyTop = "top-16 z-10 [background-image:linear-gradient(hsl(var(--primary)/0.2),hsl(var(--primary)/0.2)),linear-gradient(hsl(var(--muted)),hsl(var(--muted)))]";
  return (
    <TableHead
      className={cn(
        "text-right font-mono tabular-nums whitespace-nowrap px-1.5 text-foreground",
        bold && "font-bold",
        isNeg && "text-destructive",
        endBorder,
        stickyTop,
      )}
    >
      {alwaysShowDrop && (
        <div className="text-[10px] font-normal text-muted-foreground leading-tight">
          D {drop === 0 ? "—" : formatSpaced(drop)}
        </div>
      )}
      {result === 0 ? "—" : formatSpaced(result)}
    </TableHead>
  );
};

/* Group total row — single colSpan cell summarizing Result per game group */
const GroupTotalCells = ({
  colSpan,
  result,
  accent,
  noBorder,
  header = false,
  onClick,
  suffix,
  drop = 0,
  showDrop = false,
}: {
  colSpan: number;
  showDrop?: boolean;
  drop?: number;
  result: number;
  accent: "warning" | "success" | "destructive" | "primary" | "info" | "other";
  onClick?: () => void;
  suffix?: string;
  noBorder?: boolean;
  header?: boolean;
}) => {
  const bgMap = {
    warning: "[background-image:linear-gradient(hsl(var(--warning)/0.15),hsl(var(--warning)/0.15)),linear-gradient(hsl(var(--muted)),hsl(var(--muted)))]",
    success: "[background-image:linear-gradient(hsl(var(--success)/0.15),hsl(var(--success)/0.15)),linear-gradient(hsl(var(--muted)),hsl(var(--muted)))]",
    destructive: "[background-image:linear-gradient(hsl(var(--destructive)/0.15),hsl(var(--destructive)/0.15)),linear-gradient(hsl(var(--muted)),hsl(var(--muted)))]",
    primary: "[background-image:linear-gradient(hsl(var(--primary)/0.25),hsl(var(--primary)/0.25)),linear-gradient(hsl(var(--muted)),hsl(var(--muted)))]",
    info: "[background-image:linear-gradient(hsl(var(--info)/0.2),hsl(var(--info)/0.2)),linear-gradient(hsl(var(--muted)),hsl(var(--muted)))]",
    other: "[background-image:linear-gradient(hsl(var(--accent-foreground)/0.12),hsl(var(--accent-foreground)/0.12)),linear-gradient(hsl(var(--muted)),hsl(var(--muted)))]",
  };
  const isNeg = result < 0;
  const content = (
    <>
      {showDrop && (
        <>
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground mr-1">D</span>
          <span className="mr-3 text-muted-foreground">{drop === 0 ? "—" : formatSpaced(drop)}</span>
        </>
      )}
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground mr-2">R</span>
      <span className={cn("font-semibold", isNeg && "text-destructive")}>
        {result === 0 ? "—" : formatSpaced(result)}
      </span>
      {suffix}
    </>
  );
  const className = cn(
    "text-center font-mono tabular-nums whitespace-nowrap px-3",
    bgMap[accent],
    !noBorder && "border-r-2 border-r-border",
    header && "sticky top-24 z-10",
    onClick && "cursor-pointer select-none",
  );
  return header ? (
    <TableHead colSpan={colSpan} className={className} onClick={onClick}>
      {content}
    </TableHead>
  ) : (
    <TableCell
      colSpan={colSpan}
      className={className}
    >
      {content}
    </TableCell>
  );
};


/* Inline drilldown — like the third photo (per-table full breakdown) */
const DayDetail = ({ rows, date, totalDropFromCache, inByTable }: { rows: Row[]; date: string; totalDropFromCache: number; inByTable?: Map<string, number> }) => {
  // Pick latest row per table name
  const byName = new Map<string, Row>();
  for (const r of rows) {
    const n = r.gaming_tables?.name;
    if (!n) continue;
    const existing = byName.get(n);
    if (!existing || r.id.localeCompare(existing.id) > 0) byName.set(n, r);
  }
  const sorted = [...byName.entries()]
    .sort(([a], [b]) => GROUP_ORDER.indexOf(tableGroupOf(a)) - GROUP_ORDER.indexOf(tableGroupOf(b)) || naturalCompare(a, b))
    .map(([, r]) => r);

  const dropOf = (r: Row) => Number(inByTable?.get(r.table_id) || 0);

  const totals = sorted.reduce(
    (acc, r) => {
      acc.open += Number(r.open || 0);
      acc.fill += Number(r.fill || 0);
      acc.credit += Number(r.credit || 0);
      acc.close += Number(r.close || 0);
      acc.drop += dropOf(r);
      acc.result += Number(r.result || 0);
      return acc;
    },
    { open: 0, fill: 0, credit: 0, close: 0, drop: 0, result: 0 },
  );

  return (
    <div className="p-3 md:p-4 border-l-4 border-l-primary/60">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <h4 className="font-semibold text-sm">Day breakdown · {date}</h4>
        <div className="text-xs text-muted-foreground">
          {sorted.length} {sorted.length === 1 ? "table" : "tables"} · source:{" "}
          {Array.from(new Set(sorted.map((r) => r.source))).join(", ") || "—"}
        </div>
      </div>
      <div className="overflow-x-auto rounded border bg-background">
        <Table className="text-xs">
          <TableHeader>
            <TableRow>
              <TableHead className="font-semibold">Table</TableHead>
              <TableHead className="text-right">Open</TableHead>
              <TableHead className="text-right">Fill</TableHead>
              <TableHead className="text-right">Credit</TableHead>
              <TableHead className="text-right">Close</TableHead>
              <TableHead className="text-right">Drop</TableHead>
              <TableHead className="text-right">Result</TableHead>
              <TableHead>Source</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((r) => {
              const isNeg = Number(r.result) < 0;
              return (
                <TableRow key={r.id}>
                  <TableCell className="font-mono font-medium">
                    {r.gaming_tables?.name}
                    <span className="text-[10px] text-muted-foreground ml-1.5">
                      {r.gaming_tables?.game}
                    </span>
                  </TableCell>
                  <TableCell className="text-right font-mono">{formatSpaced(r.open)}</TableCell>
                  <TableCell className="text-right font-mono">{formatSpaced(r.fill)}</TableCell>
                  <TableCell className="text-right font-mono">{formatSpaced(r.credit)}</TableCell>
                  <TableCell className="text-right font-mono">{formatSpaced(r.close)}</TableCell>
                  <TableCell className="text-right font-mono">
                    {dropOf(r) === 0 ? "—" : formatSpaced(dropOf(r))}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right font-mono font-semibold",
                      isNeg && "text-destructive",
                    )}
                  >
                    {formatSpaced(r.result)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={r.source === "imported" ? "secondary" : "default"}
                      className="text-[10px]"
                    >
                      {r.source}
                    </Badge>
                  </TableCell>
                </TableRow>
              );
            })}
            <TableRow className="bg-muted/40 font-semibold border-t-2">
              <TableCell>TOTAL</TableCell>
              <TableCell className="text-right font-mono">{formatSpaced(totals.open)}</TableCell>
              <TableCell className="text-right font-mono">{formatSpaced(totals.fill)}</TableCell>
              <TableCell className="text-right font-mono">{formatSpaced(totals.credit)}</TableCell>
              <TableCell className="text-right font-mono">{formatSpaced(totals.close)}</TableCell>
              <TableCell className="text-right font-mono">{formatSpaced(totalDropFromCache)}</TableCell>
              <TableCell
                className={cn(
                  "text-right font-mono",
                  totals.result < 0 && "text-destructive",
                )}
              >
                {formatSpaced(totals.result)}
              </TableCell>
              <TableCell />
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default TableResults;
