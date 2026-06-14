import { useEffect, useMemo, useState } from "react";
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
import { CalendarIcon, ChevronRight, Loader2, FileSpreadsheet, FileText } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { downloadXlsx } from "@/lib/excel-export";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { fmtDate, fmtWeekdayShort } from "@/lib/format-date";
import { useAuth } from "@/lib/auth-context";

/* ------------------------------------------------------------------ */
/* Layout config — order of columns in the horizontal report          */
/* ------------------------------------------------------------------ */
const AR_TABLES = ["AR1", "AR2", "AR3"] as const;
const PK_TABLES = ["P1", "P2", "P3", "P4", "P5"] as const;
const BJ_TABLES = ["BJ1"] as const;

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

type DayBucket = {
  date: string;
  cells: Record<string, DayCell>; // by table name
  fullRows: Row[];                // for inline drilldown
  arDrop: number; arResult: number;
  pkDrop: number; pkResult: number;
  bjDrop: number; bjResult: number;
  totalDrop: number; totalResult: number;
};

const emptyCell: DayCell = { drop: 0, result: 0, hasData: false };

const holdPct = (drop: number, result: number) =>
  drop > 0 ? (result / drop) * 100 : 0;

const fmtPct = (v: number) =>
  v === 0 ? "—" : `${v >= 0 ? "" : "-"}${Math.abs(v).toFixed(1)}%`;

const dayName = (iso: string) => fmtWeekdayShort(iso);

const monthShort = (iso: string) =>
  new Date(iso + "T12:00:00").toLocaleDateString("en-US", {
    month: "short",
    year: "2-digit",
  });

const dayNum = (iso: string) => Number(iso.slice(8, 10));

/* ------------------------------------------------------------------ */

interface TableResultsProps {
  embedded?: boolean;
  embeddedFrom?: string;
  embeddedTo?: string;
}

