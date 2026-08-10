/**
 * Analytics → Graphics
 *
 * Standalone page for the yearly charts (previously a tab inside Statistics).
 * Kept separate so more charts can be added here over time.
 */
import { Suspense, lazy } from "react";
import { TrendingUp } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";

const YearlyGraphicsReport = lazy(() => import("@/components/reports/YearlyGraphicsReport"));

export const GraphicsPage = () => (
  <div>
    <PageHeader
      icon={TrendingUp}
      title="Graphics"
      subtitle="Yearly performance charts"
      date
    />
    <Suspense fallback={<div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>}>
      <YearlyGraphicsReport />
    </Suspense>
  </div>
);

export default GraphicsPage;
