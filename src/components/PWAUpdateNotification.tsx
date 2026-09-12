/**
 * PWAUpdateNotification — the ONLY update UI in the app: a single
 * non-blocking corner card shown when a new build is really waiting to
 * install (`hasPendingUpdate()`), never a toast, never a full-screen dialog.
 *
 * Dismiss (X) hides it permanently for the currently loaded build: the
 * decision is stored in localStorage, so reloads and new logins do not raise
 * the same reminder again. After the user updates, the app version changes
 * and a future build can notify again.
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

const DISMISS_KEY = "cms.pwaUpdate.dismissedVersion";

const appVersion =
  typeof __APP_VERSION__ !== "undefined" && __APP_VERSION__ ? __APP_VERSION__ : "";

const readDismissed = (): string => {
  try {
    return localStorage.getItem(DISMISS_KEY) || "";
  } catch {
    return "";
  }
};

export const PWAUpdateNotification = () => {
  const [available, setAvailable] = useState(false);
  const [dirty, setDirtyState] = useState(hasDirtyWork());
  const [busy, setBusy] = useState(false);
  const [dismissedVersion, setDismissedVersion] = useState<string>(() => readDismissed());

  useEffect(() => subscribeDirty(() => setDirtyState(hasDirtyWork())), []);

  useEffect(() => {
    const handler = () => {
      // Only raise the reminder when a build is actually waiting to install.
      void hasPendingUpdate().then((pending) => {
        if (!pending) return;
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
    try { localStorage.setItem(DISMISS_KEY, appVersion); } catch { /* noop */ }
    setDismissedVersion(appVersion);
    setAvailable(false);
  };

  if (!available) return null;
  if (dismissedVersion && dismissedVersion === appVersion) return null;

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
        {appVersion && (
          <p className="text-[10px] text-muted-foreground mt-1.5 font-mono">Current: {appVersion}</p>
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
