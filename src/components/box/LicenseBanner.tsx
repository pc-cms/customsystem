import { useBoxLicense } from "@/hooks/use-box-license";
import { AlertTriangle, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Sticky banner shown when the box is in restricted or stopped license mode.
 * On Cloud (no box_licenses row) renders nothing.
 */
export function LicenseBanner() {
  const { mode, daysUntilStop, isCloud } = useBoxLicense();

  if (isCloud || mode === "full") return null;

  const isStopped = mode === "stopped";

  return (
    <div
      className={cn(
        "sticky top-0 z-50 w-full px-4 py-2 text-sm font-medium",
        "flex items-center justify-center gap-2 border-b",
        isStopped
          ? "bg-destructive text-destructive-foreground border-destructive"
          : "bg-warning/10 text-warning-foreground border-warning/30"
      )}
    >
      {isStopped ? <Lock className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
      {isStopped ? (
        <span>
          License expired. System is read-only until an activation code is entered.
        </span>
      ) : (
        <span>
          Restricted mode: only cashier and pit table operations are available.{" "}
          {daysUntilStop != null && daysUntilStop > 0
            ? `${daysUntilStop} day${daysUntilStop === 1 ? "" : "s"} until full stop.`
            : "Contact support to renew."}
        </span>
      )}
    </div>
  );
}
