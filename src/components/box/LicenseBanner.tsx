import { useBoxLicense } from "@/hooks/use-box-license";
import { useLicense } from "@/hooks/use-license";
import { AlertTriangle, Lock, KeyRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";

/**
 * Sticky banner surface for two independent license systems:
 *
 * 1. Box license (on-prem heartbeat / trial period) — legacy.
 * 2. Casino signed license (Phase B) — package + expiry.
 *
 * Precedence: expired signed license wins over everything (full read-only).
 * Otherwise box banner wins; otherwise show a warning when the signed
 * license is within 14 days of expiry.
 */
export function LicenseBanner() {
  const { mode: boxMode, daysUntilStop, isCloud } = useBoxLicense();
  const license = useLicense();

  // 1. Signed license expired → hard banner (blocks everything except /superadmin/license)
  if (!license.isImplicit && !license.isValid) {
    return (
      <div className="sticky top-0 z-50 w-full px-4 py-2 text-sm font-medium flex items-center justify-center gap-2 border-b bg-destructive text-destructive-foreground border-destructive">
        <Lock className="h-4 w-4" />
        <span>
          Casino license expired. System is read-only until a new license is activated.
        </span>
        <Link
          to="/superadmin/license"
          className="ml-2 underline decoration-dotted underline-offset-2 hover:opacity-90"
        >
          Manage license
        </Link>
      </div>
    );
  }

  // 2. Box-level restrictions still apply
  if (!isCloud && boxMode !== "full") {
    const isStopped = boxMode === "stopped";
    return (
      <div
        className={cn(
          "sticky top-0 z-50 w-full px-4 py-2 text-sm font-medium",
          "flex items-center justify-center gap-2 border-b",
          isStopped
            ? "bg-destructive text-destructive-foreground border-destructive"
            : "bg-warning/10 text-warning-foreground border-warning/30",
        )}
      >
        {isStopped ? <Lock className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
        {isStopped ? (
          <span>License expired. System is read-only until an activation code is entered.</span>
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

  // 3. Signed license expiring soon (≤14 days) → soft warning
  if (!license.isImplicit && license.isValid && license.daysLeft !== null && license.daysLeft <= 14) {
    return (
      <div className="sticky top-0 z-50 w-full px-4 py-2 text-sm font-medium flex items-center justify-center gap-2 border-b bg-warning/10 text-warning-foreground border-warning/30">
        <KeyRound className="h-4 w-4" />
        <span>
          Casino license expires in {license.daysLeft} day{license.daysLeft === 1 ? "" : "s"}.
          Contact your administrator to renew.
        </span>
      </div>
    );
  }

  return null;
}
