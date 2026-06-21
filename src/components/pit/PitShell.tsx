import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { prefetchPitData } from "@/lib/pit-prefetch";
import { RealtimeStatusIndicator } from "@/components/RealtimeStatusIndicator";

/**
 * Wraps Pit module pages: warms the cache on mount and surfaces
 * a Realtime connection indicator (with last-event timestamp) so
 * operators can tell at a glance whether live updates are flowing.
 */
export const PitShell = ({ children }: { children: React.ReactNode }) => {
  const { casinoId } = useAuth();
  const qc = useQueryClient();

  useEffect(() => {
    if (!casinoId) return;
    prefetchPitData(qc, casinoId).catch(() => { /* offline / ignore */ });
  }, [casinoId, qc]);

  return (
    <>
      <div className="no-print fixed bottom-3 right-3 z-50">
        <RealtimeStatusIndicator />
      </div>
      {children}
    </>
  );
};
