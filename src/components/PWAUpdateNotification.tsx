/**
 * PWAUpdateNotification — full-screen blocking overlay shown when a new
 * version is available. User MUST click "Update now". No auto-reload.
 *
 * Listens for "pwa:update-available" dispatched from pwa-register.ts.
 */
import { useEffect, useState } from "react";
import { RefreshCw, Download, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { hasDirtyWork, subscribeDirty } from "@/lib/dirty-guard";

declare const __APP_VERSION__: string | undefined;

type UpdateFn = (reload?: boolean) => Promise<void>;

export const PWAUpdateNotification = () => {
  const [visible, setVisible] = useState(false);
  const [updateFn, setUpdateFn] = useState<UpdateFn | null>(null);
  const [currentVersion, setCurrentVersion] = useState("");
  const [dirty, setDirtyState] = useState(hasDirtyWork());

  useEffect(() => subscribeDirty(() => setDirtyState(hasDirtyWork())), []);

  useEffect(() => {
    setCurrentVersion(
      typeof __APP_VERSION__ !== "undefined" && __APP_VERSION__
        ? __APP_VERSION__
        : ""
    );
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { update?: UpdateFn } | undefined;
      if (detail?.update) {
        setUpdateFn(() => detail.update as UpdateFn);
      }
      // Only raise the dialog when a build is actually waiting to install —
      // otherwise the button would have nothing to apply.
      void hasPendingUpdate().then((pending) => {
        if (pending || detail?.update) setVisible(true);
      });
    };

    window.addEventListener("pwa:update-available", handler);
    return () => window.removeEventListener("pwa:update-available", handler);
  }, []);

  const handleUpdate = async () => {
    setBusy(true);
    await applyUpdate();
  };


  if (!visible) return null;

  // Unsaved input on screen (Chips Check, cash count…) — never block the UI,
  // show a small corner banner instead so nothing is lost.
  if (dirty) {
    return (
      <div className="fixed bottom-4 right-4 z-[9999] max-w-xs rounded-lg border border-border bg-card shadow-xl p-3 flex items-start gap-3">
        <Download className="w-4 h-4 text-primary mt-0.5 shrink-0" />
        <div className="min-w-0">
          <p className="text-xs font-semibold text-foreground">New version ready</p>
          <p className="text-[11px] text-muted-foreground mb-2">
            Finish and save your current entry, then update.
          </p>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleUpdate}>
            <RefreshCw className="w-3 h-3 mr-1" /> Update now
          </Button>
        </div>
      </div>
    );
  }



  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md mx-4 bg-card border border-border rounded-xl shadow-2xl p-6 text-center animate-in zoom-in-95 duration-200">
        <div className="mx-auto w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-4">
          <Download className="w-7 h-7 text-primary" />
        </div>

        <h2 className="text-xl font-semibold text-foreground mb-2">
          New version available
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          A newer version of Casino System is ready. Click Update now to load it.
          Your session will be kept.
        </p>

        <div className="bg-muted/50 rounded-lg p-3 mb-5 text-left space-y-1">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Current: {currentVersion || "loading…"}</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-primary font-medium">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>New version ready to install</span>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Button
            onClick={handleUpdate}
            className={cn(
              "w-full h-11 text-base font-semibold",
              "bg-primary text-primary-foreground hover:bg-primary/90"
            )}
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Update now
          </Button>

          <p className="text-[10px] text-muted-foreground mt-1">
            Skipping the update may cause data-sync errors.
          </p>
        </div>
      </div>
    </div>
  );
};
