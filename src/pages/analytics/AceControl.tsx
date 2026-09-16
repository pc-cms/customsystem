/** Read-only cross-branch ACE administration surface for Super Admin. */
import { lazy, Suspense, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { SlidersHorizontal } from "lucide-react";
import { getBusinessDate } from "@/lib/business-day";
import { useAuth } from "@/lib/auth-context";
import { useAceCasinos } from "@/hooks/use-ace-players";

const ConsolidatedTab = lazy(() => import("@/components/ace/AceConsolidatedTab"));
const SystemTab = lazy(() => import("@/components/ace/AceSystemTab"));
const Loading = () => <Skeleton className="h-64 w-full" />;

export default function AceControl() {
  const { roles } = useAuth();
  const today = getBusinessDate();
  const { data: casinos = [] } = useAceCasinos();
  const casinoName = useMemo(() => new Map(casinos.map((c) => [c.id, c.name])), [casinos]);
  const [tab, setTab] = useState("consolidated");
  if (!roles.includes("super_admin")) return <Navigate to="/analytics/ace" replace />;

  return (
    <PageShell>
      <PageHeader icon={SlidersHorizontal} title="ACE Control" />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-3">
          <TabsTrigger value="consolidated">Consolidated</TabsTrigger>
          <TabsTrigger value="system">System</TabsTrigger>
        </TabsList>
        <TabsContent value="consolidated">
          <Suspense fallback={<Loading />}><ConsolidatedTab casinoId={null} casinoName={casinoName} operational={false} /></Suspense>
        </TabsContent>
        <TabsContent value="system">
          <Suspense fallback={<Loading />}><SystemTab from="2020-01-01" to={today} casinoId={null} casinoName={casinoName} /></Suspense>
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
