/**
 * CasinoDoubleBlock — per-casino card showing TODAY and MTD side-by-side.
 *
 * Each panel = a grid: rows Tables / Slots / TOTAL × cols Drop / Result / Hold%.
 * The TOTAL row is the headline (big numbers, glowing).
 *
 * All money/percent values are strictly single-line (`whitespace-nowrap`) and
 * sized with viewport `clamp()` so 4K scales up without ever wrapping digits.
 *
 * Displayed "Today" metrics are computed OUTSIDE this component
 * (`deriveDisplayedToday`) so the Company Total sums exactly what is rendered.
 */
import { formatMoneyFull } from "@/lib/format-money";
import type { CasinoDay, CasinoMetric } from "@/hooks/use-boss-dashboard";
import type { DisplayedToday } from "@/lib/boss-display-metrics";

const formatSigned = (n: number) => {
  const s = formatMoneyFull(Math.abs(Math.round(n)));
  return (n < 0 ? "-" : n > 0 ? "+" : "") + s;
};

const Cell = ({
  value,
  tone = "plain",
  size = "sm",
  accent,
}: {
  value: string;
  tone?: "plain" | "signed";
  size?: "sm" | "xl";
  accent?: string;
}) => {
  const color =
    tone === "signed"
      ? value.startsWith("-")
        ? "text-rose-400"
        : value.startsWith("+")
        ? "text-emerald-400"
        : "text-foreground"
      : "text-foreground";
  const sizeClass =
    size === "xl"
      ? "text-[clamp(24px,2.05vw,64px)] leading-none font-bold"
      : "text-[clamp(14px,1.05vw,34px)] leading-none font-semibold text-foreground/80";

  return (
    <span
      className={`font-mono tabular-nums tracking-tight text-right whitespace-nowrap min-w-0 ${sizeClass} ${color}`}
      style={size === "xl" && accent ? { textShadow: `0 0 22px ${accent}55` } : undefined}
    >
      {value}
    </span>
  );
};

const HeadLabel = ({ children }: { children: React.ReactNode }) => (
  <span className="text-[clamp(9px,0.55vw,17px)] uppercase tracking-[0.2em] text-muted-foreground/70 font-semibold text-right whitespace-nowrap">
    {children}
  </span>
);

const MetricsGrid = ({
  tables,
  slots,
  total,
  accent,
  slotsHint,
  slotsSubHint,
  slotsAvailable = true,
}: {
  tables: CasinoMetric;
  slots: CasinoMetric;
  total: CasinoMetric;
  accent: string;
  slotsHint?: string | null;
  slotsSubHint?: string | null;
  slotsAvailable?: boolean;
}) => (
  <div className="grid grid-cols-[minmax(0,auto)_minmax(0,1.35fr)_minmax(0,1.35fr)_minmax(0,0.5fr)] gap-x-[clamp(10px,1.1vw,34px)] gap-y-[clamp(6px,0.8vh,20px)] items-baseline">
    {/* header row */}
    <span />
    <HeadLabel>Drop</HeadLabel>
    <HeadLabel>Result</HeadLabel>
    <HeadLabel>Hold %</HeadLabel>

    {/* Tables */}
    <span className="text-[clamp(11px,0.72vw,22px)] uppercase tracking-[0.18em] text-muted-foreground font-semibold whitespace-nowrap">
      Tables
    </span>
    <Cell value={formatMoneyFull(tables.drop)} />
    <Cell value={formatSigned(tables.result)} tone="signed" />
    <Cell value={`${tables.hold.toFixed(1)}%`} />

    {/* Slots */}
    <span className="text-[clamp(11px,0.72vw,22px)] uppercase tracking-[0.18em] text-muted-foreground font-semibold whitespace-nowrap min-w-0">
      Slots
    </span>
    <Cell value={slotsAvailable ? formatMoneyFull(slots.drop) : "·"} />
    <Cell value={slotsAvailable ? formatSigned(slots.result) : "·"} tone="signed" />
    <Cell value={slotsAvailable ? `${slots.hold.toFixed(1)}%` : "·"} />

    {/* ACE hints — compact single line, never widen the card */}
    {(slotsHint || slotsSubHint) && (
      <span className="col-span-4 text-[clamp(8px,0.42vw,13px)] text-muted-foreground/60 truncate">
        {[slotsHint, slotsSubHint].filter(Boolean).join(" · ")}
      </span>
    )}

    {/* divider */}
    <span className="col-span-4 h-px bg-white/10 my-[clamp(2px,0.4vh,10px)]" />

    {/* TOTAL — headline row */}
    <span
      className="text-[clamp(11px,0.72vw,22px)] uppercase tracking-[0.2em] font-extrabold whitespace-nowrap"
      style={{ color: accent }}
    >
      Total
    </span>
    <Cell value={formatMoneyFull(total.drop)} size="xl" accent={accent} />
    <Cell value={formatSigned(total.result)} tone="signed" size="xl" accent={accent} />
    <Cell value={`${total.hold.toFixed(1)}%`} size="xl" accent={accent} />
  </div>
);


