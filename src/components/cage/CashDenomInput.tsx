import { useRef } from "react";
import { formatCashDenomLabel, CURRENCY_SYMBOLS, formatNumberSpaces, formatNumberSpacesDecimals, COIN_KEY } from "@/lib/currency";
import { NumberInput } from "@/components/ui/number-input";

const cashSum = (cash: Record<number, number>) =>
  Object.entries(cash).reduce((s, [d, c]) => {
    if (d === "cents") return s + (Number(c) || 0) / 100;
    return s + Number(d) * (Number(c) || 0);
  }, 0);

type Size = "sm" | "md" | "lg";

const SIZES: Record<Size, { row: string; chip: string; input: string; total: string; gap: string }> = {
  sm: { row: "gap-1.5", chip: "text-[9px] h-6 w-14",  input: "text-xs h-7 w-24",   total: "text-xs",  gap: "space-y-0.5" },
  md: { row: "gap-2",   chip: "text-[10px] h-7 w-16", input: "text-sm h-9 w-24",   total: "text-base", gap: "space-y-1" },
  lg: { row: "gap-3",   chip: "text-xs h-10 w-20",    input: "text-base h-10 w-32", total: "text-lg",  gap: "space-y-1" },
};

const CashDenomInput = ({ values, onChange, denoms, currency, onSubmit, size = "md", placeholders }: {
  values: Record<number, number>;
  onChange: (v: Record<number, number>) => void;
  denoms: number[];
  currency: string;
  onSubmit?: () => void;
  size?: Size;
  /** Greyed hint values from the previous count (per denomination). */
  placeholders?: Record<number, number>;
}) => {
  const refs = useRef<Record<number, HTMLInputElement | null>>({});
  // Single free-form "Coins" field: a count of minor units (105 = 1.05 USD),
  // for TZS simply an amount in shillings.
  const coinKey = COIN_KEY(currency);
  const coinCount = Number(values[coinKey]) || 0;
  const total = cashSum(values);
  const t = SIZES[size];

  const fmtTotal = (n: number) =>
    currency === "TZS" ? formatNumberSpaces(n) : formatNumberSpacesDecimals(n, 2);

  return (
    <div className="flex flex-col">
      <div className={t.gap}>
      {denoms.map((d, idx) => (
        <div key={d} className={`flex items-center ${t.row}`}>
          <span className={`cms-chip bg-muted text-foreground shrink-0 justify-center ${t.chip}`}>
            {formatCashDenomLabel(d, currency)}
          </span>
          <NumberInput
            ref={el => { refs.current[d] = el; }}
            decimals={0}
            className={`no-spin font-mono rounded border border-border bg-background px-2 text-right text-foreground focus:outline-none focus:ring-1 focus:ring-primary flex-1 min-w-0 ${t.input}`}
            value={values[d] || 0}
            onValueChange={v => onChange({ ...values, [d]: v || 0 })}
            onKeyDown={e => {
              if (e.key === "Enter") {
                e.preventDefault();
                const next = denoms[idx + 1];
                if (next !== undefined) refs.current[next]?.focus();
                else refs.current[coinKey]?.focus();
              }
            }}
            placeholderValue={placeholders?.[d]}
          />
        </div>
      ))}

      <div className={`flex items-center ${t.row}`}>
        <span
          className={`cms-chip shrink-0 justify-center ${t.chip} bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-200`}
          title={currency === "TZS" ? "Coins — amount in TZS" : "Coins — amount in cents (105 = 1.05)"}
        >
          Coins
        </span>
        <NumberInput
          ref={el => { refs.current[coinKey] = el; }}
          decimals={0}
          min={0}
          className={`no-spin font-mono rounded border border-border bg-background px-2 text-right text-foreground focus:outline-none focus:ring-1 focus:ring-primary flex-1 min-w-0 ${t.input}`}
          value={coinCount}
          onValueChange={v => onChange({ ...values, [coinKey]: Math.max(0, Math.floor(v || 0)) })}
          onKeyDown={e => {
            if (e.key === "Enter") { e.preventDefault(); onSubmit?.(); }
          }}
          placeholderValue={placeholders?.[coinKey]}
        />
      </div>
      </div>
      <div className="flex items-center justify-between gap-2 pt-2 mt-2 border-t border-border">
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Total</span>
        <span className={`font-mono font-bold text-card-foreground whitespace-nowrap ${t.total}`}>
          {currency === "TZS" ? `TZS ${fmtTotal(total)}` : `${CURRENCY_SYMBOLS[currency] || currency}${fmtTotal(total)}`}
        </span>
      </div>
    </div>
  );
};

export { cashSum };
export default CashDenomInput;