const TableResults = ({ embedded = false, embeddedFrom, embeddedTo }: TableResultsProps = {}) => {
  const { roles } = useAuth();
  const isSurveillanceOnly = roles.includes("surveillance" as any) &&
    !roles.some((r) => ["manager", "super_admin", "finance_manager"].includes(r as string));
  const currentYear = new Date().getFullYear();
  const visiblePresets = isSurveillanceOnly
    ? PRESETS.filter((p) => p.key !== "custom")
    : PRESETS;

  const [preset, setPreset] = useState<PresetKey>("month");
  const [weekAnchor, setWeekAnchor] = useState<Date>(new Date());
  const [monthAnchor, setMonthAnchor] = useState<Date>(new Date());
  const [yearAnchor, setYearAnchor] = useState<Date>(new Date());
  const [customFrom, setCustomFrom] = useState(daysAgoStr(29));
  const [customTo, setCustomTo] = useState(todayStr());
  const [openDate, setOpenDate] = useState<string | null>(null);

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

  /* Build full date range — fill missing days with empty buckets so gaps are visible. */
  const allDates = useMemo(() => {
    const out: string[] = [];
    if (!from || !to) return out;
    const start = new Date(from + "T12:00:00");
    const end = new Date(to + "T12:00:00");
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) return out;
    // cap to today — don't show future days that haven't happened yet
    const todayIso = todayStr();
    const cur = new Date(start);
    while (cur <= end) {
      const iso = isoDate(cur);
      if (iso <= todayIso) out.push(iso);
      cur.setDate(cur.getDate() + 1);
    }
    return out;
  }, [from, to]);

  /* Group rows by date */
  const buckets: DayBucket[] = useMemo(() => {
    const byDate: Record<string, Row[]> = {};
    for (const r of data as Row[]) {
      (byDate[r.date] ||= []).push(r);
    }
    // Ensure every date in the range has an entry, even with no rows.
    for (const d of allDates) {
      if (!byDate[d]) byDate[d] = [];
    }
    const list: DayBucket[] = Object.entries(byDate).map(([date, rows]) => {
      const cells: Record<string, DayCell> = {};
      // pick latest row per table name (deterministic by id)
      const byName = new Map<string, Row>();
      for (const r of rows) {
        const n = r.gaming_tables?.name;
        if (!n) continue;
        const existing = byName.get(n);
        if (!existing || r.id.localeCompare(existing.id) > 0) byName.set(n, r);
      }
      for (const [name, r] of byName.entries()) {
        cells[name] = {
          drop: Number(r.drop_amount || 0),
          result: Number(r.result || 0),
          hasData: true,
        };
      }
      const sumGroup = (names: readonly string[]) => {
        let d = 0,
          res = 0;
        for (const n of names) {
          const c = cells[n];
          if (c) {
            d += c.drop;
            res += c.result;
          }
        }
        return { d, res };
      };
      const ar = sumGroup(AR_TABLES);
      const pk = sumGroup(PK_TABLES);
      const bj = sumGroup(BJ_TABLES);
      return {
        date,
        cells,
        fullRows: rows,
        arDrop: ar.d,
        arResult: ar.res,
        pkDrop: pk.d,
        pkResult: pk.res,
        bjDrop: bj.d,
        bjResult: bj.res,
        totalDrop: ar.d + pk.d + bj.d,
        totalResult: ar.res + pk.res + bj.res,
      };
    });
    return list.sort((a, b) => a.date.localeCompare(b.date));
  }, [data, allDates]);

  /* Period totals (bottom row) */
  const totals = useMemo(() => {
    const cellsTotal: Record<string, { drop: number; result: number }> = {};
    let arDrop = 0, arResult = 0;
    let pkDrop = 0, pkResult = 0;
    let bjDrop = 0, bjResult = 0;
    for (const b of buckets) {
      for (const name of [...AR_TABLES, ...PK_TABLES, ...BJ_TABLES]) {
        const c = b.cells[name];
        if (!c) continue;
        const acc = (cellsTotal[name] ||= { drop: 0, result: 0 });
        acc.drop += c.drop;
        acc.result += c.result;
      }
      arDrop += b.arDrop; arResult += b.arResult;
      pkDrop += b.pkDrop; pkResult += b.pkResult;
      bjDrop += b.bjDrop; bjResult += b.bjResult;
    }
    return {
      cellsTotal,
      arDrop, arResult,
      pkDrop, pkResult,
      bjDrop, bjResult,
      totalDrop: arDrop + pkDrop + bjDrop,
      totalResult: arResult + pkResult + bjResult,
    };
  }, [buckets]);

  /* ---------------------------------------------------------------- */
  /* Render helpers                                                   */
  /* ---------------------------------------------------------------- */
  const numCell = (v: number, opts?: { bold?: boolean; muted?: boolean }) => {
    const isNeg = v < 0;
    return (
      <span
        className={cn(
          "font-mono tabular-nums",
          opts?.bold && "font-semibold",
          isNeg && "text-destructive",
          v === 0 && opts?.muted && "text-muted-foreground/50",
        )}
      >
        {v === 0 ? "—" : formatSpaced(v)}
      </span>
    );
  };

  const pctCell = (drop: number, result: number) => {
    const v = holdPct(drop, result);
    if (drop === 0) return <span className="text-muted-foreground/50">—</span>;
    const isNeg = v < 0;
    return (
      <span
        className={cn(
          "font-mono tabular-nums text-xs",
          isNeg && "text-destructive",
        )}
      >
        {v >= 0 ? "" : "-"}{Math.abs(v).toFixed(1)}%
      </span>
    );
  };

  /* Column groups */
  const allTableCols = [...AR_TABLES, ...PK_TABLES, ...BJ_TABLES];

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
              onClick={() => {
                const tableCols = [...AR_TABLES, ...PK_TABLES, ...BJ_TABLES];
                const header: (string | number)[] = ["Date", "Weekday"];
                for (const t of tableCols) {
                  header.push(`${t} Drop`, `${t} Result`, `${t} Hold%`);
                }
                header.push("AR Drop", "AR Result", "PK Drop", "PK Result", "BJ Drop", "BJ Result", "Total Drop", "Total Result", "Total Hold%");
                const rows: (string | number | null)[][] = [header];
                for (const b of buckets) {
                  const r: (string | number | null)[] = [b.date, dayName(b.date)];
                  for (const t of tableCols) {
                    const c = b.cells[t];
                    if (c?.hasData) {
                      r.push(c.drop, c.result, c.drop > 0 ? Number((c.result / c.drop * 100).toFixed(2)) : "");
                    } else {
                      r.push("", "", "");
                    }
                  }
                  r.push(
                    b.arDrop, b.arResult,
                    b.pkDrop, b.pkResult,
                    b.bjDrop, b.bjResult,
                    b.totalDrop, b.totalResult,
                    b.totalDrop > 0 ? Number((b.totalResult / b.totalDrop * 100).toFixed(2)) : "",
                  );
                  rows.push(r);
                }
                // Σ totals row
                const totalsRow: (string | number | null)[] = ["TOTAL", ""];
                for (const t of tableCols) {
                  const c = totals.cellsTotal[t];
                  if (c) {
                    totalsRow.push(c.drop, c.result, c.drop > 0 ? Number((c.result / c.drop * 100).toFixed(2)) : "");
                  } else {
                    totalsRow.push("", "", "");
                  }
                }
                totalsRow.push(
                  totals.arDrop, totals.arResult,
                  totals.pkDrop, totals.pkResult,
                  totals.bjDrop, totals.bjResult,
                  totals.totalDrop, totals.totalResult,
                  totals.totalDrop > 0 ? Number((totals.totalResult / totals.totalDrop * 100).toFixed(2)) : "",
                );
                rows.push([]);
                rows.push(totalsRow);
                downloadXlsx(`table-results_${from}_${to}.xlsx`, [{ name: "Table Results", rows }]);
              }}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" /> Export Excel
            </Button>
          </div>
        </div>
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
          <div className="overflow-auto max-h-[calc(100vh-220px)] [container-type:inline-size] relative">
            <table className="w-full caption-bottom text-xs [&_th]:h-8 [&_th]:px-1.5 [&_td]:p-1.5 [&_thead_th]:sticky">
              {/* Group headers */}
              <TableHeader>
                <TableRow className="bg-muted hover:bg-muted">
                  <TableHead className="sticky left-0 top-0 bg-muted z-30 w-36 min-w-36 border-r-2 border-r-border whitespace-nowrap">
                    Date
                  </TableHead>
                  <TableHead
                    colSpan={AR_TABLES.length * 3}
                    className="sticky top-0 z-20 text-center font-semibold border-r-2 border-r-border [background-image:linear-gradient(hsl(var(--warning)/0.12),hsl(var(--warning)/0.12)),linear-gradient(hsl(var(--muted)),hsl(var(--muted)))]"
                  >
                    American Roulette
                  </TableHead>
                  <TableHead
                    colSpan={PK_TABLES.length * 3}
                    className="sticky top-0 z-20 text-center font-semibold border-r-2 border-r-border [background-image:linear-gradient(hsl(var(--success)/0.12),hsl(var(--success)/0.12)),linear-gradient(hsl(var(--muted)),hsl(var(--muted)))]"
                  >
                    Poker (PK)
                  </TableHead>
                  <TableHead
                    colSpan={BJ_TABLES.length * 3}
                    className="sticky top-0 z-20 text-center font-semibold border-r-2 border-r-border [background-image:linear-gradient(hsl(var(--destructive)/0.12),hsl(var(--destructive)/0.12)),linear-gradient(hsl(var(--muted)),hsl(var(--muted)))]"
                  >
                    Blackjack
                  </TableHead>
                  <TableHead
                    colSpan={3}
                    className="sticky top-0 z-20 text-center font-semibold [background-image:linear-gradient(hsl(var(--primary)/0.22),hsl(var(--primary)/0.22)),linear-gradient(hsl(var(--muted)),hsl(var(--muted)))]"
                  >
                    Total Tables
                  </TableHead>
                </TableRow>

                {/* Sub-headers (D / R / %) */}
                <TableRow className="bg-muted hover:bg-muted">
                  <TableHead className="sticky left-0 top-8 bg-muted z-30 w-36 min-w-36 border-r-2 border-r-border" />
                  {AR_TABLES.map((t, i) => (
                    <SubHead key={t} name={t} accent="amber" groupEnd={i === AR_TABLES.length - 1} />
                  ))}
                  {PK_TABLES.map((t, i) => (
                    <SubHead key={t} name={t.replace("P", "PK")} accent="emerald" groupEnd={i === PK_TABLES.length - 1} />
                  ))}
                  {BJ_TABLES.map((t, i) => (
                    <SubHead key={t} name={t} accent="rose" groupEnd={i === BJ_TABLES.length - 1} />
                  ))}
                  <SubHead name="ALL" accent="primary" bold />
                </TableRow>

                {/* Period totals per table — moved to header (Σ row at top) */}
                <TableRow className="hover:bg-transparent border-b-2 border-b-primary/40">
                  <TableHead className="sticky left-0 top-16 z-30 border-r-2 border-r-border text-[10px] uppercase tracking-wide font-semibold whitespace-nowrap [background-image:linear-gradient(hsl(var(--primary)/0.3),hsl(var(--primary)/0.3)),linear-gradient(hsl(var(--muted)),hsl(var(--muted)))]">
                    Σ Period ({buckets.length}d)
                  </TableHead>
                  {AR_TABLES.map((t, i) => {
                    const c = totals.cellsTotal[t] || { drop: 0, result: 0 };
                    return <DRHeadCell key={t} drop={c.drop} result={c.result} groupEnd={i === AR_TABLES.length - 1} />;
                  })}
                  {PK_TABLES.map((t, i) => {
                    const c = totals.cellsTotal[t] || { drop: 0, result: 0 };
                    return <DRHeadCell key={t} drop={c.drop} result={c.result} groupEnd={i === PK_TABLES.length - 1} />;
                  })}
                  {BJ_TABLES.map((t, i) => {
                    const c = totals.cellsTotal[t] || { drop: 0, result: 0 };
                    return <DRHeadCell key={t} drop={c.drop} result={c.result} groupEnd={i === BJ_TABLES.length - 1} />;
                  })}
                  <DRHeadCell drop={totals.totalDrop} result={totals.totalResult} bold />
                </TableRow>
              </TableHeader>

              <TableBody>
                {buckets.map((b, idx) => {
                  const isOpen = openDate === b.date;
                  // First row of a "new" week: when prev visible row belongs to a different week.
                  // Buckets are sorted DESC by date, so prev = idx-1 (later date).
                  const prev = buckets[idx - 1];
                  const isWeekBoundary = !prev || weekKey(prev.date) !== weekKey(b.date);
                  const zebra = idx % 2 === 0 ? "bg-card" : "bg-muted/30";
                  const stickyZebra = idx % 2 === 0 ? "bg-card" : "bg-muted";
                  return (
                    <>
                      <TableRow
                        key={b.date}
                        className={cn(
                          "cursor-pointer hover:bg-accent/30 transition-colors",
                          zebra,
                          isWeekBoundary && "border-t-2 border-t-primary/40",
                        )}
                        onClick={() => setOpenDate(isOpen ? null : b.date)}
                      >
                        {/* Date sticky */}
                        <TableCell
                          className={cn(
                            "sticky left-0 z-10 border-r font-medium hover:bg-accent/30",
                            stickyZebra,
                          )}
                        >
                          <div className="flex items-center gap-1.5 whitespace-nowrap">
                            <ChevronRight
                              className={cn(
                                "w-3.5 h-3.5 transition-transform text-muted-foreground shrink-0",
                                isOpen && "rotate-90",
                              )}
                            />
                            <span className="font-mono">{fmtDate(b.date)}</span>
                            <span className="text-[10px] text-muted-foreground ml-auto pl-2">
                              {dayName(b.date)}
                            </span>
                          </div>
                        </TableCell>

                        {/* AR cells */}
                        {AR_TABLES.map((t, i) => {
                          const c = b.cells[t] || emptyCell;
                          return (
                            <DRCell
                              key={t}
                              drop={c.drop}
                              result={c.result}
                              hasData={c.hasData}
                              groupEnd={i === AR_TABLES.length - 1}
                            />
                          );
                        })}

                        {/* PK cells */}
                        {PK_TABLES.map((t, i) => {
                          const c = b.cells[t] || emptyCell;
                          return (
                            <DRCell
                              key={t}
                              drop={c.drop}
                              result={c.result}
                              hasData={c.hasData}
                              groupEnd={i === PK_TABLES.length - 1}
                            />
                          );
                        })}

                        {/* BJ cells */}
                        {BJ_TABLES.map((t, i) => {
                          const c = b.cells[t] || emptyCell;
                          return (
                            <DRCell
                              key={t}
                              drop={c.drop}
                              result={c.result}
                              hasData={c.hasData}
                              groupEnd={i === BJ_TABLES.length - 1}
                            />
                          );
                        })}

                        {/* All */}
                        <DRCell drop={b.totalDrop} result={b.totalResult} hasData bold />
                      </TableRow>

                      {/* Inline drilldown — full per-table report (third photo) */}
                      {isOpen && (
                        <TableRow className="bg-muted/10 hover:bg-muted/10">
                          <TableCell
                            colSpan={
                              1 +
                              AR_TABLES.length * 3 +
                              PK_TABLES.length * 3 +
                              BJ_TABLES.length * 3 +
                              3
                            }
                            className="p-0"
                          >
                            <div className="sticky left-0 w-[100cqw] max-w-full">
                              <DayDetail rows={b.fullRows} date={b.date} />
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  );
                })}

                {/* TOTAL by group row (AR / PK / BJ subtotals spanning each group) */}
                <TableRow className="bg-primary/15 hover:bg-primary/15 font-semibold border-t-2 border-t-primary/40">
                  <TableCell className="sticky left-0 bg-primary/20 z-10 border-r-2 border-r-border text-[11px] uppercase tracking-wide">
                    Σ by group
                  </TableCell>
                  <GroupTotalCells colSpan={AR_TABLES.length * 3} drop={totals.arDrop} result={totals.arResult} accent="warning" />
                  <GroupTotalCells colSpan={PK_TABLES.length * 3} drop={totals.pkDrop} result={totals.pkResult} accent="success" />
                  <GroupTotalCells colSpan={BJ_TABLES.length * 3} drop={totals.bjDrop} result={totals.bjResult} accent="destructive" />
                  <GroupTotalCells colSpan={3} drop={totals.totalDrop} result={totals.totalResult} accent="primary" noBorder />
                </TableRow>
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
}: {
  name: string;
  accent: keyof typeof accentBg;
  bold?: boolean;
  groupEnd?: boolean;
}) => {
  const bg = bold ? accentBgBold[accent] : accentBg[accent];
  const endBorder = groupEnd ? "border-r-2 border-r-border" : "border-r border-r-border/40";
  // top-8 = 32px (height of first header row)
  const stickyTop = "top-8 z-10";
  return (
    <>
      <TableHead
        className={cn(
          "text-right font-medium text-[10px] uppercase tracking-wide whitespace-nowrap px-1.5",
          bg,
          stickyTop,
        )}
      >
        {name} D
      </TableHead>
      <TableHead
        className={cn(
          "text-right font-medium text-[10px] uppercase tracking-wide whitespace-nowrap px-1.5",
          bg,
          stickyTop,
        )}
      >
        {name} R
      </TableHead>
      <TableHead
        className={cn(
          "text-right font-medium text-[10px] uppercase tracking-wide whitespace-nowrap px-1.5",
          bg,
          endBorder,
          stickyTop,
        )}
      >
        {name} %
      </TableHead>
    </>
  );
};

