/** Stored ACE reports arranged for operational review; snapshots are never recalculated. */
import { useMemo, useState } from "react";
import { PageSection } from "@/components/layout/PageShell";
import { FilterBar } from "@/components/layout/FilterBar";
import { SmartTable, type ColumnDef } from "@/components/ui/smart-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePickerButton } from "@/components/ui/date-range-presets";
import { Download } from "lucide-react";
import { fmtDateOnly, fmtDateTime } from "@/lib/format-date";
import { downloadXlsx } from "@/lib/excel-export";
import { useAceReports } from "@/hooks/use-ace-players";
import { AceEmpty, type AceScope } from "./ace-shared";

type Capture = any;
type ReportGroup = { key: string; table: unknown; headers: string[]; rows: Record<string, any>[] };
const numeric = (value: unknown): number | null => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !value.trim()) return null;
  const normalized = value.replace(/\s/g, "").replace(/,/g, "");
  return /^-?\d+(\.\d+)?$/.test(normalized) ? Number(normalized) : null;
};

const isAdditiveHeader = (header: string) => {
  const value = header.toLowerCase();
  if (/(average|avg|%|rate|denom|position|time|date|#)/.test(value)) return false;
  return /(games|netwin|\bwin\b|drop|paid|credit|jackpot|\bjp\b|\bin\b|\bout\b|amount)/.test(value);
};

const combineRows = (headers: string[], rows: Record<string, any>[]) => {
  const additive = headers.filter(isAdditiveHeader);
  if (!additive.length) return rows;
  const dimensions = headers.filter((header) => !additive.includes(header));
  const combined = new Map<string, Record<string, any>>();
  rows.forEach((row) => {
    const key = JSON.stringify(dimensions.map((header) => row[header] ?? null));
    const current = combined.get(key) ?? Object.fromEntries(dimensions.map((header) => [header, row[header] ?? null]));
    additive.forEach((header) => {
      const value = numeric(row[header]);
      if (value !== null) current[header] = Number(current[header] ?? 0) + value;
      else if (!(header in current)) current[header] = null;
    });
    combined.set(key, current);
  });
  return [...combined.values()];
};

export default function AceReportsTab({ casinoId, from, to, onRangeChange }: AceScope & { casinoName: Map<string, string>; onRangeChange?: (range: { from: string; to: string }) => void }) {
  const [kind, setKind] = useState<"egm" | "jackpot">("egm");
  const [localFrom, setLocalFrom] = useState(from);
  const [localTo, setLocalTo] = useState(to);
  const [periodId, setPeriodId] = useState("all");
  const reports = useAceReports(kind, localFrom, localTo, casinoId);
  const captures = (reports.data ?? []) as Capture[];
  const selectedCaptures = periodId === "all" ? captures : captures.filter((c) => c.id === periodId);

  const groups = useMemo<ReportGroup[]>(() => {
    const out = new Map<string, ReportGroup>();
    selectedCaptures.slice().reverse().forEach((capture) => {
      const rows = Array.isArray(capture.rows_data) ? capture.rows_data as Record<string, any>[] : [];
      rows.forEach((row, index) => {
        const table = row?._table ?? 0;
        const declared = Array.isArray(row?._headers) ? row._headers.map(String) : Object.keys(row ?? {}).filter((key) => !key.startsWith("_"));
        const key = `${String(table)}:${JSON.stringify(declared)}`;
        const group = out.get(key) ?? { key, table, headers: declared, rows: [] };
        group.rows.push({ __key: `${capture.id}:${index}`, __capture: capture, ...row });
        out.set(key, group);
      });
    });
    return [...out.values()].map((group) => ({
      ...group,
      rows: periodId === "all" && selectedCaptures.length > 1
        ? combineRows(group.headers, group.rows).map((row, index) => ({ ...row, __key: `${group.key}:combined:${index}` }))
        : group.rows,
    }));
  }, [selectedCaptures]);

  const updateRange = (next: { from: string; to: string }) => {
    setLocalFrom(next.from); setLocalTo(next.to); setPeriodId("all"); onRangeChange?.(next);
  };
  const makeCols = (headers: string[]): ColumnDef<any>[] => headers.map((header) => ({
    key: header, header,
    accessor: (row) => row[header] === null || row[header] === undefined || row[header] === "" ? <span className="text-muted-foreground">—</span> : String(row[header]),
    sortValue: (row) => numeric(row[header]) ?? String(row[header] ?? ""),
  }));
  const footerFor = (group: ReportGroup) => [{ key: "total", className: "font-semibold", cell: (column: ColumnDef<any>, index: number) => {
    if (index === 0) return "Total";
    const values = group.rows.map((row) => numeric(row[column.key])).filter((v): v is number => v !== null);
    return values.length === group.rows.length && values.length ? values.reduce((a, b) => a + b, 0).toLocaleString("en-US").replace(/,/g, " ") : null;
  } }];
  const exportContent = () => downloadXlsx(`ace-${kind}-report-${localFrom}_${localTo}.xlsx`, groups.map((group, index) => ({
    name: groups.length > 1 ? `Report ${index + 1}` : "Report",
    rows: [group.headers, ...group.rows.map((row) => group.headers.map((header) => row[header] ?? null))],
  })));

  return <div className="space-y-3">
    <FilterBar filters={<>
      <Select value={kind} onValueChange={(value) => { setKind(value as "egm" | "jackpot"); setPeriodId("all"); }}>
        <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="egm">EGM Report</SelectItem><SelectItem value="jackpot">Jackpot Report</SelectItem></SelectContent>
      </Select>
      <span className="text-xs text-muted-foreground">From</span><DatePickerButton value={localFrom} onChange={(value) => updateRange({ from: value, to: localTo })} />
      <span className="text-xs text-muted-foreground">To</span><DatePickerButton value={localTo} onChange={(value) => updateRange({ from: localFrom, to: value })} />
      <Select value={periodId} onValueChange={setPeriodId}>
        <SelectTrigger className="h-9 min-w-64"><SelectValue placeholder="Stored periods" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Combined selected range</SelectItem>
          {captures.map((capture) => <SelectItem key={capture.id} value={capture.id}>{capture.period_label || fmtDateOnly(capture.business_date)} · {fmtDateTime(capture.captured_at)}</SelectItem>)}
        </SelectContent>
      </Select>
    </>} right={<Button variant="outline" size="sm" onClick={exportContent} disabled={!groups.length}><Download className="mr-1 h-4 w-4" /> Export</Button>} />

    <PageSection title="Available periods" card={false} titleRight={<Badge variant="outline">{captures.length} reports</Badge>}>
      <div className="flex flex-wrap gap-2">
        {captures.map((capture) => <Button key={capture.id} size="sm" variant={periodId === capture.id ? "default" : "outline"} onClick={() => setPeriodId(capture.id)}>
          {capture.period_label || fmtDateOnly(capture.business_date)}
        </Button>)}
        {!captures.length && <AceEmpty what="stored reports" />}
      </div>
    </PageSection>

    <PageSection title={periodId === "all" ? "Combined report" : "Report"} card={false}>
      {!groups.length ? <SmartTable data={[]} columns={[]} rowKey={() => "empty"} empty={<AceEmpty what="report rows" />} /> : <div className="space-y-4">
        {groups.map((group, index) => <div key={group.key} className="space-y-1">
          {groups.length > 1 && <div className="text-xs font-medium text-muted-foreground">Table {index + 1}</div>}
          <SmartTable data={group.rows} columns={makeCols(group.headers)} rowKey={(row) => row.__key} stickyHeader footerRows={group.rows.length ? footerFor(group) : undefined} empty={<AceEmpty what="report rows" />} />
        </div>)}
      </div>}
    </PageSection>
  </div>;
}
