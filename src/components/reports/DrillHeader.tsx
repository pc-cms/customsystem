import { fmtDate } from "@/lib/format-date";
import { formatMoneyFull } from "@/lib/format-money";
import { cn } from "@/lib/utils";

/**
 * Unified header for every financial drill-down panel:
 *   SOURCE (one line, truncated)
 *   DD/MM/YYYY
 *   amount (large, monospaced)
 */
const DrillHeader = ({
  source,
  date,
  amount,
  currency = "TZS",
  signed = false,
}: {
  source: string;
  date: string;
  amount: number;
  currency?: string;
  signed?: boolean;
}) => (
  <div className="space-y-0.5">
    <div className="truncate whitespace-nowrap text-base font-semibold uppercase tracking-wide">
      {source}
    </div>
    <div className="font-mono text-xs tabular-nums text-muted-foreground">{fmtDate(date)}</div>
    <div
      className={cn(
        "font-mono text-lg font-bold tabular-nums",
        signed && amount < 0 && "cms-amount-negative",
        signed && amount > 0 && "cms-amount-positive",
      )}
    >
      {formatMoneyFull(Math.round(amount))}
      <span className="ml-1 text-xs font-normal text-muted-foreground">{currency}</span>
    </div>
  </div>
);

export default DrillHeader;