const Panel = ({
  title,
  accent,
  children,
}: {
  title: string;
  accent: string;
  children: React.ReactNode;
}) => (
  <div className="flex-1 min-w-0 flex flex-col gap-[clamp(4px,0.6vh,14px)] px-[clamp(8px,0.7vw,22px)] py-[clamp(6px,0.8vh,18px)]">
    <div
      className="text-[clamp(9px,0.5vw,16px)] font-extrabold tracking-[0.26em] uppercase"
      style={{ color: accent }}
    >
      {title}
    </div>
    {children}
  </div>
);

interface Props {
  name: string;
  slug: string | null;
  accent: string;
  day: CasinoDay | undefined;
  /** Displayed Today metrics (ACE override already applied upstream). */
  displayed: DisplayedToday | null;
  orientation?: "auto" | "cols" | "rows";
}

export function CasinoDoubleBlock({ name, slug, accent, day, displayed, orientation = "auto" }: Props) {
  const layoutClass =
    orientation === "cols"
      ? "flex flex-row divide-y-0 divide-x divide-white/5"
      : orientation === "rows"
      ? "flex flex-col divide-y divide-x-0 divide-white/5"
      : "flex flex-col portrait:flex-col landscape:flex-row divide-y divide-white/5 landscape:divide-y-0 landscape:divide-x";

  return (
    <section
      className="relative flex flex-col min-h-0 min-w-0 rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-transparent overflow-hidden"
      style={{ boxShadow: `inset 0 1px 0 0 ${accent}22, 0 0 40px -20px ${accent}` }}
    >
      <header
        className="flex items-center justify-between gap-3 px-[clamp(8px,0.8vw,24px)] py-[clamp(4px,0.6vh,14px)]"
        style={{ background: `linear-gradient(90deg, ${accent}22 0%, transparent 60%)` }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span
            className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
            style={{ background: accent, boxShadow: `0 0 20px ${accent}` }}
          />
          <h2
            className="text-[clamp(13px,0.85vw,28px)] font-extrabold tracking-[0.2em] uppercase truncate"
            style={{ color: accent }}
          >
            {name}
          </h2>
          {slug && (
            <span className="text-[clamp(8px,0.4vw,13px)] uppercase tracking-widest text-muted-foreground truncate">
              {slug}
            </span>
          )}
        </div>
        {day && (
          <div className="flex items-center gap-2 text-[clamp(8px,0.42vw,13px)] uppercase tracking-[0.2em] text-muted-foreground whitespace-nowrap">
            <span>Head</span>
            <span className="font-mono font-bold text-foreground text-[clamp(12px,0.72vw,24px)]">
              {day.total.headCount}
            </span>
          </div>
        )}
      </header>

      {day && displayed ? (
        <div className={`${layoutClass} flex-1 min-h-0`}>
          <Panel title="Today" accent={accent}>
            <MetricsGrid
              tables={displayed.tables}
              slots={displayed.slots}
              slotsHint={displayed.aceHint}
              slotsSubHint={displayed.aceCreditsHint}
              slotsAvailable={displayed.slotsAvailable}
              total={displayed.total}
              accent={accent}
            />
          </Panel>

          <Panel title="MTD" accent={accent}>
            <MetricsGrid
              tables={{
                drop: day.mtd.drop,
                result: day.mtd.result,
                headCount: 0,
                hold: day.mtd.hold,
              }}
              slots={{ drop: 0, result: 0, headCount: 0, hold: 0 }}
              slotsAvailable={false}
              total={{
                drop: day.mtd.drop,
                result: day.mtd.result,
                headCount: 0,
                hold: day.mtd.hold,
              }}
              accent={accent}
            />
          </Panel>
        </div>
      ) : (
        <div className="flex-1 py-10 text-center text-muted-foreground">Loading…</div>
      )}

      <div className="px-[clamp(8px,0.8vw,24px)] py-[clamp(2px,0.3vh,8px)] border-t border-white/5 flex items-center justify-between gap-3 text-[clamp(7px,0.38vw,12px)] uppercase tracking-[0.2em] text-muted-foreground/70 whitespace-nowrap overflow-hidden">
        <span className="truncate">Tables · Chips Check / Day Closing</span>
        <span className="truncate">
          {displayed?.usesAce ? "Slots · ACE Live" : "Slots · Day Closing only"}
        </span>
      </div>
    </section>
  );
}