const DRCell = ({
  drop,
  result,
  hasData,
  bold,
  groupEnd,
}: {
  drop: number;
  result: number;
  hasData: boolean;
  bold?: boolean;
  groupEnd?: boolean;
}) => {
  const endBorder = groupEnd ? "border-r-2 border-r-border" : "border-r border-r-border/30";
  if (!hasData && drop === 0 && result === 0) {
    return (
      <>
        <TableCell className="text-right text-muted-foreground/40 font-mono whitespace-nowrap px-1.5">—</TableCell>
        <TableCell className="text-right text-muted-foreground/40 font-mono whitespace-nowrap px-1.5">—</TableCell>
        <TableCell className={cn("text-right text-muted-foreground/40 font-mono whitespace-nowrap px-1.5", endBorder)}>—</TableCell>
      </>
    );
  }
  const isNeg = result < 0;
  const pct = drop > 0 ? (result / drop) * 100 : 0;
  return (
    <>
      <TableCell
        className={cn(
          "text-right font-mono tabular-nums whitespace-nowrap px-1.5",
          bold && "font-semibold",
        )}
      >
        {drop === 0 ? "—" : formatSpaced(drop)}
      </TableCell>
      <TableCell
        className={cn(
          "text-right font-mono tabular-nums whitespace-nowrap px-1.5",
          bold && "font-semibold",
          isNeg && "text-destructive",
        )}
      >
        {result === 0 ? "—" : formatSpaced(result)}
      </TableCell>
      <TableCell
        className={cn(
          "text-right font-mono tabular-nums text-xs whitespace-nowrap px-1.5",
          isNeg && "text-destructive",
          endBorder,
        )}
      >
        {drop === 0 ? "—" : `${pct >= 0 ? "" : "-"}${Math.abs(pct).toFixed(1)}%`}
      </TableCell>
    </>
  );
};

