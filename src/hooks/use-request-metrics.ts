import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import {
  getRequestMetricBuckets,
  startRequestMetricsFlush,
  subscribeRequestMetricsFlush,
  type RequestMetricModule,
} from "@/lib/request-metrics";

export interface RequestModuleSummary {
  module: RequestMetricModule;
  requestCount: number;
  errorCount: number;
  timeoutCount: number;
  averageDurationMs: number;
  maxDurationMs: number;
}

export function useRequestMetricsCollector() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    let flushing = false;
    const flush = async () => {
      if (flushing) return;
      const rows = getRequestMetricBuckets();
      if (rows.length === 0) return;
      flushing = true;
      try {
        await supabase.from("request_metrics").upsert(rows, {
          onConflict: "bucket_at,module,user_id,client_id",
        });
      } finally {
        flushing = false;
      }
    };
    const unsubscribe = subscribeRequestMetricsFlush(flush);
    startRequestMetricsFlush();
    void flush();
    return unsubscribe;
  }, [user]);
}

export function useRequestMetrics() {
  return useQuery({
    queryKey: ["request-metrics", "15m"],
    queryFn: async (): Promise<RequestModuleSummary[]> => {
      const since = new Date(Date.now() - 15 * 60_000).toISOString();
      const { data, error } = await supabase
        .from("request_metrics")
        .select("module,request_count,error_count,timeout_count,total_duration_ms,max_duration_ms")
        .gte("bucket_at", since);
      if (error) throw error;

      const summaries = new Map<string, RequestModuleSummary & { totalDurationMs: number }>();
      for (const row of data ?? []) {
        const current = summaries.get(row.module) ?? {
          module: row.module as RequestMetricModule,
          requestCount: 0,
          errorCount: 0,
          timeoutCount: 0,
          averageDurationMs: 0,
          maxDurationMs: 0,
          totalDurationMs: 0,
        };
        current.requestCount += row.request_count;
        current.errorCount += row.error_count;
        current.timeoutCount += row.timeout_count;
        current.totalDurationMs += Number(row.total_duration_ms);
        current.maxDurationMs = Math.max(current.maxDurationMs, row.max_duration_ms);
        summaries.set(row.module, current);
      }

      return Array.from(summaries.values())
        .map(({ totalDurationMs, ...summary }) => ({
          ...summary,
          averageDurationMs: summary.requestCount > 0 ? Math.round(totalDurationMs / summary.requestCount) : 0,
        }))
        .sort((a, b) => b.requestCount - a.requestCount);
    },
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
    staleTime: 5_000,
  });
}