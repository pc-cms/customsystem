/**
 * Analytics → ACE (super_admin, test mode).
 *
 * Read-only workspace over the CMS `ace_*` / `player_ace_*` tables. ACE itself
 * is an import source only — this UI never talks to a branch ACE server.
 *
 * Canon: Drop = EGM IN, Handle = verified ACE total_in, Slot Result = IN - OUT,
 * Avg Bet = Handle / Games, jackpot payouts are already inside OUT.
 */
import { lazy, Suspense, useMemo, useState } from "react";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity } from "lucide-react";
import { getBusinessDate } from "@/lib/business-day";
import { presetRange, type DatePreset } from "@/components/ui/date-range-presets";
import { useAceCasinos } from "@/hooks/use-ace-players";
import { AceFilterBar } from "@/components/ace/AceFilterBar";
import type { AceMode } from "@/components/ace/ace-shared";

const ConsolidatedTab = lazy(() => import("@/components/ace/AceConsolidatedTab"));
const PlayersTab = lazy(() => import("@/components/ace/AcePlayersTab"));
const EgmLiveTab = lazy(() => import("@/components/ace/AceEgmLiveTab"));
const ReportsTab = lazy(() => import("@/components/ace/AceReportsTab"));
const JackpotsTab = lazy(() => import("@/components/ace/AceJackpotsTab"));
const SystemTab = lazy(() => import("@/components/ace/AceSystemTab"));

const Loading = () => <Skeleton className="h-64 w-full" />;

export default function AceAnalytics() {
  const today = getBusinessDate();
  const [casinoId, setCasinoId] = useState("all");
  const [mode, setMode] = useState<AceMode>("live");
  const [preset, setPreset] = useState<DatePreset>("day");
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [tab, setTab] = useState("consolidated");

  const scope = casinoId === "all" ? null : casinoId;
  const { data: casinos = [] } = useAceCasinos();
  const casinoName = useMemo(() => new Map(casinos.map((c) => [c.id, c.name])), [casinos]);

  const setRange = (r: { preset: DatePreset; from: string; to: string }) => {
    setPreset(r.preset);
    setFrom(r.from);
    setTo(r.to);
  };

  /** Live = current business day only; Closed = whatever range is chosen. */
  const onMode = (m: AceMode) => {
    setMode(m);
    if (m === "live") setRange({ preset: "day", from: today, to: today });
  };

  const common = { casinoId: scope, from, to, mode, casinoName } as const;

  return (
    <PageShell>
      <PageHeader icon={Activity} title="ACE Analytics" subtitle="Slot players, EGMs, jackpots and stored ACE reports">
        <Badge variant="outline">Test mode · super admin</Badge>
      </PageHeader>

      <AceFilterBar
        casinos={casinos}
        casinoId={casinoId}
        onCasino={setCasinoId}
        mode={mode}
        onMode={onMode}
        preset={preset}
        from={from}
        to={to}
        onRange={setRange}
        hideDates={tab === "egm" || tab === "system"}
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="consolidated">Consolidated</TabsTrigger>
          <TabsTrigger value="players">Players</TabsTrigger>
          <TabsTrigger value="egm">EGM Live</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
          <TabsTrigger value="jackpots">Jackpots</TabsTrigger>
          <TabsTrigger value="system">System</TabsTrigger>
        </TabsList>

        <TabsContent value="consolidated">
          <Suspense fallback={<Loading />}><ConsolidatedTab {...common} /></Suspense>
        </TabsContent>
        <TabsContent value="players">
          <Suspense fallback={<Loading />}><PlayersTab {...common} /></Suspense>
        </TabsContent>
        <TabsContent value="egm">
          <Suspense fallback={<Loading />}><EgmLiveTab casinoId={scope} casinoName={casinoName} /></Suspense>
        </TabsContent>
        <TabsContent value="reports">
          <Suspense fallback={<Loading />}><ReportsTab {...common} /></Suspense>
        </TabsContent>
        <TabsContent value="jackpots">
          <Suspense fallback={<Loading />}><JackpotsTab {...common} /></Suspense>
        </TabsContent>
        <TabsContent value="system">
          <Suspense fallback={<Loading />}>
            <SystemTab from={from} to={to} casinoId={scope} casinoName={casinoName} />
          </Suspense>
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
