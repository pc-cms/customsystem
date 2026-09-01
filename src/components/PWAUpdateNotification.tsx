/**
 * PWAUpdateNotification — non-blocking corner reminder shown when a new
 * version is available. Never covers the screen, never steals focus, so an
 * operator can finish typing. Dismiss (X) snoozes it for 30 minutes; a newer
 * build raises it again immediately.
 *
 * Listens for "pwa:update-available" dispatched from pwa-register.ts.
 */
import { useEffect, useState } from "react";
import { RefreshCw, Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { hasDirtyWork, subscribeDirty } from "@/lib/dirty-guard";
import { applyUpdate, hasPendingUpdate } from "@/lib/pwa-register";

declare const __APP_VERSION__: string | undefined;

type UpdateFn = (reload?: boolean) => Promise<void>;

const SNOOZE_MS = 30 * 60 * 1000;
const SNOOZE_KEY = "cms.pwaUpdate.snoozeUntil";

const readSnooze = (): number => {
  try {
    return Number(sessionStorage.getItem(SNOOZE_KEY) || 0);
  } catch {
    return 0;
  }
};

export const PWAUpdateNotification = () => {
  const [available, setAvailable] = useState(false);
  const [currentVersion, setCurrentVersion] = useState("");
  const [dirty, setDirtyState] = useState(hasDirtyWork());
  const [busy, setBusy] = useState(false);
  const [snoozedUntil, setSnoozedUntil] = useState<number>(() => readSnooze());
  const [, setTick] = useState(0);

  useEffect(() => subscribeDirty(() => setDirtyState(hasDirtyWork())), []);

  useEffect(() => {
    setCurrentVersion(
      typeof __APP_VERSION__ !== "undefined" && __APP_VERSION__
        ? __APP_VERSION__
        : ""
    );
  }, []);

  // Re-evaluate every minute so the reminder comes back when snooze expires.
  useEffect(() => {
    const t = setInterval(() => setTick((v) => v + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { update?: UpdateFn } | undefined;
      // Only raise the reminder when a build is actually waiting to install.
      void hasPendingUpdate().then((pending) => {
        if (!pending && !detail?.update) return;
        // A fresh update event clears any active snooze — this is a newer build.
        try { sessionStorage.removeItem(SNOOZE_KEY); } catch { /* noop */ }
        setSnoozedUntil(0);
        setAvailable(true);
      });
    };

    window.addEventListener("pwa:update-available", handler);
    return () => window.removeEventListener("pwa:update-available", handler);
  }, []);

  const handleUpdate = async () => {
    setBusy(true);
    await applyUpdate();
  };

  const dismiss = () => {
    const until = Date.now() + SNOOZE_MS;
    try { sessionStorage.setItem(SNOOZE_KEY, String(until)); } catch { /* noop */ }
    setSnoozedUntil(until);
  };

  if (!available) return null;
  if (snoozedUntil > Date.now()) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[9999] max-w-xs rounded-lg border border-border bg-card shadow-xl p-3 flex items-start gap-3 no-print animate-in slide-in-from-bottom-2">
      <Download className="w-4 h-4 text-primary mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-foreground">New version available</p>
        <p className="text-[11px] text-muted-foreground mb-2">
          {dirty
            ? "Finish and save your current entry, then update."
            : "Your session is kept. Update when convenient."}
        </p>
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleUpdate} disabled={busy}>
          <RefreshCw className={cn("w-3 h-3 mr-1", busy && "animate-spin")} />
          {busy ? "Updating…" : "Update now"}
        </Button>
        {currentVersion && (
          <p className="text-[10px] text-muted-foreground mt-1.5 font-mono">Current: {currentVersion}</p>
        )}
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss update reminder"
        className="text-muted-foreground hover:text-foreground shrink-0"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
