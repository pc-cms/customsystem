/**
 * Business-day watcher — polls EAT wall clock and invalidates every React
 * Query cache the moment the business day rolls over (07:00 EAT) or the
 * tab is refocused after a rollover happened in the background.
 *
 * Without this, hooks keyed by `getBusinessDate()` (transactions, visits,
 * tracker, breaklist, etc.) keep serving yesterday's data because the
 * date string was computed once on mount and cached in the query key.
 */
import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getBusinessDate } from "@/lib/business-day";

export function useBusinessDayWatcher() {
  const qc = useQueryClient();
  const lastRef = useRef<string>(getBusinessDate());

  useEffect(() => {
    const check = () => {
      const now = getBusinessDate();
      if (now !== lastRef.current) {
        console.info(`[BusinessDay] Rollover: ${lastRef.current} → ${now} — invalidating cache`);
        lastRef.current = now;
        // Wipe stale "today" data across the board so every screen refetches
        // with the new business_date key on next render / focus.
        qc.invalidateQueries();
      }
    };

    // Poll every 30s — cheap, and guarantees rollover detection within 30s
    // even if the tab has no focus event (fullscreen kiosk PWA).
    const timer = window.setInterval(check, 30_000);

    // Immediate check on tab focus so operators who unlock a laptop after
    // the shift ended see fresh data without an F5.
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [qc]);
}
