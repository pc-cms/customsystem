/**
 * useDataScope — single source of truth for "is the app ready to fetch
 * scoped (per-casino) data?". Combines AuthProvider (session+profile loaded)
 * and CasinoProvider (subdomain/active casino resolved).
 *
 * Use this in pages/components to differentiate "still booting" from
 * "really empty" — so we don't flash "No staff found" while the casinoId
 * is still null on cold start.
 */
import { useAuth } from "@/lib/auth-context";
import { useCasino } from "@/lib/casino-context";

export function useDataScope() {
  const { casinoId, loading: authLoading, user } = useAuth();
  const { isSummaryMode, loading: casinoLoading } = useCasino();

  const isBooting = authLoading || casinoLoading;
  const isReady =
    !isBooting && !!user && (isSummaryMode || !!casinoId);

  return { casinoId, isReady, isBooting, isSummaryMode };
}
