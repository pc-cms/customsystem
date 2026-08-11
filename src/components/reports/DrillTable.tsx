/**
 * Unified drill-down table — every breakdown panel in the reports uses it so
 * the layout never changes between panels.
 *
 *   NAME            UNITS     RATE          TZS
 *   Safe EUR            5    3 100       15 500
 *   Safe TZS    9 000 000        1    9 000 000
 *   ------------------------------------------
 *   TOTAL                        9 015 500
 *
 * The currency is part of the wallet / row name, so there is no separate
 * currency column.
 */
import { cn } from "@/lib/utils";
import { formatMoneyFull } from "@/lib/format-money";

export interface DrillRow {
  /** Row name — includes the currency when relevant ("Safe EUR"). */
  label: string;
  /** Amount in the row's own currency. Defaults to the TZS value. */
  units?: number;
  /** Conversion rate to TZS. Defaults to 1 for TZS rows. */
  rate?: number;
  /** Value converted to TZS. */
  tzs: number;
  /** Renders the row muted (empty wallet / zero line). */
  muted?: boolean;
}

const money = (v: number) => formatMoneyFull(Math.round(v));

const DrillTable = ({
  title,
  rows,
  totalLabel = "Total",
  total,
  emptyText = "No data",
}: {
  title?: string;
  rows: DrillRow[];
  totalLabel?: string;
  /** Explicit total; defaults to the sum of the TZS column. */
  total?: number;
  emptyText?: string;
}) => {
  const sum = total ?? rows.reduce((s, r) => s + (r.tzs || 0), 0);

  return (
    <div>
      {title && (
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </div>
      )}
      <div className="overflow-hidden rounded-md border border-border">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="border-b border-border bg-muted text-[10px] uppercase tracking-wider text-muted-foreground">
              <th className="px-2 py-1 text-left font-bold">Name</th>
              <th className="px-2 py-1 text-right font-bold">Units</th>
              <th className="px-2 py-1 text-right font-bold">Rate</th>
              <th className="px-2 py-1 text-right font-bold">TZS</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const units = r.units ?? r.tzs;
              const rate = r.rate ?? (units ? r.tzs / units : 1);
              return (
                <tr
                  key={`${r.label}-${i}`}
                  className={cn(
                    "border-b border-border/60 last:border-0",
                    (r.muted || (!units && !r.tzs)) && "text-muted-foreground",
                  )}
                >
                  <td className="px-2 py-1 font-semibold">{r.label}</td>
                  <td className="px-2 py-1 text-right font-mono tabular-nums">{money(units)}</td>
                  <td className="px-2 py-1 text-right font-mono tabular-nums text-muted-foreground">
                    {rate && Number.isFinite(rate) ? money(rate) : "—"}
                  </td>
                  <td
                    className={cn(
                      "px-2 py-1 text-right font-mono font-semibold tabular-nums",
                      r.tzs < 0 && "cms-amount-negative",
                    )}
                  >
                    {money(r.tzs)}
                  </td>
                </tr>
              );
            })}
            {!rows.length && (
              <tr>
                <td colSpan={4} className="px-2 py-3 text-center text-muted-foreground">
                  {emptyText}
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border bg-muted/50 font-bold">
              <td className="px-2 py-1 uppercase tracking-wider" colSpan={3}>
                {totalLabel}
              </td>
              <td
                className={cn(
                  "px-2 py-1 text-right font-mono tabular-nums",
                  sum < 0 && "cms-amount-negative",
                )}
              >
                {money(sum)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};

export default DrillTable;
