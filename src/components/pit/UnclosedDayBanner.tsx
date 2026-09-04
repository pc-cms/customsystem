import { AlertTriangle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
// Close Day button removed: the day closes automatically; the banner is informational.
import { useUnclosedDayReminder } from "@/hooks/use-unclosed-day-reminder";
import { fmtDateOnly } from "@/lib/format-date";

/**
 * From 10:00 EAT: persistent reminder for managers that the previous business
 * day is still open. Dismiss only snoozes for 30 minutes.
 */
export function UnclosedDayBanner() {
  const { show, businessDate, snooze } = useUnclosedDayReminder();
  if (!show || !businessDate) return null;

  return (
    <div className="no-print flex flex-wrap items-center gap-3 border-b border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
      <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
      <span className="font-medium">
        Business day {fmtDateOnly(businessDate)} is not closed
      </span>
      <span className="text-muted-foreground hidden sm:inline">
        Close it now so figures and statistics are recorded for the right day.
      </span>
      <div className="ml-auto flex items-center gap-2">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={snooze} title="Remind me in 30 minutes">
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
