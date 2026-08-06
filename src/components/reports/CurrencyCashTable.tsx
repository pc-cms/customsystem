import { CURRENCIES } from "@/lib/currency";
import { formatMoneyFull } from "@/lib/format-money";

export interface CashDenomRow {
  currency: string;
  denomination: number;
  quantity: number;
  tzs: number;
}

/**
 * Cage money summarised per currency — no denomination breakdown.
 * Every supported currency is listed, even when the amount is zero:
 *   CUR | amount (original) | rate | TZS total
 */
const CurrencyCashTable = ({
  rows,
  title = "Cash by currency",
  totalLabel = "Total",
  total,
}: {
  rows: CashDenomRow[];
  title?: string;
  totalLabel?: string;
  total?: number;
}) => {
  const agg: Record<string, { amount: number; tzs: number }> = {};
  rows.forEach((r) => {
    const a = (agg[r.currency] ??= { amount: 0, tzs: 0 });
    a.amount += (r.denomination || 0) * (r.quantity || 0);
    a.tzs += r.tzs || 0;
  });

  const currencies = [
    ...CURRENCIES,
    ...Object.keys(agg).filter((c) => !(CURRENCIES as readonly string[]).includes(c)),
  ];
  const sum = total ?? Object.values(agg).reduce((s, v) => s + v.tzs, 0);

  return (
    <div>
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </div>
      <div className="overflow-hidden rounded-md border border-border">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="border-b border-border bg-muted text-[10px] uppercase tracking-wider text-muted-foreground">
              <th className="px-2 py-1 text-left font-bold">Cur</th>
              <th className="px-2 py-1 text-right font-bold">Amount</th>
              <th className="px-2 py-1 text-right font-bold">Rate</th>
              <th className="px-2 py-1 text-right font-bold">TZS</th>
            </tr>
          </thead>
          <tbody>
            {currencies.map((cur) => {
              const a = agg[cur] ?? { amount: 0, tzs: 0 };
              const rate = cur === "TZS" ? 1 : a.amount ? a.tzs / a.amount : 0;
              const zero = !a.amount && !a.tzs;
              return (
                <tr
                  key={cur}
                  className={`border-b border-border/60 last:border-0 ${zero ? "text-muted-foreground" : ""}`}
                >
                  <td className="px-2 py-1 font-semibold">{cur}</td>
                  <td className="px-2 py-1 text-right font-mono tabular-nums">
                    {formatMoneyFull(Math.round(a.amount))}
                  </td>
                  <td className="px-2 py-1 text-right font-mono tabular-nums text-muted-foreground">
                    {cur === "TZS" ? "—" : rate ? formatMoneyFull(Math.round(rate)) : "—"}
                  </td>
                  <td className="px-2 py-1 text-right font-mono font-semibold tabular-nums">
                    {formatMoneyFull(Math.round(a.tzs))}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border bg-muted/50 font-bold">
              <td className="px-2 py-1 uppercase tracking-wider" colSpan={3}>{totalLabel}</td>
              <td className="px-2 py-1 text-right font-mono tabular-nums">
                {formatMoneyFull(Math.round(sum))}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};

export default CurrencyCashTable;
