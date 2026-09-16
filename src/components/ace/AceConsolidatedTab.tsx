/** Consolidated slot statistics from stored CMS ACE data only. */
import { useEffect, useMemo, useState } from "react";
import { PageSection } from "@/components/layout/PageShell";
import { FilterBar } from "@/components/layout/FilterBar";
import { SmartTable, type ColumnDef } from "@/components/ui/smart-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download } from "lucide-react";
import { fmtDateOnly, fmtDateTime } from "@/lib/format-date";
import { getBusinessDate } from "@/lib/business-day";
import { presetRange } from "@/components/ui/date-range-presets";
import { downloadXlsx } from "@/lib/excel-export";
import { useAceConsolidated, useAceEgmCurrent, useAcePeriods, useAceRangeDistinct, type AceConsolidatedRow } from "@/hooks/use-ace-players";
import { AceEmpty, Kpi, NA, avgBet, intOrNa, money, signedMoney, sumOrNull, type AceConsolidatedMode } from "./ace-shared";

interface Props {
  casinoId: string | null;
  casinoName: Map<string, string>;
  operational?: boolean;
  onRangeChange?: (range: { from: string; to: string }) => void;
}
type Agg = { key: string; label: string; drop: number | null; handle: number | null; in: number | null; out: number | null; result: number | null; games: number | null; players: number | null; egms: number | null; jackpot: number | null; provisional: number };

const aggregate = (rows: AceConsolidatedRow[], key: string, label: string, distinct?: { players: number | null; egms: number | null }): Agg => {
  const oneDay = new Set(rows.map((r) => r.business_date)).size <= 1;
  return {
    key, label,
    drop: sumOrNull(rows.map((r) => r.drop_amount)), handle: sumOrNull(rows.map((r) => r.handle_amount)),
    in: sumOrNull(rows.map((r) => r.in_amount)), out: sumOrNull(rows.map((r) => r.out_amount)),
    result: sumOrNull(rows.map((r) => r.slot_result)), games: sumOrNull(rows.map((r) => r.games)),
    players: oneDay ? sumOrNull(rows.map((r) => r.players)) : (distinct?.players ?? null),
    egms: oneDay ? sumOrNull(rows.map((r) => r.egms)) : (distinct?.egms ?? null),
    jackpot: sumOrNull(rows.map((r) => r.jackpot_paid)),
    provisional: rows.reduce((a, r) => a + Number(r.provisional_rows ?? 0), 0),
  };
};

