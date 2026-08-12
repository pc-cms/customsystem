/**
 * StaleCountsNotice — Actual (Σ wallets) is only as fresh as the last physical
 * count of each wallet. When part of the wallets were counted days ago, the
 * Variance mixes different points in time. This banner makes that visible and
 * lets the user jump straight into counting the stale wallets.
 */
import { useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, ClipboardCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatNumberSpaces } from "@/lib/currency";
import { fmtDate } from "@/lib/format-date";
import { cn } from "@/lib/utils";

export type CountFreshnessRow = {
  wallet_id: string;
  name: string;
  currency: string;
  actual_native: number;
  actual_tzs: number;
  /** business date (EAT) of the last recorded count, or null when never counted */
  counted_date: string | null;
  counted_time: string | null;
  source: string | null;
  days: number | null;
  stale: boolean;
};

type Props = {
  rows: CountFreshnessRow[];
  refDate: string;
  onCountAll: () => void;
};

export function StaleCountsNotice({ rows, refDate, onCountAll }: Props) {
  const [open, setOpen] = useState(false);
  const stale = rows.filter((r) => r.stale);
  if (!stale.length) return null;

  const staleTzs = stale.reduce((s, r) => s + r.actual_tzs, 0);
  const totalTzs = rows.reduce((s, r) => s + r.actual_tzs, 0);
  const pct = totalTzs > 0 ? Math.round((staleTzs / totalTzs) * 100) : 0;

  return (
    <div className="rounded-md border border-amber-500/40 bg-amber-500/10">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
        <AlertTriangle className="w-4 h-4 shrink-0" />
        <span className="font-semibold uppercase tracking-wider">Stale counts</span>
        <span>
          Actual relies on {stale.length} wallet{stale.length > 1 ? "s" : ""} counted before{" "}
          {fmtDate(refDate)} · {formatNumberSpaces(staleTzs)} TZS ({pct}% of Actual)
        </span>
        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <ChevronDown className="w-3.5 h-3.5 mr-1" /> : <ChevronRight className="w-3.5 h-3.5 mr-1" />}
            Details
          </Button>
          <Button size="sm" className="h-7 text-xs" onClick={onCountAll}>
            <ClipboardCheck className="w-3.5 h-3.5 mr-1" /> Count all
          </Button>
        </div>
      </div>

      {open && (
        <div className="border-t border-amber-500/30 overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-background/60 text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-1.5 text-left">Wallet</th>
                <th className="px-3 py-1.5 text-right">Units</th>
                <th className="px-3 py-1.5 text-left">Currency</th>
                <th className="px-3 py-1.5 text-right">TZS</th>
                <th className="px-3 py-1.5 text-left">Counted</th>
                <th className="px-3 py-1.5 text-right">Age</th>
              </tr>
            </thead>
            <tbody className="font-mono tabular-nums">
              {rows.map((r) => (
                <tr
                  key={r.wallet_id}
                  className={cn(
                    "border-t border-border/50",
                    r.stale ? "bg-amber-500/5" : undefined,
                  )}
                >
                  <td className="px-3 py-1 font-sans">{r.name}</td>
                  <td className="px-3 py-1 text-right">{formatNumberSpaces(r.actual_native)}</td>
                  <td className="px-3 py-1 text-left">{r.currency}</td>
                  <td className="px-3 py-1 text-right">{formatNumberSpaces(r.actual_tzs)}</td>
                  <td className="px-3 py-1 font-sans">
                    {r.counted_date ? (
                      <>
                        {fmtDate(r.counted_date)}
                        {r.counted_time && (
                          <span className="text-muted-foreground"> {r.counted_time}</span>
                        )}
                        {r.source === "auto" && (
                          <span className="text-muted-foreground"> · auto</span>
                        )}
                      </>
                    ) : (
                      <span className="text-muted-foreground">never counted</span>
                    )}
                  </td>
                  <td
                    className={cn(
                      "px-3 py-1 text-right font-sans",
                      r.stale ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground",
                    )}
                  >
                    {r.days == null ? "—" : r.days === 0 ? "today" : `${r.days}d`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-3 py-1.5 text-[10px] text-muted-foreground border-t border-border/50">
            Variance is only trustworthy when every wallet is counted on the same day.
          </div>
        </div>
      )}
    </div>
  );
}

export default StaleCountsNotice;
