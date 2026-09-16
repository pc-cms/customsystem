/**
 * Analytics → ACE (super_admin only, first version).
 *
 * Read-only surface over the additive ACE player/slot tables. The collector
 * jobs that fill them are NOT enabled yet, so every tab must render a useful
 * empty state instead of pretending to have data.
 *
 * Canon here: Drop = IN, Handle = ACE turnover only (N/A when missing),
 * Slot Result = IN - OUT. Table/player Result formulas elsewhere in the CMS
 * are untouched by this module.
 */
import { useMemo, useState } from "react";
import { PageShell, PageSection } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { SmartTable, type ColumnDef } from "@/components/ui/smart-table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Activity, Download } from "lucide-react";
import { getBusinessDate } from "@/lib/business-day";
import { fmtDateOnly, fmtDateTime } from "@/lib/format-date";
import { formatMoneyFull } from "@/lib/format-money";
import { downloadXlsx } from "@/lib/excel-export";
import {
  useAceCasinos,
  useAcePlayerStats,
  useAceEgmCurrent,
  useAceReports,
  useAceJackpotWins,
  useAceOverview,
  type AcePlayerStatsRow,
} from "@/hooks/use-ace-players";

const NA = <span className="text-muted-foreground">N/A</span>;
const money = (v: number | null | undefined) =>
  v === null || v === undefined ? NA : formatMoneyFull(v);

const EmptyState = ({ what }: { what: string }) => (
  <div className="py-10 text-center text-sm text-muted-foreground">
    No {what} yet. The ACE collector for players, EGMs and jackpots is not connected —
    data appears here as soon as it starts sending.
  </div>
);

