/**
 * CasinoDoubleBlock — per-casino card showing TODAY and MTD side-by-side.
 *
 * Each panel = a 3×3 grid: rows Tables / Slots / TOTAL × cols Drop / Result / Hold%.
 * The TOTAL row is the headline (huge numbers, glowing). Six headline figures
 * per casino (3 Today + 3 MTD) with tables/slots breakdown right above them.
 */
import { formatMoneyFull } from "@/lib/format-money";
import type { CasinoDay, CasinoMetric } from "@/hooks/use-boss-dashboard";
import { useAceLiveSlotsResult } from "@/hooks/use-ace-finance";


const formatSigned = (n: number) => {
  const s = formatMoneyFull(Math.abs(Math.round(n)));
  return (n < 0 ? "-" : n > 0 ? "+" : "") + s;
};

const signedColor = (n: number) =>
  n > 0 ? "text-emerald-400" : n < 0 ? "text-rose-400" : "text-foreground/80";

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
      ? "text-[2.2em] leading-none font-bold"
      : "text-[0.95em] leading-none font-medium text-foreground/75";
  return (
    <span
      className={`font-mono tabular-nums tracking-tight text-right ${sizeClass} ${color}`}
      style={size === "xl" && accent ? { textShadow: `0 0 22px ${accent}55` } : undefined}
    >
      {value}
    </span>
  );
};

const MetricsGrid = ({
  tables,
  slots,
  total,
  accent,
  slotsHint,
}: {
  tables: CasinoMetric;
  slots: CasinoMetric;
  total: CasinoMetric;
  accent: string;
  slotsHint?: string | null;
}) => (
  <div className="grid grid-cols-[auto_1fr_1fr_1fr] gap-x-4 gap-y-2 items-baseline">
    {/* header row */}
    <span />
    <span className="text-[0.58em] uppercase tracking-[0.24em] text-muted-foreground/70 font-semibold text-right">
      Drop
    </span>
    <span className="text-[0.58em] uppercase tracking-[0.24em] text-muted-foreground/70 font-semibold text-right">
      Result
    </span>
    <span className="text-[0.58em] uppercase tracking-[0.24em] text-muted-foreground/70 font-semibold text-right">
      Hold %
    </span>

    {/* Tables */}
    <span className="text-[0.68em] uppercase tracking-[0.2em] text-muted-foreground font-semibold">
      Tables
    </span>
    <Cell value={formatMoneyFull(tables.drop)} />
    <Cell value={formatSigned(tables.result)} tone="signed" />
    <Cell value={`${tables.hold.toFixed(1)}%`} />

    {/* Slots */}
    <span className="text-[0.68em] uppercase tracking-[0.2em] text-muted-foreground font-semibold">
      Slots
      {slotsHint && (
        <span className="block text-[0.72em] normal-case tracking-normal text-muted-foreground/60 font-normal">
          {slotsHint}
        </span>
      )}
    </span>
    <Cell value={formatMoneyFull(slots.drop)} />
    <Cell value={formatSigned(slots.result)} tone="signed" />
    <Cell value={`${slots.hold.toFixed(1)}%`} />


    {/* divider */}
    <span className="col-span-4 h-px bg-white/10 my-1" />

    {/* TOTAL — headline row */}
    <span
      className="text-[0.7em] uppercase tracking-[0.24em] font-extrabold"
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
  subtitle,
  accent,
  children,
}: {
  title: string;
  subtitle?: string;
  accent: string;
  children: React.ReactNode;
}) => (
  <div className="flex-1 min-w-0 flex flex-col gap-4 p-5">
    <div className="flex items-baseline justify-between">
      <div
        className="text-[0.78em] font-extrabold tracking-[0.28em] uppercase"
        style={{ color: accent }}
      >
        {title}
      </div>
      {subtitle && (
        <div className="text-[0.6em] uppercase tracking-[0.22em] text-muted-foreground">
          {subtitle}
        </div>
      )}
    </div>
    {children}
  </div>
);

interface Props {
  name: string;
  slug: string | null;
  accent: string;
  day: CasinoDay | undefined;
  orientation?: "auto" | "cols" | "rows";
}

export function CasinoDoubleBlock({ name, slug, accent, day, orientation = "auto" }: Props) {
  // A FRESH (≤15 min) ACE live feed replaces the displayed slots drop & result
  // for any casino whose slug matches an ACE location_code. Stale or missing data
  // falls back to the existing calculation.
  const ace = useAceLiveSlotsResult(slug);
  const useAce = ace.fresh && ace.totalDrop != null && ace.netWin != null;
  const aceHint = useAce
    ? `ACE Live · ${Math.max(0, Math.round((ace.ageMs ?? 0) / 60000))}m ago${ace.periodLabel ? ` · ${ace.periodLabel}` : ""}`
    : null;
  const todaySlots: CasinoMetric | undefined = day
    ? useAce
      ? {
          ...day.slots,
          drop: ace.totalDrop as number,
          result: ace.netWin as number,
          hold: (ace.totalDrop as number) > 0
            ? ((ace.netWin as number) / (ace.totalDrop as number)) * 100
            : 0,
        }
      : day.slots
    : undefined;


  const layoutClass =

    orientation === "cols"
      ? "flex flex-row divide-y-0 divide-x divide-white/5"
      : orientation === "rows"
      ? "flex flex-col divide-y divide-x-0 divide-white/5"
      : "flex flex-col portrait:flex-col landscape:flex-row divide-y divide-white/5 landscape:divide-y-0 landscape:divide-x";

  return (
    <section
      className="relative rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-transparent overflow-hidden"
      style={{ boxShadow: `inset 0 1px 0 0 ${accent}22, 0 0 40px -20px ${accent}` }}
    >
      <header
        className="flex items-center justify-between px-6 py-4"
        style={{ background: `linear-gradient(90deg, ${accent}22 0%, transparent 60%)` }}
      >
        <div className="flex items-center gap-4 min-w-0">
          <span
            className="inline-block w-3 h-3 rounded-full shrink-0"
            style={{ background: accent, boxShadow: `0 0 20px ${accent}` }}
          />
          <h2
            className="text-[1.4em] font-extrabold tracking-[0.22em] uppercase truncate"
            style={{ color: accent }}
          >
            {name}
          </h2>
          {slug && (
            <span className="text-[0.65em] uppercase tracking-widest text-muted-foreground">
              {slug}
            </span>
          )}
        </div>
        {day && (
          <div className="flex items-center gap-3 text-[0.62em] uppercase tracking-[0.22em] text-muted-foreground">
            <span>Head</span>
            <span className="font-mono font-bold text-foreground text-[1.4em]">
              {day.total.headCount}
            </span>
          </div>
        )}
      </header>

      {day ? (
        <div className={layoutClass}>
          <Panel title="Today" accent={accent}>
            <MetricsGrid
              tables={day.live}
              slots={todaySlots ?? day.slots}
              slotsHint={aceHint}
              total={day.total}
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
        <div className="py-16 text-center text-muted-foreground">Loading…</div>
      )}

      <div className="px-6 py-2 border-t border-white/5 flex items-center justify-between text-[0.55em] uppercase tracking-[0.22em] text-muted-foreground/70">
        <span>Tables · Reports Daily Balance</span>
        <span>{useAce ? "Slots · ACE Live" : "Slots · Day Closing / Live"}</span>
      </div>

    </section>
  );
}
