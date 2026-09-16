/**
 * Jackpots — operational wins log (raw report captures live in Reports).
 * Player enrichment uses existing identity relations only; nothing is written back.
 */
import { useMemo, useState } from "react";
import { PageSection } from "@/components/layout/PageShell";
import { FilterBar } from "@/components/layout/FilterBar";
import { SmartTable, type ColumnDef } from "@/components/ui/smart-table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { fmtDateTime } from "@/lib/format-date";
import { downloadXlsx } from "@/lib/excel-export";
import { useAceJackpotWins } from "@/hooks/use-ace-players";
import { AceEmpty, Kpi, intOrNa, money, sumOrNull, type AceScope } from "./ace-shared";

export default function AceJackpotsTab({
  casinoId,
  from,
  to,
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
    { key: "time", header: "Date / Time", accessor: (r) => (r.occurred_at ? fmtDateTime(r.occurred_at) : "—"), sortValue: (r) => r.occurred_at ?? "" },
    { key: "name", header: "Jackpot", accessor: (r) => r.jackpot_name ?? "—", sortValue: (r) => r.jackpot_name ?? "" },
    { key: "egm", header: "EGM", accessor: (r) => r.egm_code ?? "—", sortValue: (r) => r.egm_code ?? "" },
    {
      key: "player",
      header: "Player",
      accessor: (r) => {
        const identity = Array.isArray(r.player_ace_identities) ? r.player_ace_identities[0] : r.player_ace_identities;
        const player = Array.isArray(identity?.players) ? identity.players[0] : identity?.players;
        const name = `${player?.first_name ?? ""} ${player?.last_name ?? ""}`.trim();
        return name || <span className="text-muted-foreground">N/A</span>;
      },
      sortValue: (r) => {
        const identity = Array.isArray(r.player_ace_identities) ? r.player_ace_identities[0] : r.player_ace_identities;
        const player = Array.isArray(identity?.players) ? identity.players[0] : identity?.players;
        return `${player?.first_name ?? ""} ${player?.last_name ?? ""}`.trim();
      },
    },
    { key: "ace", header: "ACE ID", accessor: (r) => r.ace_player_id ?? "N/A", sortValue: (r) => r.ace_player_id ?? "" },
    { key: "amount", header: "Amount", type: "money", accessor: (r) => money(r.amount), sortValue: (r) => r.amount ?? 0 },
  ];

  const footer = [
    {
      key: "total",
      className: "font-semibold",
      cell: (col: ColumnDef<any>) =>
        col.key === "time" ? `Total · ${rows.length}` : col.key === "amount" ? money(total) : null,
    },
  ];

  const exportRows = () =>
    downloadXlsx(`ace-jackpots-${from}_${to}.xlsx`, [
      {
        name: "Jackpots",
        rows: [
          ["Date / Time", "Jackpot", "EGM", "Player", "ACE ID", "Amount"],
          ...rows.map((r) => [
            r.occurred_at ?? "", r.jackpot_name ?? "", r.egm_code ?? "",
            (() => { const identity = Array.isArray(r.player_ace_identities) ? r.player_ace_identities[0] : r.player_ace_identities; const player = Array.isArray(identity?.players) ? identity.players[0] : identity?.players; return `${player?.first_name ?? ""} ${player?.last_name ?? ""}`.trim(); })(),
            r.ace_player_id ?? "", r.amount,
          ]),
        ],
      },
    ]);

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <Kpi label="Wins" value={intOrNa(rows.length)} />
        <Kpi label="Jackpot paid" value={money(total)} />
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
