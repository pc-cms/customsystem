/**
 * ChipDenomInput — chip denomination input list with configurable columns and size.
 * Supports per-casino color overrides via use-chip-colors hook.
 */
import { useRef, useCallback, type CSSProperties } from "react";
import { CHIP_DENOMS, formatChipLabel, formatNumberSpaces } from "@/lib/currency";
import { useChipColors, resolveChipColor, useVisibleChipDenoms } from "@/hooks/use-chip-colors";

type Size = "sm" | "md" | "lg";

type Props = {
  values: Record<number, number>;
  onChange: (values: Record<number, number>) => void;
  denoms?: readonly number[];
  showValue?: boolean;
  placeholder?: Record<number, number>;
  onSubmit?: () => void;
  /** Number of columns (1, 2 or 3). Default 1. */
  columns?: 1 | 2 | 3;
  /** Visual size of chip + input. Default "sm". */
  size?: Size;
};

// Unified chip visual is provided by .cms-chip-token (CSS). Only the input height
// and font scale here — the chip itself is the same size everywhere.
const SIZE_TOKENS: Record<Size, { inputH: string; inputText: string; chipClass: string; rowGap: string; gap: string }> = {
  sm: { inputH: "h-7",  inputText: "text-xs",  chipClass: "cms-chip-token",                       rowGap: "gap-y-1",   gap: "gap-1.5" },
  md: { inputH: "h-8",  inputText: "text-sm",  chipClass: "cms-chip-token",                       rowGap: "gap-y-1",   gap: "gap-2" },
  lg: { inputH: "h-10", inputText: "text-base", chipClass: "cms-chip-token cms-chip-token-lg",    rowGap: "gap-y-1",   gap: "gap-3" },
};

const ChipDenomInput = ({
  values,
  onChange,
  denoms,
  showValue = true,
  placeholder,
  onSubmit,
  columns = 1,
  size = "sm",
}: Props) => {
  const inputRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const { data: colorOverrides } = useChipColors();
  const visibleDenoms = useVisibleChipDenoms();
  const effectiveDenoms = denoms ?? visibleDenoms;
  const tokens = SIZE_TOKENS[size];

  const handleChange = useCallback((denom: number, raw: string) => {
    const val = raw === "" ? 0 : parseInt(raw, 10);
    if (isNaN(val) || val < 0) return;
    onChange({ ...values, [denom]: val });
  }, [values, onChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent, idx: number) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const nextDenom = effectiveDenoms[idx + 1];
      if (nextDenom !== undefined) inputRefs.current[nextDenom]?.focus();
      else onSubmit?.();
    }
  }, [effectiveDenoms, onSubmit]);

  const total = Object.entries(values).reduce((s, [d, c]) => s + Number(d) * (c || 0), 0);

  const handleChipClick = useCallback((denom: number) => {
    onChange({ ...values, [denom]: (values[denom] || 0) + 1 });
  }, [values, onChange]);

  // Column-major flow: with 2 cols and N denoms, first column gets ceil(N/2) items
  // (5M, 1M, 500K, 100K, 50K, 25K), second column gets the rest.
  const rowsPerCol = Math.ceil(effectiveDenoms.length / columns);
  const gridStyle: React.CSSProperties | undefined = columns > 1
    ? { gridTemplateRows: `repeat(${rowsPerCol}, minmax(0, auto))`, gridAutoFlow: "column" }
    : undefined;
  const gridColsClass = columns === 3 ? "grid-cols-3" : columns === 2 ? "grid-cols-2" : "grid-cols-1";

  return (
    <div>
      <div className={`grid gap-x-3 gap-y-1 ${gridColsClass}`} style={gridStyle}>
        {effectiveDenoms.map((d, idx) => {
          const val = values[d] || 0;
          const chipValue = val * d;
          const color = resolveChipColor(d, colorOverrides);
          return (
            <div key={d} className={`flex items-center ${tokens.gap}`}>
              <button
                type="button"
                onClick={() => handleChipClick(d)}
                title={`+1 × ${formatChipLabel(d)}`}
                className={`${tokens.chipClass} transition-transform hover:scale-105 active:scale-95 cursor-pointer`}
                style={{ "--chip-bg": color.bg, "--chip-edge": color.edge, "--chip-text": color.text } as CSSProperties}
              >
                {formatChipLabel(d)}
              </button>
              <input
                ref={el => { inputRefs.current[d] = el; }}
                type="number"
                className={`no-spin font-mono w-full min-w-0 rounded border border-border bg-background px-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary ${tokens.inputH} ${tokens.inputText}`}
                value={values[d] || ""}
                onChange={e => handleChange(d, e.target.value)}
                onKeyDown={e => handleKeyDown(e, idx)}
                placeholder={placeholder?.[d] !== undefined ? String(placeholder[d]) : "0"}
                inputMode="numeric"
              />
              {showValue && val > 0 && size !== "sm" && (
                <span className="font-mono text-[10px] text-muted-foreground whitespace-nowrap shrink-0">
                  ={formatNumberSpaces(chipValue)}
                </span>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-between gap-2 pt-2 mt-2 border-t border-border">
        <button
          type="button"
          onClick={() => onChange({})}
          className="text-xs font-semibold uppercase tracking-wider text-foreground hover:text-destructive transition-colors px-3 py-1 rounded border border-border hover:border-destructive"
          title="Clear all chip counts"
        >
          Clear
        </button>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-foreground uppercase tracking-wider">Total</span>
          <span className="font-mono text-base font-bold text-card-foreground">TZS {formatNumberSpaces(total)}</span>
        </div>
      </div>
    </div>
  );
};

export default ChipDenomInput;
