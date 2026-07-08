/**
 * CashCheckNewGrid — "New" variant of the cash-check screen.
 * Shows locked expected (from opening float + running tx counters) next to
 * actual physical count for each chip denomination, and expected total per
 * cash currency alongside per-denom cash input (counted vs expected sum).
 *
 * Banks / Mobile / Cashless blocks are intentionally omitted here — those are
 * outside the expected/actual reconciliation loop and stay in the Old grid.
 */
import { CSSProperties } from "react";
import { NumberInput } from "@/components/ui/number-input";
import CashDenomInput, { cashSum } from "@/components/cage/CashDenomInput";
import {
  CURRENCIES, CASH_DENOMS, formatNumberSpaces, formatChipLabel, CURRENCY_SYMBOLS,
} from "@/lib/currency";
import {
  useChipColors, resolveChipColor, useVisibleChipDenoms,
} from "@/hooks/use-chip-colors";
import type { ExpectedCheckState } from "@/hooks/use-expected-check-state";
import { ProviderBlock } from "./CashCountGrid";
import { mobileTotal, type MobileProviders } from "./CageHelpers";

const sumChips = (r: Record<number, number>) =>
  Object.entries(r).reduce((s, [d, q]) => s + Number(d) * (Number(q) || 0), 0);

const ChipRow = ({
  denom, expected, actual, onChange,
}: {
  denom: number;
  expected: number;
  actual: number;
  onChange: (v: number) => void;
}) => {
  const { data: colorOverrides } = useChipColors();
  const color = resolveChipColor(denom, colorOverrides);
  const delta = actual - expected;
  const cls =
    delta === 0
      ? "text-muted-foreground/50"
      : delta > 0
        ? "cms-amount-positive"
        : "cms-amount-negative";
  return (
    <div className="grid grid-cols-[auto_auto_1fr_auto] items-center gap-2 py-0.5">
      <span
        className="cms-chip-token cms-chip-token-lg"
        style={{ "--chip-bg": color.bg, "--chip-edge": color.edge, "--chip-text": color.text } as CSSProperties}
      >
        {formatChipLabel(denom)}
      </span>
      <span
        className="font-mono text-xs tabular-nums text-muted-foreground w-10 text-right"
        title="Expected (locked)"
      >
        {expected}
      </span>
      <NumberInput
        value={actual || ""}
        onChange={(v) => onChange(Number(v) || 0)}
        className="no-spin font-mono h-9 text-sm text-right"
        placeholder="0"
      />
      <span className={`font-mono text-[10px] tabular-nums w-12 text-right ${cls}`}>
        {delta === 0 ? "✓" : `${delta > 0 ? "+" : ""}${delta}`}
      </span>
    </div>
  );
};

const CashCheckNewGrid = ({
  chips, onChipsChange,
  cash, onCashChange,
  expected,
}: {
  chips: Record<number, number>;
  onChipsChange: (v: Record<number, number>) => void;
  cash: Record<string, Record<number, number>>;
  onCashChange: (currency: string, v: Record<number, number>) => void;
  expected: ExpectedCheckState;
}) => {
  const visibleDenoms = useVisibleChipDenoms();
  const denoms = [...new Set([
    ...visibleDenoms,
    ...Object.keys(expected.expectedChips).map(Number),
    ...Object.keys(chips).map(Number),
  ])].filter(n => n > 0).sort((a, b) => b - a);

  const sectionCls = "rounded-xl border border-border bg-background/40 p-3 flex flex-col";
  const titleCls = "text-xs font-bold text-foreground uppercase tracking-[0.22em] mb-2";

  const chipCountedTzs = sumChips(chips);
  const chipExpectedTzs = sumChips(expected.expectedChips);

  return (
    <div className="space-y-3">
      {!expected.hasOpening && (
        <div className="text-[11px] text-warning px-2 py-1 rounded bg-warning/10 border border-warning/30">
          Opening snapshot missing — expected values default to 0.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-3 items-start">
        {/* Column 1 — Chips */}
        <section className={sectionCls}>
          <p className={titleCls}>TZS Chips · expected / actual</p>
          <div className="grid grid-cols-[auto_auto_1fr_auto] gap-2 pb-1 mb-1 border-b border-border text-[9px] uppercase tracking-wider text-muted-foreground">
            <span>Chip</span>
            <span className="text-right">Exp</span>
            <span className="text-right pr-1">Actual</span>
            <span className="text-right">Δ</span>
          </div>
          <div>
            {denoms.map(d => (
              <ChipRow
                key={d}
                denom={d}
                expected={expected.expectedChips[d] || 0}
                actual={chips[d] || 0}
                onChange={(v) => onChipsChange({ ...chips, [d]: v })}
              />
            ))}
          </div>
          <div className="flex items-center justify-between pt-2 mt-2 border-t border-border text-xs font-mono">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Total</span>
            <div className="flex flex-col items-end leading-tight">
              <span className="text-muted-foreground">exp {formatNumberSpaces(chipExpectedTzs)}</span>
              <span className="font-bold text-card-foreground">TZS {formatNumberSpaces(chipCountedTzs)}</span>
            </div>
          </div>
        </section>

        {/* Columns 2–4 — Cash per currency */}
        {CURRENCIES.map((cur) => {
          const denomsList = CASH_DENOMS[cur] || [];
          const counted = cashSum(cash[cur] || {});
          const exp = expected.expectedCashByCurrency[cur] || 0;
          const diff = counted - exp;
          const sym = CURRENCY_SYMBOLS[cur] || cur;
          const diffCls = diff === 0 ? "text-success" : "text-destructive";
          return (
            <section key={cur} className={sectionCls}>
              <div className="flex items-center justify-between mb-2">
                <p className={titleCls + " mb-0"}>{cur} Cash</p>
                <span
                  className="font-mono text-[10px] text-muted-foreground tabular-nums"
                  title="Expected total from opening + transactions"
                >
                  exp {formatNumberSpaces(exp)}
                </span>
              </div>
              <CashDenomInput
                values={cash[cur] || {}}
                onChange={(v) => onCashChange(cur, v)}
                denoms={denomsList}
                currency={cur}
                size="lg"
              />
              <div className="flex items-center justify-between pt-2 mt-2 border-t border-border text-xs font-mono">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Diff</span>
                <span className={`font-bold ${diffCls}`}>
                  {diff === 0 ? "Balanced" : `${diff > 0 ? "+" : ""}${cur === "TZS" ? "TZS " : sym}${formatNumberSpaces(diff)}`}
                </span>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
};

export default CashCheckNewGrid;