/* Compact period-total head cell for the header Σ row */
const DRHeadCell = ({
  drop,
  result,
  bold,
  groupEnd,
}: {
  drop: number;
  result: number;
  bold?: boolean;
  groupEnd?: boolean;
}) => {
  const endBorder = groupEnd ? "border-r-2 border-r-border" : "border-r border-r-border/30";
  const isNeg = result < 0;
  const pct = drop > 0 ? (result / drop) * 100 : 0;
  // top-16 = 64px (sum of first two header rows, both h-8)
  const stickyTop = "top-16 z-10 [background-image:linear-gradient(hsl(var(--primary)/0.2),hsl(var(--primary)/0.2)),linear-gradient(hsl(var(--muted)),hsl(var(--muted)))]";
  return (
    <>
      <TableHead
        className={cn(
          "text-right font-mono tabular-nums whitespace-nowrap px-1.5 text-foreground",
          bold && "font-bold",
          stickyTop,
        )}
      >
        {drop === 0 ? "—" : formatSpaced(drop)}
      </TableHead>
      <TableHead
        className={cn(
          "text-right font-mono tabular-nums whitespace-nowrap px-1.5 text-foreground",
          bold && "font-bold",
          isNeg && "text-destructive",
          stickyTop,
        )}
      >
        {result === 0 ? "—" : formatSpaced(result)}
      </TableHead>
      <TableHead
        className={cn(
          "text-right font-mono tabular-nums text-xs whitespace-nowrap px-1.5 text-foreground",
          isNeg && "text-destructive",
          endBorder,
          stickyTop,
        )}
      >
        {drop === 0 ? "—" : `${pct >= 0 ? "" : "-"}${Math.abs(pct).toFixed(1)}%`}
      </TableHead>
    </>
  );
};

