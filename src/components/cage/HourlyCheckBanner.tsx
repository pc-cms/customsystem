/**
 * HourlyCheckBanner — red, gently pulsing reminder rendered in the Cage / Cage
 * Slots PageHeader `context` slot when a cash-check window is active and no
 * check has been recorded yet. Disappears automatically once the cashier saves
 * a check (via the existing Check flow) — see useHourlyCheckDue.
 *
 * Per UX: this is a NOTIFICATION ONLY. It does not navigate anywhere — the
 * existing Check action lives elsewhere on the page; cashiers simply forget to
 * use it on time, so the banner nags until they do.
 */
import { AlertTriangle } from "lucide-react";
import { useHourlyCheckDue, type HourlyCheckKind } from "@/hooks/use-hourly-check-due";

interface Props {
  kind: HourlyCheckKind;
}

export const HourlyCheckBanner = ({ kind }: Props) => {
  const { due, windowEndLabel } = useHourlyCheckDue(kind);
  if (!due) return null;

  return (
    <span
      role="status"
      aria-live="polite"
      className="inline-flex items-center gap-1.5 rounded-md border border-destructive/50 bg-destructive/15 px-2.5 py-1 text-xs font-semibold uppercase tracking-wider text-destructive animate-pulse"
      title={windowEndLabel ? `Record a cash check before ${windowEndLabel} EAT` : "Record a cash check"}
    >
      <AlertTriangle className="w-3.5 h-3.5" />
      Check
      {windowEndLabel ? <span className="font-mono normal-case opacity-80">· by {windowEndLabel}</span> : null}
    </span>
  );
};
