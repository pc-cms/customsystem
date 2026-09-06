import { useRef } from "react";
import { formatCashDenomLabel, CURRENCY_SYMBOLS, formatNumberSpaces, formatNumberSpacesDecimals, COIN_DENOMS } from "@/lib/currency";
import { NumberInput } from "@/components/ui/number-input";

const cashSum = (cash: Record<number, number>) =>
  Object.entries(cash).reduce((s, [d, c]) => s + Number(d) * (c || 0), 0);

type Size = "sm" | "md" | "lg";

const SIZES: Record<Size, { row: string; chip: string; input: string; total: string; gap: string }> = {
  sm: { row: "gap-1.5", chip: "text-[9px] h-6 w-14",  input: "text-xs h-7 w-24",   total: "text-xs",  gap: "space-y-0.5" },
  md: { row: "gap-2",   chip: "text-[10px] h-7 w-16", input: "text-sm h-9 w-24",   total: "text-base", gap: "space-y-1" },
  lg: { row: "gap-3",   chip: "text-xs h-10 w-20",    input: "text-base h-10 w-32", total: "text-lg",  gap: "space-y-1" },
};

const CashDenomInput = ({ values, onChange, denoms, currency, onSubmit, size = "md", cents, onCentsChange, placeholders, centsPlaceholder }: {
  values: Record<number, number>;
  onChange: (v: Record<number, number>) => void;
  denoms: number[];
  currency: string;
  onSubmit?: () => void;
  size?: Size;
  /** Optional fractional part (kopeks/cents) — enables an extra small input. */
  cents?: number;
  onCentsChange?: (c: number) => void;
  /** Greyed hint values from the previous count (per denomination). */
  placeholders?: Record<number, number>;
  centsPlaceholder?: number;
}) => {
  const refs = useRef<Record<number, HTMLInputElement | null>>({});
  const showCents = typeof cents === "number" && !!onCentsChange;
  const total = cashSum(values) + (showCents ? (cents || 0) / 100 : 0);
  const t = SIZES[size];

  const fmtTotal = (n: number) => {
    if (!showCents) return formatNumberSpaces(n);
    const int = Math.trunc(n);
    const frac = Math.round((n - int) * 100);
    return `${formatNumberSpaces(int)}.${String(frac).padStart(2, "0")}`;
  };

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
                else onSubmit?.();
              }
            }}
            placeholderValue={placeholders?.[d]}
          />
        </div>
      ))}
      {showCents && (
        <div className={`flex items-center ${t.row}`}>
          <span className={`cms-chip bg-muted text-foreground shrink-0 justify-center ${t.chip}`}>
            Coins
          </span>
          <NumberInput
            decimals={0}
            min={0}
            step={1}
            className={`no-spin font-mono rounded border border-border bg-background px-2 text-right text-foreground focus:outline-none focus:ring-1 focus:ring-primary flex-1 min-w-0 ${t.input}`}
            value={cents || 0}
            onValueChange={v => onCentsChange!(Math.max(0, Math.floor(v || 0)))}
            placeholderValue={centsPlaceholder}
          />
        </div>
      )}
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
