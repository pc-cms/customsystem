import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useResyncAllData } from "@/hooks/use-prefetch";
import { toast } from "sonner";

/**
 * Resync all data — manual full-refresh button for the "new PC" /
 * "long offline period" scenarios. Re-runs every module prefetch task
 * the current user is allowed to access (sequential, anti-429).
 *
 * Lives in Admin → Working Hours panel so every role with admin access
 * can find it; super-admin sees the richer AppCacheCard separately.
 */
export const ResyncDataCard = () => {
  const resync = useResyncAllData();
  const [busy, setBusy] = useState(false);

  const onClick = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await resync();
      toast.success("All data resynced");
    } catch (e: any) {
      toast.error(e?.message || "Resync failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border rounded-md p-4 space-y-3 bg-card">
      <div>
        <h3 className="text-sm font-semibold text-card-foreground">Resync all data</h3>
        <p className="text-xs text-muted-foreground mt-1">
          Re-downloads every list the current user is allowed to see. Use this on a new
          device, or if you suspect cached data is stale after a long offline period.
        </p>
      </div>
      <Button onClick={onClick} disabled={busy} variant="outline" size="sm" className="gap-1.5">
        <RefreshCw className={`w-3.5 h-3.5 ${busy ? "animate-spin" : ""}`} />
        {busy ? "Resyncing…" : "Resync now"}
      </Button>
    </div>
  );
};