/* Group total row — single colSpan cell summarizing Drop / Result / Hold% per game group */
const GroupTotalCells = ({
  colSpan,
  drop,
  result,
  accent,
  noBorder,
}: {
  colSpan: number;
  drop: number;
  result: number;
  accent: "warning" | "success" | "destructive" | "primary";
  noBorder?: boolean;
}) => {
  const bgMap = {
    warning: "bg-warning/15",
    success: "bg-success/15",
    destructive: "bg-destructive/15",
    primary: "bg-primary/25",
  };
  const isNeg = result < 0;
  const pct = drop > 0 ? (result / drop) * 100 : 0;
  return (
    <TableCell
      colSpan={colSpan}
      className={cn(
        "text-center font-mono tabular-nums whitespace-nowrap px-3",
        bgMap[accent],
        !noBorder && "border-r-2 border-r-border",
      )}
    >
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground mr-2">D</span>
      <span className="font-semibold mr-3">{drop === 0 ? "—" : formatSpaced(drop)}</span>
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground mr-2">R</span>
      <span className={cn("font-semibold mr-3", isNeg && "text-destructive")}>
        {result === 0 ? "—" : formatSpaced(result)}
      </span>
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground mr-2">%</span>
      <span className={cn("text-xs", isNeg && "text-destructive")}>
        {drop === 0 ? "—" : `${pct >= 0 ? "" : "-"}${Math.abs(pct).toFixed(1)}%`}
      </span>
    </TableCell>
  );
};

/* Inline drilldown — like the third photo (per-table full breakdown) */
const DayDetail = ({ rows, date }: { rows: Row[]; date: string }) => {
  // Pick latest row per table name
  const byName = new Map<string, Row>();
  for (const r of rows) {
    const n = r.gaming_tables?.name;
    if (!n) continue;
    const existing = byName.get(n);
    if (!existing || r.id.localeCompare(existing.id) > 0) byName.set(n, r);
  }
  const order = [...AR_TABLES, ...PK_TABLES, ...BJ_TABLES];
  const sorted = order
    .map((n) => byName.get(n))
    .filter((r): r is Row => Boolean(r));

  const totals = sorted.reduce(
    (acc, r) => {
      acc.open += Number(r.open || 0);
      acc.fill += Number(r.fill || 0);
      acc.credit += Number(r.credit || 0);
      acc.close += Number(r.close || 0);
      acc.drop += Number(r.drop_amount || 0);
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
                  <TableCell className="text-right font-mono">{formatSpaced(r.drop_amount)}</TableCell>
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
              <TableCell className="text-right font-mono">{formatSpaced(totals.drop)}</TableCell>
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
