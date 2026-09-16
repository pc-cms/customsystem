/** Branch-scoped operational ACE workspace. Backend RLS remains super-admin-only for now. */
import { lazy, Suspense, useCallback, useMemo, useState } from "react";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity } from "lucide-react";
import { getBusinessDate } from "@/lib/business-day";
import { presetRange } from "@/components/ui/date-range-presets";
import { useCasino } from "@/lib/casino-context";
import { useAceCasinos } from "@/hooks/use-ace-players";

const ConsolidatedTab = lazy(() => import("@/components/ace/AceConsolidatedTab"));
const PlayersTab = lazy(() => import("@/components/ace/AcePlayersTab"));
const EgmLiveTab = lazy(() => import("@/components/ace/AceEgmLiveTab"));
const ReportsTab = lazy(() => import("@/components/ace/AceReportsTab"));
const JackpotsTab = lazy(() => import("@/components/ace/AceJackpotsTab"));
const Loading = () => <Skeleton className="h-64 w-full" />;

export default function AceAnalytics() {
  const today = getBusinessDate();
  const month = presetRange("month", new Date(`${today}T12:00:00`));
  const { activeCasinoId, activeCasino } = useCasino();
  const { data: casinos = [] } = useAceCasinos();
  const casinoName = useMemo(() => new Map(casinos.map((c) => [c.id, c.name])), [casinos]);
  const [range, setRange] = useState({ from: month.from, to: today });
  const setWorkspaceRange = useCallback((next: { from: string; to: string }) => setRange(next), []);
  const [tab, setTab] = useState("consolidated");

  // Never fall back to all branches in the operational workspace.
  const casinoId = activeCasinoId ?? "__no_active_branch__";
  const common = { casinoId, from: range.from, to: range.to, mode: "closed" as const, casinoName };

  return (
    <PageShell>
      <PageHeader icon={Activity} title="ACE" context={activeCasino?.name} date={true} />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-3">
          <TabsTrigger value="consolidated">Consolidated</TabsTrigger>
          <TabsTrigger value="players">Players</TabsTrigger>
          <TabsTrigger value="egm">EGM Live</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
          <TabsTrigger value="jackpots">Jackpots</TabsTrigger>
        </TabsList>
        <TabsContent value="consolidated">
          <Suspense fallback={<Loading />}>
            <ConsolidatedTab casinoId={casinoId} casinoName={casinoName} operational onRangeChange={setWorkspaceRange} />
          </Suspense>
        </TabsContent>
        <TabsContent value="players"><Suspense fallback={<Loading />}><PlayersTab {...common} /></Suspense></TabsContent>
        <TabsContent value="egm"><Suspense fallback={<Loading />}><EgmLiveTab casinoId={casinoId} /></Suspense></TabsContent>
        <TabsContent value="reports">
          <Suspense fallback={<Loading />}>
            <ReportsTab {...common} onRangeChange={setWorkspaceRange} />
          </Suspense>
        </TabsContent>
        <TabsContent value="jackpots"><Suspense fallback={<Loading />}><JackpotsTab {...common} /></Suspense></TabsContent>
      </Tabs>
    </PageShell>
  );
}