export default function AceConsolidatedTab({ casinoId, casinoName, operational = false, onRangeChange }: Props) {
  const today = getBusinessDate();
  const month = presetRange("month", new Date(`${today}T12:00:00`));
  const [view, setView] = useState<AceConsolidatedMode>(operational ? "current" : "month");
  const periods = useAcePeriods(casinoId);
  const [periodKey, setPeriodKey] = useState("");
  const selectedPeriod = (periods.data ?? []).find((p: any) => p.key === periodKey) ?? null;
  const range = view === "current"
    ? { from: today, to: today }
    : view === "period" && selectedPeriod
      ? { from: selectedPeriod.from as string, to: selectedPeriod.to as string }
      : { from: month.from, to: today };

  useEffect(() => {
    if (view === "period" && !periodKey && (periods.data ?? []).length) setPeriodKey((periods.data ?? [])[0].key);
  }, [view, periodKey, periods.data]);
  useEffect(() => onRangeChange?.(range), [range.from, range.to, onRangeChange]);

  const live = view === "current";
  const consolidated = useAceConsolidated(range.from, range.to, casinoId, live ? 30_000 : false);
  const egms = useAceEgmCurrent(casinoId, live ? 30_000 : false);
  const distinct = useAceRangeDistinct(range.from, range.to, casinoId);
  const rows = consolidated.data ?? [];
  const dist = (id: string) => {
    const d = distinct.data?.get(id);
    return d ? { players: d.players, egms: d.egms } : undefined;
  };
  const total = useMemo(() => aggregate(rows, "total", "Total", dist("__total")), [rows, distinct.data]);
  const activeCredits = live ? sumOrNull(((egms.data ?? []) as any[]).map((r) => r.active_credit)) : null;
  const byDay = useMemo(() => [...new Set(rows.map((r) => r.business_date))].sort((a, b) => b.localeCompare(a)).map((day) => aggregate(rows.filter((r) => r.business_date === day), day, day)), [rows]);
  const byBranch = useMemo(() => {
    const map = new Map<string, AceConsolidatedRow[]>();
    rows.forEach((r) => map.set(r.casino_id, [...(map.get(r.casino_id) ?? []), r]));
    return [...map.entries()].map(([id, list]) => aggregate(list, id, casinoName.get(id) ?? list[0]?.casino_name ?? "—", dist(id)));
  }, [rows, casinoName, distinct.data]);
  const tableRows = operational ? byDay : byBranch;

  const cols: ColumnDef<Agg>[] = [
    { key: "label", header: operational ? "Date" : "Branch", accessor: (r) => operational ? fmtDateOnly(r.label) : r.label, sortValue: (r) => r.label },
    { key: "drop", header: "Drop", type: "money", accessor: (r) => money(r.drop), sortValue: (r) => r.drop },
    { key: "handle", header: "Handle", type: "money", accessor: (r) => money(r.handle), sortValue: (r) => r.handle },
    { key: "in", header: "IN", type: "money", accessor: (r) => money(r.in), sortValue: (r) => r.in },
    { key: "out", header: "OUT", type: "money", accessor: (r) => money(r.out), sortValue: (r) => r.out },
    { key: "result", header: "Slot Result", type: "money", accessor: (r) => signedMoney(r.result), sortValue: (r) => r.result },
    { key: "games", header: "Games", type: "int", accessor: (r) => intOrNa(r.games), sortValue: (r) => r.games },
    { key: "players", header: "Players", type: "int", accessor: (r) => intOrNa(r.players), sortValue: (r) => r.players },
    { key: "egms", header: "EGMs", type: "int", accessor: (r) => intOrNa(r.egms), sortValue: (r) => r.egms },
    { key: "jp", header: "Jackpot", type: "money", accessor: (r) => money(r.jackpot), sortValue: (r) => r.jackpot },
    { key: "state", header: "State", accessor: (r) => <Badge variant="outline">{r.provisional > 0 ? "LIVE" : "FINAL"}</Badge>, sortValue: (r) => r.provisional },
  ];
  const footer = [{ key: "total", className: "font-semibold", cell: (col: ColumnDef<Agg>) => ({
    label: "Total", drop: money(total.drop), handle: money(total.handle), in: money(total.in), out: money(total.out),
    result: signedMoney(total.result), games: intOrNa(total.games), players: intOrNa(total.players), egms: intOrNa(total.egms), jp: money(total.jackpot),
  } as Record<string, any>)[col.key] ?? null }];
  const exportRows = () => downloadXlsx(`ace-consolidated-${range.from}_${range.to}.xlsx`, [{ name: "Consolidated", rows: [
    [operational ? "Date" : "Branch", "Drop", "Handle", "IN", "OUT", "Slot Result", "Games", "Players", "EGMs", "Jackpot"],
    ...tableRows.map((r) => [r.label, r.drop, r.handle, r.in, r.out, r.result, r.games, r.players, r.egms, r.jackpot]),
  ] }]);

  return <div className="space-y-3">
    <FilterBar filters={<>
      <div className="flex gap-1">
        <Button size="sm" className="h-9" variant={view === "current" ? "default" : "outline"} onClick={() => setView("current")}>Current Day</Button>
        <Button size="sm" className="h-9" variant={view === "month" ? "default" : "outline"} onClick={() => setView("month")}>This Month</Button>
        <Button size="sm" className="h-9" variant={view === "period" ? "default" : "outline"} onClick={() => setView("period")}>Closed Period</Button>
      </div>
      {view === "period" && <Select value={periodKey} onValueChange={setPeriodKey}>
        <SelectTrigger className="h-9 min-w-72"><SelectValue placeholder="Select stored ACE period" /></SelectTrigger>
        <SelectContent>{(periods.data ?? []).map((p: any) => <SelectItem key={p.key} value={p.key}>{p.period_label || `${fmtDateOnly(p.from)} – ${fmtDateOnly(p.to)}`} · {fmtDateTime(p.captured_at)}</SelectItem>)}</SelectContent>
      </Select>}
    </>} right={<Button variant="outline" size="sm" onClick={exportRows} disabled={!tableRows.length}><Download className="mr-1 h-4 w-4" /> Export</Button>} />
    <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
      <Kpi label="Drop" value={money(total.drop)} /><Kpi label="Handle" value={money(total.handle)} /><Kpi label="IN" value={money(total.in)} />
      <Kpi label="OUT" value={money(total.out)} /><Kpi label="Slot Result" value={signedMoney(total.result)} /><Kpi label="Games" value={intOrNa(total.games)} />
      <Kpi label="Avg Bet" value={money(avgBet(total.handle, total.games))} /><Kpi label="Active Credits" value={live ? money(activeCredits) : NA} />
      <Kpi label="Players" value={intOrNa(total.players)} /><Kpi label="EGMs" value={intOrNa(total.egms)} /><Kpi label="Jackpot" value={money(total.jackpot)} />
      <Kpi label="Data State" value={total.provisional > 0 ? "LIVE" : rows.length ? "FINAL" : "—"} />
    </div>
    <PageSection title={operational ? "Slot statistics by day" : "Slot statistics by branch"} card={false}>
      <SmartTable data={tableRows} columns={cols} rowKey={(r) => r.key} loading={consolidated.isLoading} stickyHeader defaultSort={{ key: operational ? "label" : "drop", dir: "desc" }} footerRows={tableRows.length ? footer : undefined} empty={<AceEmpty what="slot activity" />} />
    </PageSection>
  </div>;
}
