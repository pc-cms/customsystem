/**
 * EGM Live — current floor snapshot from the CMS table `ace_egm_current`.
 * Auto-refetched every 25 s; no ACE calls, no derived machine states.
 */
import { useEffect, useMemo, useState } from "react";
import { PageSection } from "@/components/layout/PageShell";
import { FilterBar } from "@/components/layout/FilterBar";
import { SmartTable, type ColumnDef } from "@/components/ui/smart-table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Download } from "lucide-react";
import { fmtDateTime } from "@/lib/format-date";
import { downloadXlsx } from "@/lib/excel-export";
import { useAceEgmCurrent } from "@/hooks/use-ace-players";
import { AceEmpty, Kpi, intOrNa, money, sumOrNull } from "./ace-shared";

const agoLabel = (iso: string | null) => {
  if (!iso) return "—";
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s} sec ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  return `${Math.floor(m / 60)} h ago`;
};

export default function AceEgmLiveTab({
  casinoId,
  casinoName,
}: {
  casinoId: string | null;
  casinoName: Map<string, string>;
}) {
  const egms = useAceEgmCurrent(casinoId);
  const [egm, setEgm] = useState("");
  const [player, setPlayer] = useState("");
  const [state, setState] = useState("all");
  const [, tick] = useState(0);

  // keep "updated X ago" honest between refetches
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 5000);
    return () => clearInterval(t);
  }, []);

  const all = (egms.data ?? []) as any[];
  const states = useMemo(
    () => [...new Set(all.map((r) => r.state).filter(Boolean))].sort(),
    [all],
  );

  const rows = useMemo(
    () =>
      all.filter((r) => {
        if (egm && !String(r.egm_code ?? "").toLowerCase().includes(egm.toLowerCase())) return false;
        if (state !== "all" && r.state !== state) return false;
        if (player) {
          const hay = `${r.ace_player_id ?? ""} ${r.raw_data?.player_display ?? ""}`.toLowerCase();
          if (!hay.includes(player.toLowerCase())) return false;
        }
        return true;
      }),
    [all, egm, state, player],
  );

  const latestObserved = useMemo(
    () => all.reduce<string | null>((acc, r) => (!acc || (r.observed_at ?? "") > acc ? r.observed_at : acc), null),
    [all],
  );
  const creditsTotal = sumOrNull(rows.map((r) => r.active_credit));
  const withPlayer = rows.filter((r) => r.ace_player_id != null).length;

  const cols: ColumnDef<any>[] = [
    { key: "egm", header: "EGM", accessor: (r) => r.egm_code, sortValue: (r) => r.egm_code },
    { key: "branch", header: "Branch", accessor: (r) => casinoName.get(r.casino_id) ?? "—", sortValue: (r) => casinoName.get(r.casino_id) ?? "" },
    { key: "pos", header: "Position", accessor: (r) => r.position ?? "—", sortValue: (r) => r.position ?? "" },
    { key: "state", header: "State", accessor: (r) => r.state ?? "—", sortValue: (r) => r.state ?? "" },
    { key: "player", header: "Player", accessor: (r) => r.ace_player_id ?? r.raw_data?.player_display ?? "—", sortValue: (r) => r.ace_player_id ?? "" },
    { key: "credit", header: "Active credit", type: "money", accessor: (r) => money(r.active_credit), sortValue: (r) => r.active_credit ?? 0 },
    { key: "game", header: "Game", accessor: (r) => r.raw_data?.current_game ?? "—", sortValue: (r) => r.raw_data?.current_game ?? "" },
    { key: "avgbet", header: "Avg bet", type: "money", accessor: (r) => money(r.raw_data?.average_bet), sortValue: (r) => r.raw_data?.average_bet ?? 0 },
    { key: "lastbet", header: "Last bet", type: "money", accessor: (r) => money(r.raw_data?.last_bet), sortValue: (r) => r.raw_data?.last_bet ?? 0 },
    { key: "sgames", header: "Session games", type: "int", accessor: (r) => intOrNa(r.raw_data?.session_games_played), sortValue: (r) => r.raw_data?.session_games_played ?? 0 },
    { key: "seen", header: "Last seen", accessor: (r) => (r.observed_at ? fmtDateTime(r.observed_at) : "—"), sortValue: (r) => r.observed_at ?? "" },
  ];

  const footer = [
    {
      key: "total",
      className: "font-semibold",
      cell: (col: ColumnDef<any>) =>
        col.key === "egm" ? `Total · ${rows.length}` : col.key === "credit" ? money(creditsTotal) : null,
    },
  ];

  const exportRows = () =>
    downloadXlsx("ace-egm-live.xlsx", [
      {
        name: "EGM Live",
        rows: [
          ["EGM", "Branch", "Position", "State", "Player", "Active credit", "Game", "Avg bet", "Last bet", "Session games", "Last seen"],
          ...rows.map((r) => [
            r.egm_code, casinoName.get(r.casino_id) ?? "", r.position ?? "", r.state ?? "",
            r.ace_player_id ?? "", r.active_credit, r.raw_data?.current_game ?? "",
            r.raw_data?.average_bet ?? null, r.raw_data?.last_bet ?? null,
            r.raw_data?.session_games_played ?? null, r.observed_at ?? "",
          ]),
        ],
      },
    ]);

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="EGMs" value={intOrNa(rows.length)} />
        <Kpi label="With ACE player" value={intOrNa(withPlayer)} hint="machines carrying an ACE player id" />
        <Kpi label="Active credits" value={money(creditsTotal)} hint="fresh ACE meter" />
        <Kpi label="Snapshot" value={agoLabel(latestObserved)} hint={latestObserved ? fmtDateTime(latestObserved) : "no observation yet"} />
      </div>

      <FilterBar
        filters={
          <>
            <Input className="h-9 w-32" value={egm} onChange={(e) => setEgm(e.target.value)} placeholder="Search EGM" />
            <Input className="h-9 w-44" value={player} onChange={(e) => setPlayer(e.target.value)} placeholder="Search player" />
            <Select value={state} onValueChange={setState}>
              <SelectTrigger className="h-9 w-40"><SelectValue placeholder="State" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All states</SelectItem>
                {states.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </>
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
          loading={egms.isLoading}
          stickyHeader
          defaultSort={{ key: "egm", dir: "asc" }}
          footerRows={rows.length ? footer : undefined}
          empty={<AceEmpty what="EGM snapshot" />}
        />
      </PageSection>
    </div>
  );
}
