import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { prefetchPitData } from "@/lib/pit-prefetch";

/**
 * Wraps Pit module pages: warms the cache on mount.
 */
export const PitShell = ({ children }: { children: React.ReactNode }) => {
  const { casinoId } = useAuth();
  const qc = useQueryClient();

  useEffect(() => {
    if (!casinoId) return;
    prefetchPitData(qc, casinoId).catch(() => { /* offline / ignore */ });
  }, [casinoId, qc]);

  return <>{children}</>;
};
