/**
 * Consolidated slots — landing tab.
 *
 * All figures come from the CMS database (`ace_consolidated_stats` RPC over the
 * stored ACE tables). The UI never talks to ACE directly.
 */
import { useMemo } from "react";
import { PageSection } from "@/components/layout/PageShell";
import { SmartTable, type ColumnDef } from "@/components/ui/smart-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download } from "lucide-react";
import { fmtDateOnly } from "@/lib/format-date";
import { formatMoneyFull } from "@/lib/format-money";
import { downloadXlsx } from "@/lib/excel-export";
import {
  useAceConsolidated,
  useAceEgmCurrent,
  type AceConsolidatedRow,
} from "@/hooks/use-ace-players";
import {
  AceEmpty, Kpi, NA, avgBet, intOrNa, money, signedMoney, sumOrNull,
  type AceScope,
} from "./ace-shared";

interface Props extends AceScope {
  casinoName: Map<string, string>;
}

type Agg = {
  key: string;
  label: string;
  drop: number | null;
  handle: number | null;
  in: number | null;
  out: number | null;
  result: number | null;
  games: number | null;
  players: number | null;
  egms: number | null;
  jackpot: number | null;
  provisional: number;
};

/**
 * Money/count columns are plain sums. Players and EGMs are NOT summable across
 * business days (the same player or machine repeats daily), so unique counts
 * for multi-day scopes come from `ace_consolidated_range_distinct`; summing is
 * only valid across branches within one day.
 */
const aggregate = (
  rows: AceConsolidatedRow[],
  key: string,
  label: string,
  distinct?: { players: number | null; egms: number | null },
): Agg => {
  const oneDay = new Set(rows.map((r) => r.business_date)).size <= 1;
  return {
    key,
    label,
    drop: sumOrNull(rows.map((r) => r.drop_amount)),
    handle: sumOrNull(rows.map((r) => r.handle_amount)),
    in: sumOrNull(rows.map((r) => r.in_amount)),
    out: sumOrNull(rows.map((r) => r.out_amount)),
    result: sumOrNull(rows.map((r) => r.slot_result)),
    games: sumOrNull(rows.map((r) => r.games)),
    players: oneDay ? sumOrNull(rows.map((r) => r.players)) : (distinct?.players ?? null),
    egms: oneDay ? sumOrNull(rows.map((r) => r.egms)) : (distinct?.egms ?? null),
    jackpot: sumOrNull(rows.map((r) => r.jackpot_paid)),
    provisional: rows.reduce((a, r) => a + Number(r.provisional_rows ?? 0), 0),
  };
};

