/**
 * Reports workspace — stored ACE report captures (EGM / Jackpot).
 *
 * The stored `rows_data` snapshot is rendered verbatim: original ACE headers,
 * original order, original values. Nothing is recalculated.
 */
import { useEffect, useMemo, useState } from "react";
import { PageSection } from "@/components/layout/PageShell";
import { FilterBar } from "@/components/layout/FilterBar";
import { SmartTable, type ColumnDef } from "@/components/ui/smart-table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Download } from "lucide-react";
import { fmtDateOnly, fmtDateTime } from "@/lib/format-date";
import { downloadXlsx } from "@/lib/excel-export";
import { useAceReports } from "@/hooks/use-ace-players";
import { AceEmpty, type AceScope } from "./ace-shared";

type Capture = any;

export default function AceReportsTab({
  casinoId,
  from,
  to,
  casinoName,
}: AceScope & { casinoName: Map<string, string> }) {
  const [kind, setKind] = useState<"egm" | "jackpot">("egm");
  const reports = useAceReports(kind, from, to, casinoId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const captures = (reports.data ?? []) as Capture[];

  // auto-select the newest capture whenever the list changes
  useEffect(() => {
    if (!captures.length) { setSelectedId(null); return; }
    if (!captures.some((c) => c.id === selectedId)) setSelectedId(captures[0].id);
  }, [captures, selectedId]);

  const selected = captures.find((c) => c.id === selectedId) ?? null;

  const storedRows: Record<string, any>[] = useMemo(
    () => (Array.isArray(selected?.rows_data) ? (selected!.rows_data as any[]) : []),
    [selected],
  );

  /**
   * Column order comes from the `_headers` list captured with each row — JSON
   * object key order is not preserved by the database, so it cannot be trusted.
   * `_headers` / `_table` are internal capture metadata and are not shown as
   * data columns; `_table` becomes a "Block" column only for multi-block reports.
   */
  const multiBlock = useMemo(
    () => new Set(storedRows.map((r) => r?._table)).size > 1,
    [storedRows],
  );

  const headers = useMemo(() => {
    const seen: string[] = [];
    const push = (k: string) => {
      if (k !== "_headers" && k !== "_table" && !seen.includes(k)) seen.push(k);
    };
    storedRows.forEach((r) => {
      const declared = Array.isArray(r?._headers) ? (r._headers as any[]) : [];
      declared.forEach((h) => push(String(h)));
    });
    // fall back to row keys for captures stored without header metadata
    storedRows.forEach((r) => Object.keys(r ?? {}).forEach(push));
    return multiBlock ? ["_table", ...seen] : seen;
  }, [storedRows, multiBlock]);

  const indexed = useMemo(
    () => storedRows.map((r, i) => ({ __i: i, ...r })),
    [storedRows],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return indexed;
    return indexed.filter((r) =>
      headers.some((h) => String(r[h] ?? "").toLowerCase().includes(q)),
    );
  }, [indexed, headers, search]);

  const contentCols: ColumnDef<any>[] = headers.map((h) => ({
    key: h,
    header: h === "_table" ? "Block" : h,
    accessor: (r) => {
      const v = r[h];
      return v === null || v === undefined || v === "" ? <span className="text-muted-foreground">—</span> : String(v);
    },
    sortValue: (r) => {
      const v = r[h];
      const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/\s/g, "").replace(/,/g, ""));
      return Number.isFinite(n) && String(v ?? "").trim() !== "" ? n : String(v ?? "");
    },
  }));

  const exportContent = () => {
    if (!selected) return;
    downloadXlsx(`ace-${kind}-report-${selected.business_date ?? "period"}.xlsx`, [
      {
        name: "Report",
        rows: [headers, ...storedRows.map((r) => headers.map((h) => (r?.[h] ?? null) as any))],
      },
    ]);
  };

  const captureCols: ColumnDef<Capture>[] = [
    { key: "branch", header: "Branch", accessor: (r) => casinoName.get(r.casino_id) ?? "—", sortValue: (r) => casinoName.get(r.casino_id) ?? "" },
    { key: "day", header: "Business day", accessor: (r) => (r.business_date ? fmtDateOnly(r.business_date) : "—"), sortValue: (r) => r.business_date ?? "" },
    { key: "period", header: "Period", accessor: (r) => r.period_label ?? "—", sortValue: (r) => r.period_label ?? "" },
    { key: "cap", header: "Captured", accessor: (r) => fmtDateTime(r.captured_at), sortValue: (r) => r.captured_at ?? "" },
    { key: "rows", header: "Rows", type: "int", accessor: (r) => (Array.isArray(r.rows_data) ? r.rows_data.length : 0), sortValue: (r) => (Array.isArray(r.rows_data) ? r.rows_data.length : 0) },
    {
      key: "sel",
      header: "",
      accessor: (r) => (r.id === selectedId ? <Badge variant="outline">Open</Badge> : null),
    },
  ];

  return (
    <div className="space-y-3">
      <FilterBar
        filters={
          <>
            <Select value={kind} onValueChange={(v) => { setKind(v as any); setSelectedId(null); }}>
              <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="egm">EGM report</SelectItem>
                <SelectItem value="jackpot">Jackpot report</SelectItem>
              </SelectContent>
            </Select>
            <Input
              className="h-9 w-64"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search inside the opened report"
            />
          </>
        }
        right={
          <Button variant="outline" size="sm" onClick={exportContent} disabled={!storedRows.length}>
            <Download className="mr-1 h-4 w-4" /> Export report
          </Button>
        }
      />

      <PageSection title="Captures" card={false}>
        <SmartTable
          data={captures}
          columns={captureCols}
          rowKey={(r) => r.id}
          loading={reports.isLoading}
          stickyHeader
          onRowClick={(r) => setSelectedId(r.id)}
          rowClassName={(r) => (r.id === selectedId ? "bg-muted/40" : undefined)}
          empty={<AceEmpty what="stored report captures" />}
        />
      </PageSection>

      <PageSection
        title={
          selected
            ? `${kind === "egm" ? "EGM" : "Jackpot"} report · ${casinoName.get(selected.casino_id) ?? "—"} · ${selected.period_label ?? "—"}`
            : "Report content"
        }
        card={false}
        titleRight={
          selected ? (
            <span className="text-[11px] text-muted-foreground">
              Stored snapshot · captured {fmtDateTime(selected.captured_at)} · not recalculated
            </span>
          ) : null
        }
      >
        <SmartTable
          data={filtered}
          columns={contentCols}
          rowKey={(r) => r.__i}
          stickyHeader
          empty={<AceEmpty what="report rows" />}
        />
      </PageSection>
    </div>
  );
}
