/**
 * Players tab — one row per CMS player for the selected range, with a
 * per-player drill panel over `ace_player_egm_daily`.
 */
import { useMemo, useState } from "react";
import { PageSection } from "@/components/layout/PageShell";
import { SmartTable, type ColumnDef } from "@/components/ui/smart-table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { FilterBar } from "@/components/layout/FilterBar";
import { Download } from "lucide-react";
import { fmtDateOnly, fmtDateTime } from "@/lib/format-date";
import { downloadXlsx } from "@/lib/excel-export";
import {
  useAcePlayerStats,
  useAcePlayerActivityMeta,
  useAcePlayerEgmDaily,
  type AcePlayerStatsRow,
} from "@/hooks/use-ace-players";
import { AceEmpty, avgBet, intOrNa, money, signedMoney, sumOrNull, type AceScope } from "./ace-shared";

const DrillPanel = ({
  player,
  from,
  to,
  onClose,
}: {
  player: AcePlayerStatsRow | null;
  from: string;
  to: string;
  onClose: () => void;
}) => {
  const daily = useAcePlayerEgmDaily(player?.player_id, from, to, !!player);
  const rows = (daily.data ?? []) as any[];
  return (
    <Sheet open={!!player} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-3xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{player?.player_name || "Player"} · slot activity</SheetTitle>
        </SheetHeader>
        <div className="mt-4">
          <SmartTable
            data={rows}
            rowKey={(r: any) => r.id}
            loading={daily.isLoading}
            stickyHeader
            empty={<AceEmpty what="daily EGM rows" />}
            columns={[
              { key: "day", header: "Business day", accessor: (r: any) => fmtDateOnly(r.business_date), sortValue: (r: any) => r.business_date },
              { key: "egm", header: "EGM", accessor: (r: any) => r.egm_code, sortValue: (r: any) => r.egm_code },
              { key: "ace", header: "ACE ID", accessor: (r: any) => r.ace_player_id ?? "—" },
              { key: "in", header: "IN", type: "money", accessor: (r: any) => money(r.in_amount), sortValue: (r: any) => r.in_amount ?? 0 },
              { key: "out", header: "OUT", type: "money", accessor: (r: any) => money(r.out_amount), sortValue: (r: any) => r.out_amount ?? 0 },
              { key: "drop", header: "Drop", type: "money", accessor: (r: any) => money(r.drop_amount), sortValue: (r: any) => r.drop_amount ?? 0 },
              { key: "handle", header: "Handle", type: "money", accessor: (r: any) => money(r.handle_amount), sortValue: (r: any) => r.handle_amount ?? 0 },
              {
                key: "res",
                header: "Result",
                type: "money",
                accessor: (r: any) =>
                  r.in_amount === null && r.out_amount === null
                    ? money(null)
                    : signedMoney(Number(r.in_amount ?? 0) - Number(r.out_amount ?? 0)),
              },
              { key: "games", header: "Games", type: "int", accessor: (r: any) => intOrNa(r.games), sortValue: (r: any) => r.games ?? 0 },
              { key: "last", header: "Last play", accessor: (r: any) => (r.last_play_at ? fmtDateTime(r.last_play_at) : "—") },
              {
                key: "state",
                header: "State",
                accessor: (r: any) => <Badge variant="outline">{r.is_final ? "FINAL" : "LIVE"}</Badge>,
              },
            ]}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default function AcePlayersTab({ casinoId, from, to }: AceScope) {
  const players = useAcePlayerStats(from, to, casinoId);
  const activity = useAcePlayerActivityMeta(from, to, casinoId);
  const [name, setName] = useState("");
  const [aceId, setAceId] = useState("");
  const [card, setCard] = useState("");
  const [egm, setEgm] = useState("");
  const [selected, setSelected] = useState<AcePlayerStatsRow | null>(null);

  const rows = useMemo(() => {
    const list = players.data ?? [];
    const has = (arr: string[] | null, q: string) =>
      !q || (arr ?? []).some((x) => x.toLowerCase().includes(q.toLowerCase()));
    return list.filter(
      (r) =>
        (!name || (r.player_name ?? "").toLowerCase().includes(name.toLowerCase())) &&
        has(r.ace_ids, aceId) &&
        has(r.cards, card) &&
        has(r.egm_codes, egm),
    );
  }, [players.data, name, aceId, card, egm]);

  const totals = useMemo(
    () => ({
      drop: sumOrNull(rows.map((r) => r.drop_amount)),
      handle: sumOrNull(rows.map((r) => r.handle_amount)),
      in: sumOrNull(rows.map((r) => r.in_amount)),
      out: sumOrNull(rows.map((r) => r.out_amount)),
      result: sumOrNull(rows.map((r) => r.slot_result)),
      games: sumOrNull(rows.map((r) => r.games)),
      jp: sumOrNull(rows.map((r) => r.jackpot_amount)),
    }),
    [rows],
  );

  const cols: ColumnDef<AcePlayerStatsRow>[] = [
    { key: "ace", header: "ACE ID", accessor: (r) => (r.ace_ids ?? []).join(" · ") || "—", sortValue: (r) => (r.ace_ids ?? []).join(" "), cellClassName: "font-mono" },
    {
      key: "player",
      header: "Player",
      accessor: (r) => (
        <span className="flex items-center gap-2">
          <span className="truncate">{r.player_name || "—"}</span>
          {r.is_ace_auto && <Badge variant="outline">ACE</Badge>}
        </span>
      ),
      sortValue: (r) => r.player_name ?? "",
    },
    { key: "cards", header: "Card(s)", accessor: (r) => (r.cards ?? []).join(" · ") || "—", sortValue: (r) => (r.cards ?? []).join(" "), cellClassName: "font-mono" },
    { key: "visits", header: "Visits", type: "int", accessor: (r) => intOrNa(activity.data?.get(r.player_id)?.visits), sortValue: (r) => activity.data?.get(r.player_id)?.visits },
    {
      key: "last",
      header: "Last activity",
      accessor: (r) => {
        const value = r.last_activity ?? activity.data?.get(r.player_id)?.last_activity;
        return value ? fmtDateTime(value) : "—";
      },
      sortValue: (r) => r.last_activity ?? activity.data?.get(r.player_id)?.last_activity ?? "",
    },
    { key: "drop", header: "Drop", type: "money", accessor: (r) => money(r.drop_amount), sortValue: (r) => r.drop_amount ?? 0 },
    { key: "handle", header: "Handle", type: "money", accessor: (r) => money(r.handle_amount), sortValue: (r) => r.handle_amount ?? 0 },
    { key: "in", header: "IN", type: "money", accessor: (r) => money(r.in_amount), sortValue: (r) => r.in_amount ?? 0 },
    { key: "out", header: "OUT", type: "money", accessor: (r) => money(r.out_amount), sortValue: (r) => r.out_amount ?? 0 },
    { key: "result", header: "Slot Result", type: "money", accessor: (r) => signedMoney(r.slot_result), sortValue: (r) => r.slot_result ?? 0 },
    { key: "games", header: "Games", type: "int", accessor: (r) => intOrNa(r.games), sortValue: (r) => r.games ?? 0 },
    {
      key: "avg",
      header: "Avg Bet",
      type: "money",
      accessor: (r) => money(avgBet(r.handle_amount, r.games)),
      sortValue: (r) => avgBet(r.handle_amount, r.games) ?? 0,
    },
    {
      key: "jp",
      header: "Jackpots",
      type: "money",
      accessor: (r) => (r.jackpot_count ? `${r.jackpot_count} · ${new Intl.NumberFormat("en-US").format(Number(r.jackpot_amount ?? 0)).replace(/,/g, " ")}` : "—"),
      sortValue: (r) => r.jackpot_amount ?? 0,
    },
  ];

  const footer = [
    {
      key: "total",
      className: "font-semibold",
      cell: (col: ColumnDef<AcePlayerStatsRow>) => {
        switch (col.key) {
          case "ace": return `Total · ${rows.length}`;
          case "drop": return money(totals.drop);
          case "handle": return money(totals.handle);
          case "in": return money(totals.in);
          case "out": return money(totals.out);
          case "result": return signedMoney(totals.result);
          case "games": return intOrNa(totals.games);
          case "avg": return money(avgBet(totals.handle, totals.games));
          case "jp": return money(totals.jp);
          default: return null;
        }
      },
    },
  ];

  const exportRows = () =>
    downloadXlsx(`ace-players-${from}_${to}.xlsx`, [
      {
        name: "Players",
        rows: [
          ["ACE IDs", "Player", "Cards", "Visits", "Last activity", "Drop", "Handle", "IN", "OUT", "Slot Result", "Games", "Avg Bet", "JP count", "JP amount"],
          ...rows.map((r) => [
            (r.ace_ids ?? []).join(" "), r.player_name ?? "", (r.cards ?? []).join(" "), activity.data?.get(r.player_id)?.visits ?? null, r.last_activity ?? activity.data?.get(r.player_id)?.last_activity ?? "",
            r.drop_amount, r.handle_amount, r.in_amount, r.out_amount, r.slot_result, r.games,
            avgBet(r.handle_amount, r.games), r.jackpot_count, r.jackpot_amount,
          ]),
        ],
      },
    ]);

  return (
    <div className="space-y-3">
      <FilterBar
        filters={
          <>
            <Input className="h-9 w-48" value={name} onChange={(e) => setName(e.target.value)} placeholder="Search player name" />
            <Input className="h-9 w-40" value={aceId} onChange={(e) => setAceId(e.target.value)} placeholder="Search ACE ID" />
            <Input className="h-9 w-36" value={card} onChange={(e) => setCard(e.target.value)} placeholder="Search card" />
            <Input className="h-9 w-32" value={egm} onChange={(e) => setEgm(e.target.value)} placeholder="Search EGM" />
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
          rowKey={(r) => r.player_id}
          loading={players.isLoading || activity.isLoading}
          stickyHeader
          defaultSort={{ key: "drop", dir: "desc" }}
          onRowClick={(r) => setSelected(r)}
          rowClassName={(r) => r.is_ace_auto ? "bg-muted/25" : undefined}
          footerRows={rows.length ? footer : undefined}
          empty={<AceEmpty what="ACE player statistics" />}
        />
      </PageSection>
      <p className="text-[11px] text-muted-foreground">Click a row to see that player's day × EGM breakdown.</p>

      <DrillPanel player={selected} from={from} to={to} onClose={() => setSelected(null)} />
    </div>
  );
}
