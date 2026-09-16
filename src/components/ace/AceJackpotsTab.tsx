/**
 * Jackpots — operational wins log (raw report captures live in Reports).
 * Player stays blank when the source cannot link an identity; never inferred.
 */
import { useMemo, useState } from "react";
import { PageSection } from "@/components/layout/PageShell";
import { FilterBar } from "@/components/layout/FilterBar";
import { SmartTable, type ColumnDef } from "@/components/ui/smart-table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { fmtDateOnly, fmtDateTime } from "@/lib/format-date";
import { downloadXlsx } from "@/lib/excel-export";
import { useAceJackpotWins } from "@/hooks/use-ace-players";
import { AceEmpty, Kpi, intOrNa, money, sumOrNull, type AceScope } from "./ace-shared";

export default function AceJackpotsTab({
  casinoId,
  from,
  to,
  casinoName,
}: AceScope & { casinoName: Map<string, string> }) {
  const wins = useAceJackpotWins(from, to, casinoId);
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    const all = (wins.data ?? []) as any[];
    const s = q.trim().toLowerCase();
    if (!s) return all;
    return all.filter((r) =>
      `${r.jackpot_name ?? ""} ${r.egm_code ?? ""} ${r.ace_player_id ?? ""}`.toLowerCase().includes(s),
    );
  }, [wins.data, q]);

  const total = sumOrNull(rows.map((r) => r.amount));

  const cols: ColumnDef<any>[] = [
    { key: "day", header: "Business day", accessor: (r) => fmtDateOnly(r.business_date), sortValue: (r) => r.business_date ?? "" },
    { key: "time", header: "Time", accessor: (r) => (r.occurred_at ? fmtDateTime(r.occurred_at) : "—"), sortValue: (r) => r.occurred_at ?? "" },
    { key: "branch", header: "Branch", accessor: (r) => casinoName.get(r.casino_id) ?? "—", sortValue: (r) => casinoName.get(r.casino_id) ?? "" },
    { key: "name", header: "Jackpot", accessor: (r) => r.jackpot_name ?? "—", sortValue: (r) => r.jackpot_name ?? "" },
    { key: "egm", header: "EGM", accessor: (r) => r.egm_code ?? "—", sortValue: (r) => r.egm_code ?? "" },
    {
      key: "player",
      header: "ACE player",
      accessor: (r) => (r.identity_id ? r.ace_player_id ?? "—" : <span className="text-muted-foreground">not linked</span>),
      sortValue: (r) => r.ace_player_id ?? "",
    },
    { key: "amount", header: "Amount", type: "money", accessor: (r) => money(r.amount), sortValue: (r) => r.amount ?? 0 },
  ];

  const footer = [
    {
      key: "total",
      className: "font-semibold",
      cell: (col: ColumnDef<any>) =>
        col.key === "day" ? `Total · ${rows.length}` : col.key === "amount" ? money(total) : null,
    },
  ];

  const exportRows = () =>
    downloadXlsx(`ace-jackpots-${from}_${to}.xlsx`, [
      {
        name: "Jackpots",
        rows: [
          ["Business day", "Time", "Branch", "Jackpot", "EGM", "ACE player", "Amount"],
          ...rows.map((r) => [
            r.business_date, r.occurred_at ?? "", casinoName.get(r.casino_id) ?? "",
            r.jackpot_name ?? "", r.egm_code ?? "", r.identity_id ? r.ace_player_id ?? "" : "", r.amount,
          ]),
        ],
      },
    ]);

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <Kpi label="Wins" value={intOrNa(rows.length)} />
        <Kpi label="Jackpot paid" value={money(total)} hint="already included in OUT" />
        <Kpi label="Linked to a player" value={intOrNa(rows.filter((r) => r.identity_id).length)} />
      </div>

      <FilterBar
        filters={
          <Input className="h-9 w-64" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search jackpot / EGM / ACE ID" />
        }
        right={
          <Button variant="outline" size="sm" onClick={exportRows} disabled={!rows.length}>
            <Download className="mr-1 h-4 w-4" /> Export
          </Button>
        }
      />

      <PageSection card={false}>
        <SmartTable
          data={rows}
          columns={cols}
          rowKey={(r) => r.id}
          loading={wins.isLoading}
          stickyHeader
          defaultSort={{ key: "time", dir: "desc" }}
          footerRows={rows.length ? footer : undefined}
          empty={<AceEmpty what="jackpot wins" />}
        />
      </PageSection>
    </div>
  );
}