export default function AceAnalytics() {
  const today = getBusinessDate();
  const [casinoId, setCasinoId] = useState<string>("all");
  const [from, setFrom] = useState<string>(today);
  const [to, setTo] = useState<string>(today);
  const [playerQuery, setPlayerQuery] = useState("");
  const [aceQuery, setAceQuery] = useState("");
  const [egmQuery, setEgmQuery] = useState("");

  const scope = casinoId === "all" ? null : casinoId;
  const { data: casinos = [] } = useAceCasinos();
  const casinoName = useMemo(
    () => new Map(casinos.map((c) => [c.id, c.name])),
    [casinos],
  );

  const overview = useAceOverview(from, to, scope);
  const players = useAcePlayerStats(from, to, scope);
  const egms = useAceEgmCurrent(scope);
  const egmReports = useAceReports("egm", from, to, scope);
  const jpReports = useAceReports("jackpot", from, to, scope);
  const jackpots = useAceJackpotWins(from, to, scope);

  const playerRows = useMemo(() => {
    const rows = players.data ?? [];
    const p = playerQuery.trim().toLowerCase();
    const a = aceQuery.trim().toLowerCase();
    const e = egmQuery.trim().toLowerCase();
    return rows.filter((r) => {
      if (p && !(r.player_name ?? "").toLowerCase().includes(p)) return false;
      if (a && !(r.ace_ids ?? []).some((x) => x.toLowerCase().includes(a))) return false;
      if (e && !(r.egm_codes ?? []).some((x) => x.toLowerCase().includes(e))) return false;
      return true;
    });
  }, [players.data, playerQuery, aceQuery, egmQuery]);

  const playerCols: ColumnDef<AcePlayerStatsRow>[] = [
    {
      key: "player",
      header: "Player",
      accessor: (r) => (
        <span className="flex items-center gap-2">
          <a className="hover:underline" href={`/players/${r.player_id}`}>
            {r.player_name || "—"}
          </a>
          {r.is_ace_auto && <Badge variant="outline">ACE</Badge>}
        </span>
      ),
      sortValue: (r) => r.player_name ?? "",
    },
    { key: "ace", header: "ACE ID(s)", accessor: (r) => (r.ace_ids ?? []).join(", ") || "—" },
    { key: "cards", header: "Card(s)", accessor: (r) => (r.cards ?? []).join(", ") || "—" },
    { key: "egms", header: "EGM(s)", accessor: (r) => (r.egm_codes ?? []).join(", ") || "—" },
    { key: "drop", header: "Drop", type: "money", accessor: (r) => money(r.drop_amount), sortValue: (r) => r.drop_amount ?? 0 },
    { key: "handle", header: "Handle", type: "money", accessor: (r) => money(r.handle_amount), sortValue: (r) => r.handle_amount ?? 0 },
    { key: "in", header: "IN", type: "money", accessor: (r) => money(r.in_amount), sortValue: (r) => r.in_amount ?? 0 },
    { key: "out", header: "OUT", type: "money", accessor: (r) => money(r.out_amount), sortValue: (r) => r.out_amount ?? 0 },
    {
      key: "result",
      header: "Slot Result",
      type: "money",
      accessor: (r) =>
        r.slot_result === null || r.slot_result === undefined ? (
          NA
        ) : (
          <span className={r.slot_result >= 0 ? "cms-amount-positive" : "cms-amount-negative"}>
            {formatMoneyFull(r.slot_result)}
          </span>
        ),
      sortValue: (r) => r.slot_result ?? 0,
    },
    { key: "games", header: "Games", type: "int", accessor: (r) => r.games ?? NA, sortValue: (r) => r.games ?? 0 },
    {
      key: "jp",
      header: "Jackpots",
      type: "int",
      accessor: (r) =>
        r.jackpot_count ? `${r.jackpot_count} · ${formatMoneyFull(r.jackpot_amount ?? 0)}` : "—",
      sortValue: (r) => r.jackpot_amount ?? 0,
    },
    {
      key: "last",
      header: "Last activity",
      accessor: (r) => (r.last_activity ? fmtDateTime(r.last_activity) : "—"),
      sortValue: (r) => r.last_activity ?? "",
    },
  ];

  const exportPlayers = () =>
    downloadXlsx(`ace-players-${from}_${to}.xlsx`, [
      {
        name: "Players",
        rows: [
          ["Player", "ACE IDs", "Cards", "EGMs", "Drop", "Handle", "IN", "OUT", "Slot Result", "Games", "JP count", "JP amount", "Last activity"],
          ...playerRows.map((r) => [
            r.player_name ?? "",
            (r.ace_ids ?? []).join(" "),
            (r.cards ?? []).join(" "),
            (r.egm_codes ?? []).join(" "),
            r.drop_amount,
            r.handle_amount,
            r.in_amount,
            r.out_amount,
            r.slot_result,
            r.games,
            r.jackpot_count,
            r.jackpot_amount,
            r.last_activity ?? "",
          ]),
        ],
      },
    ]);

  return (
    <PageShell>
      <PageHeader icon={Activity} title="ACE Analytics" subtitle="Slot player, EGM and jackpot data from ACE">
        <Badge variant="outline">Test mode · super admin</Badge>
      </PageHeader>

      <PageSection>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <Label className="text-xs">Branch</Label>
            <Select value={casinoId} onValueChange={setCasinoId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All branches</SelectItem>
                {casinos.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Business day from</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">to</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Player</Label>
            <Input value={playerQuery} onChange={(e) => setPlayerQuery(e.target.value)} placeholder="Name" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">ACE ID</Label>
              <Input value={aceQuery} onChange={(e) => setAceQuery(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">EGM</Label>
              <Input value={egmQuery} onChange={(e) => setEgmQuery(e.target.value)} />
            </div>
          </div>
        </div>
      </PageSection>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="players">Players</TabsTrigger>
          <TabsTrigger value="egm">EGM Status</TabsTrigger>
          <TabsTrigger value="egm-report">EGM Report</TabsTrigger>
          <TabsTrigger value="jp-report">Jackpot Report</TabsTrigger>
        </TabsList>

        {/* ---------------- Overview ---------------- */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "ACE players", value: overview.data?.identityCount ?? 0 },
              { label: "EGMs seen", value: overview.data?.egmCount ?? 0 },
              { label: "Transactions in period", value: overview.data?.txCount ?? 0 },
              { label: "Jackpot wins in period", value: jackpots.data?.length ?? 0 },
            ].map((k) => (
              <PageSection key={k.label}>
                <div className="text-xs uppercase text-muted-foreground">{k.label}</div>
                <div className="text-2xl font-semibold tabular-nums">{k.value}</div>
              </PageSection>
            ))}
          </div>

          <PageSection title="Collector status per branch">
            <SmartTable
              data={(overview.data?.keys ?? []) as any[]}
              rowKey={(r: any) => r.location_code}
              loading={overview.isLoading}
              empty={<EmptyState what="ACE collector keys" />}
              columns={[
                { key: "loc", header: "Location", accessor: (r: any) => r.location_code },
                {
                  key: "casino",
                  header: "Branch",
                  accessor: (r: any) => (r.casino_id ? casinoName.get(r.casino_id) ?? "—" : "not linked"),
                },
                {
                  key: "active",
                  header: "Active",
                  accessor: (r: any) => (r.is_active ? "Yes" : "No"),
                },
                {
                  key: "seen",
                  header: "Last seen",
                  accessor: (r: any) => (r.last_seen_at ? fmtDateTime(r.last_seen_at) : "never"),
                },
              ]}
            />
          </PageSection>

          <div className="grid gap-3 md:grid-cols-2">
            <PageSection title="Latest EGM report">
              <div className="text-sm">
                {overview.data?.latestEgmReport
                  ? `${overview.data.latestEgmReport.period_label ?? "—"} · ${fmtDateTime(overview.data.latestEgmReport.captured_at)}`
                  : "Not received yet"}
              </div>
            </PageSection>
            <PageSection title="Latest Jackpot report">
              <div className="text-sm">
                {overview.data?.latestJackpotReport
                  ? `${overview.data.latestJackpotReport.period_label ?? "—"} · ${fmtDateTime(overview.data.latestJackpotReport.captured_at)}`
                  : "Not received yet"}
              </div>
            </PageSection>
          </div>
        </TabsContent>

        {/* ---------------- Players ---------------- */}
        <TabsContent value="players" className="space-y-3">
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={exportPlayers} disabled={!playerRows.length}>
              <Download className="w-4 h-4 mr-1" /> Export
            </Button>
          </div>
          <SmartTable
            data={playerRows}
            columns={playerCols}
            rowKey={(r) => r.player_id}
            loading={players.isLoading}
            defaultSort={{ key: "drop", dir: "desc" }}
            empty={<EmptyState what="ACE player statistics" />}
          />
        </TabsContent>

        {/* ---------------- EGM status ---------------- */}
        <TabsContent value="egm">
          <SmartTable
            data={(egms.data ?? []).filter((r: any) =>
              !egmQuery.trim() || String(r.egm_code).toLowerCase().includes(egmQuery.trim().toLowerCase()),
            )}
            rowKey={(r: any) => r.id}
            loading={egms.isLoading}
            empty={<EmptyState what="EGM status" />}
            columns={[
              { key: "egm", header: "EGM", accessor: (r: any) => r.egm_code, sortValue: (r: any) => r.egm_code },
              { key: "branch", header: "Branch", accessor: (r: any) => casinoName.get(r.casino_id) ?? "—" },
              { key: "pos", header: "Position", accessor: (r: any) => r.position ?? "—" },
              { key: "state", header: "State", accessor: (r: any) => r.state ?? "—" },
              {
                key: "player",
                header: "Player",
                accessor: (r: any) => r.ace_player_id ?? r.raw_data?.player_display ?? "—",
              },
              {
                key: "credit",
                header: "Active credit",
                type: "money",
                accessor: (r: any) => money(r.active_credit),
                sortValue: (r: any) => r.active_credit ?? 0,
              },
              { key: "game", header: "Game", accessor: (r: any) => r.raw_data?.current_game ?? "—" },
              {
                key: "avgbet",
                header: "Avg bet",
                type: "money",
                accessor: (r: any) =>
                  r.raw_data?.average_bet === null || r.raw_data?.average_bet === undefined
                    ? "—"
                    : money(r.raw_data.average_bet),
                sortValue: (r: any) => r.raw_data?.average_bet ?? 0,
              },
              {
                key: "lastbet",
                header: "Last bet",
                type: "money",
                accessor: (r: any) =>
                  r.raw_data?.last_bet === null || r.raw_data?.last_bet === undefined
                    ? "—"
                    : money(r.raw_data.last_bet),
                sortValue: (r: any) => r.raw_data?.last_bet ?? 0,
              },
              {
                key: "sgames",
                header: "Session games",
                accessor: (r: any) =>
                  r.raw_data?.session_games_played ?? "—",
                sortValue: (r: any) => r.raw_data?.session_games_played ?? 0,
              },
              {
                key: "seen",
                header: "Last seen",
                accessor: (r: any) => (r.observed_at ? fmtDateTime(r.observed_at) : "—"),
              },
            ]}
          />
        </TabsContent>

        {/* ---------------- Reports ---------------- */}
        <TabsContent value="egm-report">
          <ReportTable
            rows={egmReports.data ?? []}
            loading={egmReports.isLoading}
            label="EGM reports"
            casinoName={casinoName}
          />
        </TabsContent>

        <TabsContent value="jp-report" className="space-y-4">
          <PageSection title="Jackpot wins" card={false}>
            <SmartTable
              data={jackpots.data ?? []}
              rowKey={(r: any) => r.id}
              loading={jackpots.isLoading}
              empty={<EmptyState what="jackpot wins" />}
              columns={[
                { key: "date", header: "Business day", accessor: (r: any) => fmtDateOnly(r.business_date) },
                { key: "time", header: "Time", accessor: (r: any) => (r.occurred_at ? fmtDateTime(r.occurred_at) : "—") },
                { key: "branch", header: "Branch", accessor: (r: any) => casinoName.get(r.casino_id) ?? "—" },
                { key: "name", header: "Jackpot", accessor: (r: any) => r.jackpot_name ?? "—" },
                { key: "egm", header: "EGM", accessor: (r: any) => r.egm_code ?? "—" },
                { key: "player", header: "ACE player", accessor: (r: any) => r.ace_player_id ?? "—" },
                { key: "amount", header: "Amount", type: "money", accessor: (r: any) => money(r.amount) },
              ]}
            />
          </PageSection>
          <ReportTable
            rows={jpReports.data ?? []}
            loading={jpReports.isLoading}
            label="Jackpot reports"
            casinoName={casinoName}
          />
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}

/** Raw report capture — ACE columns stay in jsonb until the probe names them. */
function ReportTable({
  rows,
  loading,
  label,
  casinoName,
}: {
  rows: any[];
  loading: boolean;
  label: string;
  casinoName: Map<string, string>;
}) {
  const exportRaw = () =>
    downloadXlsx(`ace-${label.toLowerCase().replace(/\s+/g, "-")}.xlsx`, [
      {
        name: "Reports",
        rows: [
          ["Branch", "Period", "Business day", "Captured", "Rows"],
          ...rows.map((r) => [
            casinoName.get(r.casino_id) ?? "",
            r.period_label ?? "",
            r.business_date ?? "",
            r.captured_at ?? "",
            Array.isArray(r.rows_data) ? r.rows_data.length : 0,
          ]),
        ],
      },
    ]);

  return (
    <PageSection
      title={label}
      titleRight={
        <Button variant="outline" size="sm" onClick={exportRaw} disabled={!rows.length}>
          <Download className="w-4 h-4 mr-1" /> Export
        </Button>
      }
      card={false}
    >
      <SmartTable
        data={rows}
        rowKey={(r: any) => r.id}
        loading={loading}
        empty={<EmptyState what={label.toLowerCase()} />}
        columns={[
          { key: "branch", header: "Branch", accessor: (r: any) => casinoName.get(r.casino_id) ?? "—" },
          { key: "period", header: "Period", accessor: (r: any) => r.period_label ?? "—" },
          { key: "day", header: "Business day", accessor: (r: any) => (r.business_date ? fmtDateOnly(r.business_date) : "—") },
          { key: "cap", header: "Captured", accessor: (r: any) => fmtDateTime(r.captured_at) },
          {
            key: "rows",
            header: "Rows",
            type: "int",
            accessor: (r: any) => (Array.isArray(r.rows_data) ? r.rows_data.length : 0),
          },
        ]}
      />
    </PageSection>
  );
}
