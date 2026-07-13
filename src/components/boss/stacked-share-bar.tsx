/**
 * StackedShareBar — 100 %-stacked horizontal bar used in the Boss TV
 * Company Total panel. Each segment represents one casino's share of the
 * cross-network aggregate (MTD Drop or MTD Result). Colors come from
 * semantic design tokens (--boss-casino-1..4) — no hard-coded hex.
 *
 * Negative segments (possible for Result) use their absolute value to
 * compute the proportion so the bar still reads as 100 %, and are marked
 * with a diagonal-stripe overlay + "-" prefix on the legend.
 */
import { formatMoneyFull } from "@/lib/format-money";

export type ShareSegment = {
  id: string;
  label: string;
  value: number;
  /** CSS color (usually `hsl(var(--boss-casino-N))`). */
  color: string;
};

interface Props {
  title: string;
  segments: ShareSegment[];
  /** When true, format values as signed money (for Result bar). */
  signed?: boolean;
}

export function StackedShareBar({ title, segments, signed = false }: Props) {
  const abs = segments.map((s) => ({ ...s, absValue: Math.abs(s.value) }));
  const total = abs.reduce((acc, s) => acc + s.absValue, 0);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <span className="text-[0.72em] uppercase tracking-[0.24em] font-bold text-muted-foreground">
          {title}
        </span>
        <span className="font-mono tabular-nums text-[1em] font-bold">
          {signed
            ? (segments.reduce((a, s) => a + s.value, 0) < 0 ? "-" : "") +
              formatMoneyFull(Math.abs(segments.reduce((a, s) => a + s.value, 0)))
            : formatMoneyFull(total)}
        </span>
      </div>

      <div
        className="relative h-6 w-full rounded-md overflow-hidden border border-white/10 bg-white/[0.04] flex"
        role="img"
        aria-label={title}
      >
        {total === 0 ? (
          <div className="w-full h-full flex items-center justify-center text-[0.65em] uppercase tracking-widest text-muted-foreground">
            No data
          </div>
        ) : (
          abs.map((s) => {
            const pct = (s.absValue / total) * 100;
            if (pct < 0.5) return null;
            const isNeg = s.value < 0;
            return (
              <div
                key={s.id}
                className="h-full flex items-center justify-center overflow-hidden text-[0.6em] font-bold uppercase tracking-wider text-black/80 relative"
                style={{
                  width: `${pct}%`,
                  background: s.color,
                  backgroundImage: isNeg
                    ? "repeating-linear-gradient(45deg, rgba(0,0,0,0.35) 0 6px, transparent 6px 12px)"
                    : undefined,
                }}
                title={`${s.label}: ${pct.toFixed(1)}%`}
              >
                {pct >= 6 && <span className="px-1 truncate">{pct.toFixed(0)}%</span>}
              </div>
            );
          })
        )}
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[0.7em]">
        {segments.map((s) => {
          const pct = total > 0 ? (Math.abs(s.value) / total) * 100 : 0;
          return (
            <span key={s.id} className="inline-flex items-center gap-2">
              <span
                className="inline-block w-2.5 h-2.5 rounded-sm"
                style={{ background: s.color }}
              />
              <span className="font-semibold uppercase tracking-wider">{s.label}</span>
              <span className="font-mono tabular-nums text-muted-foreground">
                {pct.toFixed(0)}% ·{" "}
                {(signed && s.value < 0 ? "-" : "") + formatMoneyFull(Math.abs(s.value))}
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
