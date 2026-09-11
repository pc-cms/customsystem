/**
 * Однократный фоновый прогрев кэша недели/месяца после входа.
 * Стартует только при активной вкладке и не мешает загрузке текущего экрана.
 */
import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { prefetchWeekAndMonth } from "@/lib/background-prefetch";

export function useIdleWeekMonthPrefetch() {
  const qc = useQueryClient();
  const { casinoId, user } = useAuth();
  const doneFor = useRef<string | null>(null);

  useEffect(() => {
    if (!user || !casinoId) return;
    if (doneFor.current === casinoId) return;
    doneFor.current = casinoId;
    const t = window.setTimeout(() => prefetchWeekAndMonth(qc, casinoId), 5000);
    return () => window.clearTimeout(t);
  }, [qc, casinoId, user]);
}
