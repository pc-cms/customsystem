import { fmtDate } from "@/lib/format-date";
import { formatCurrency } from "@/lib/currency";
import type { TipsRow } from "@/hooks/use-tips";
import { formatNumberSpaces } from "@/lib/currency";

const chipsToCells = (chips: Record<string, number> | null): { denom: number; count: number }[] => {
  if (!chips) return [];
  return Object.entries(chips)
    .map(([denom, count]) => ({ denom: Number(denom), count: Number(count) || 0 }))
    .filter((cell) => cell.count > 0)
    .sort((a, b) => b.denom - a.denom);
};

const formatDenom = (value: number) => formatNumberSpaces(value);

interface TipsLedgerTableProps {
  rows: TipsRow[];
  emptyMessage: string;
  fallbackEmployee: string;
}

export function TipsLedgerTable({ rows, emptyMessage, fallbackEmployee }: TipsLedgerTableProps) {
  const sorted = [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at));

  return (
    <div className="w-full overflow-x-auto rounded-md border border-border">
      <table className="w-full text-xs border-collapse">
        <thead className="bg-primary text-primary-foreground">
          <tr>
            <th className="h-9 w-28 px-3 text-left font-semibold">Date</th>
            <th className="h-9 min-w-[160px] px-3 text-left font-semibold">Employee</th>
            <th className="h-9 min-w-[220px] px-3 text-left font-semibold">Chip Denominations</th>
            <th className="h-9 w-36 px-3 text-right font-semibold">Total</th>
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 ? (
            <tr>
              <td colSpan={4} className="py-8 text-center text-muted-foreground">
                {emptyMessage}
              </td>
            </tr>
          ) : sorted.map((row, idx) => {
            const chips = chipsToCells(row.chips);
            return (
              <tr key={row.id} className={idx % 2 === 0 ? "border-b border-border last:border-0" : "border-b border-border bg-muted/10 last:border-0"}>
                <td className="px-3 py-2 font-mono tabular-nums">{fmtDate(row.business_date)}</td>
                <td className="px-3 py-2 font-medium">{row.employees?.full_name || fallbackEmployee}</td>
                <td className="px-3 py-2 font-mono text-xs">
                  {chips.length === 0 ? (
                    <span className="text-muted-foreground">·</span>
                  ) : (
                    <span className="flex flex-wrap gap-1.5">
                      {chips.map((chip) => (
                        <span key={`${row.id}-${chip.denom}`} className="inline-flex items-baseline gap-1 rounded bg-muted/70 px-1.5 py-0.5">
                          <span className="font-bold">{chip.count}</span>
                          <span className="text-muted-foreground">×</span>
                          <span className="text-muted-foreground">{formatDenom(chip.denom)}</span>
                        </span>
                      ))}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-right font-mono font-semibold">{formatCurrency(Number(row.amount) || 0)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}