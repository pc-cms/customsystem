import { Activity, AlertTriangle, Clock3, TimerOff } from "lucide-react";
import { useRequestMetrics } from "@/hooks/use-request-metrics";

const formatMs = (value: number) => value >= 1_000 ? `${(value / 1_000).toFixed(1)} s` : `${value} ms`;

export function RequestMetricsPanel() {
  const { data = [], isLoading } = useRequestMetrics();
  const totals = data.reduce((acc, row) => ({
    requests: acc.requests + row.requestCount,
    errors: acc.errors + row.errorCount,
    timeouts: acc.timeouts + row.timeoutCount,
    weightedDuration: acc.weightedDuration + row.averageDurationMs * row.requestCount,
  }), { requests: 0, errors: 0, timeouts: 0, weightedDuration: 0 });
  const average = totals.requests > 0 ? Math.round(totals.weightedDuration / totals.requests) : 0;

  const cards = [
    { label: "Requests · 15 min", value: totals.requests.toLocaleString("en-US"), icon: Activity },
    { label: "Average response", value: formatMs(average), icon: Clock3 },
    { label: "Errors", value: totals.errors.toLocaleString("en-US"), icon: AlertTriangle },
    { label: "Timeouts", value: totals.timeouts.toLocaleString("en-US"), icon: TimerOff },
  ];

  return (
    <section className="space-y-3 mb-4" aria-label="Request performance">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        {cards.map(({ label, value, icon: Icon }) => (
          <div key={label} className="cms-panel px-3 py-3 flex items-center gap-3">
            <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="min-w-0">
              <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
              <div className="font-mono text-lg font-semibold text-foreground">{value}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="cms-panel overflow-hidden">
        <div className="grid grid-cols-[1fr_90px_100px_90px_90px_90px] gap-3 border-b border-border bg-card px-3 py-2 text-[10px] font-medium uppercase text-muted-foreground">
          <div>Module</div><div>Requests</div><div>Avg response</div><div>Max</div><div>Errors</div><div>Timeouts</div>
        </div>
        {isLoading ? (
          <div className="py-6 text-center text-sm text-muted-foreground">Loading...</div>
        ) : data.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">No request data in the last 15 minutes</div>
        ) : data.map((row) => (
          <div key={row.module} className="grid grid-cols-[1fr_90px_100px_90px_90px_90px] gap-3 border-b border-border px-3 py-2 text-xs last:border-b-0">
            <div className="font-medium text-foreground">{row.module}</div>
            <div className="font-mono">{row.requestCount.toLocaleString("en-US")}</div>
            <div className="font-mono">{formatMs(row.averageDurationMs)}</div>
            <div className="font-mono">{formatMs(row.maxDurationMs)}</div>
            <div className="font-mono">{row.errorCount.toLocaleString("en-US")}</div>
            <div className="font-mono">{row.timeoutCount.toLocaleString("en-US")}</div>
          </div>
        ))}
      </div>
    </section>
  );
}