export default function AceConsolidatedTab({ casinoId, from, to, mode, casinoName }: Props) {
  const consolidated = useAceConsolidated(from, to, casinoId, mode === "live" ? 30_000 : false);
  const egms = useAceEgmCurrent(casinoId, mode === "live" ? 25_000 : false);
  const distinct = useAceRangeDistinct(from, to, casinoId);
  const rows = consolidated.data ?? [];
  const dist = (id: string) => {
    const d = distinct.data?.get(id);
    return d ? { players: d.players, egms: d.egms } : undefined;
  };

  const total = useMemo(
    () => aggregate(rows, "total", "Total", dist("__total")),
    [rows, distinct.data],
  );

  /** Active Credits only exist as a current snapshot — never for closed days. */
  const activeCredits = useMemo(() => {
    if (mode !== "live") return null;
    return sumOrNull(((egms.data ?? []) as any[]).map((r) => r.active_credit));
  }, [egms.data, mode]);

  const byBranch = useMemo(() => {
    const m = new Map<string, AceConsolidatedRow[]>();
    rows.forEach((r) => {
      const list = m.get(r.casino_id) ?? [];
      list.push(r);
      m.set(r.casino_id, list);
    });
    return [...m.entries()].map(([id, list]) =>
      aggregate(list, id, casinoName.get(id) ?? list[0]?.casino_name ?? "—"),
    );
  }, [rows, casinoName]);

  const byDay = useMemo(
    () =>
      [...new Set(rows.map((r) => r.business_date))]
        .sort((a, b) => (a < b ? 1 : -1))
        .map((d) => aggregate(rows.filter((r) => r.business_date === d), d, d)),
    [rows],
  );

  const single = !!casinoId;
  const tableRows = single ? byDay : byBranch;
  const provisional = total.provisional > 0;

  const cols: ColumnDef<Agg>[] = [
    {
      key: "label",
      header: single ? "Business day" : "Branch",
      accessor: (r) => (single ? fmtDateOnly(r.label) : r.label),
      sortValue: (r) => r.label,
    },
    { key: "drop", header: "Drop", type: "money", accessor: (r) => money(r.drop), sortValue: (r) => r.drop ?? 0 },
    { key: "handle", header: "Handle", type: "money", accessor: (r) => money(r.handle), sortValue: (r) => r.handle ?? 0 },
    { key: "in", header: "IN", type: "money", accessor: (r) => money(r.in), sortValue: (r) => r.in ?? 0 },
    { key: "out", header: "OUT", type: "money", accessor: (r) => money(r.out), sortValue: (r) => r.out ?? 0 },
    { key: "result", header: "Slot Result", type: "money", accessor: (r) => signedMoney(r.result), sortValue: (r) => r.result ?? 0 },
    { key: "games", header: "Games", type: "int", accessor: (r) => intOrNa(r.games), sortValue: (r) => r.games ?? 0 },
    {
      key: "avg",
      header: "Avg Bet",
      type: "money",
      accessor: (r) => money(avgBet(r.handle, r.games)),
      sortValue: (r) => avgBet(r.handle, r.games) ?? 0,
    },
    { key: "players", header: "Players", type: "int", accessor: (r) => intOrNa(r.players), sortValue: (r) => r.players },
    { key: "egms", header: "EGMs", type: "int", accessor: (r) => intOrNa(r.egms), sortValue: (r) => r.egms },
    { key: "jp", header: "Jackpot paid", type: "money", accessor: (r) => money(r.jackpot), sortValue: (r) => r.jackpot ?? 0 },
    {
      key: "state",
      header: "State",
      accessor: (r) =>
        r.provisional > 0 ? <Badge variant="outline">LIVE</Badge> : <Badge variant="outline">FINAL</Badge>,
      sortValue: (r) => r.provisional,
    },
  ];

  const footer = [
    {
      key: "total",
      className: "font-semibold",
      cell: (col: ColumnDef<Agg>) => {
        switch (col.key) {
          case "label": return "Total";
          case "drop": return money(total.drop);
          case "handle": return money(total.handle);
          case "in": return money(total.in);
          case "out": return money(total.out);
          case "result": return signedMoney(total.result);
          case "games": return intOrNa(total.games);
          case "avg": return money(avgBet(total.handle, total.games));
          case "players": return intOrNa(total.players);
          case "egms": return intOrNa(total.egms);
          case "jp": return money(total.jackpot);
          default: return null;
        }
      },
    },
  ];

  const exportRows = () =>
    downloadXlsx(`ace-consolidated-${from}_${to}.xlsx`, [
      {
        name: "Consolidated",
        rows: [
          [single ? "Business day" : "Branch", "Drop", "Handle", "IN", "OUT", "Slot Result", "Games", "Avg Bet", "Players", "EGMs", "Jackpot paid"],
          ...tableRows.map((r) => [
            r.label, r.drop, r.handle, r.in, r.out, r.result, r.games,
            avgBet(r.handle, r.games), r.players, r.egms, r.jackpot,
          ]),
          ["Total", total.drop, total.handle, total.in, total.out, total.result, total.games,
            avgBet(total.handle, total.games), total.players, total.egms, total.jackpot],
        ],
      },
    ]);

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi label="Drop" value={money(total.drop)} />
        <Kpi label="Handle" value={money(total.handle)} />
        <Kpi label="IN" value={money(total.in)} />
        <Kpi label="OUT" value={money(total.out)} />
        <Kpi label="Slot Result" value={signedMoney(total.result)} hint="IN − OUT" />
        <Kpi label="Games" value={intOrNa(total.games)} />
        <Kpi label="Avg Bet" value={money(avgBet(total.handle, total.games))} hint="Handle / Games" />
        <Kpi
          label="Active Credits"
          value={mode === "live" ? money(activeCredits) : NA}
          hint={mode === "live" ? "current EGM snapshot" : "not stored for closed days"}
        />
        <Kpi label="Players" value={intOrNa(total.players)} />
        <Kpi label="EGMs" value={intOrNa(total.egms)} />
        <Kpi label="Jackpot paid" value={money(total.jackpot)} hint="already inside OUT" />
        <Kpi
          label="Data state"
          value={provisional ? "LIVE" : rows.length ? "FINAL" : "—"}
          hint={provisional ? "range contains provisional days" : "all days final"}
        />
      </div>

      <PageSection
        title={single ? "Daily breakdown" : "By branch"}
        card={false}
        titleRight={
          <Button variant="outline" size="sm" onClick={exportRows} disabled={!tableRows.length}>
            <Download className="mr-1 h-4 w-4" /> Export
          </Button>
        }
      >
        <SmartTable
          data={tableRows}
          columns={cols}
          rowKey={(r) => r.key}
          loading={consolidated.isLoading}
          stickyHeader
          defaultSort={{ key: single ? "label" : "drop", dir: "desc" }}
          footerRows={tableRows.length ? footer : undefined}
          empty={<AceEmpty what="slot activity" />}
        />
      </PageSection>

      <p className="text-[11px] text-muted-foreground">
        Drop = EGM IN · Handle = ACE turnover (total_in) · Slot Result = IN − OUT ·
        Jackpot paid is informational and already included in OUT. Slot figures are never
        combined with table-game results. Amounts in TZS ({formatMoneyFull(0)} = no data reported).
      </p>
    </div>
  );
}
