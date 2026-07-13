/**
 * CasinoDoubleBlock — per-casino card showing TODAY and MTD side-by-side.
 *
 * Layout rules:
 *   - Landscape (default TV orientation): two columns (Today | MTD).
 *   - Portrait: two rows (Today on top, MTD below).
 *
 * All colors read from the accent passed in (already a semantic hsl value).
 */
import { formatMoneyFull } from "@/lib/format-money";
import type { CasinoDay } from "@/hooks/use-boss-dashboard";

const formatSigned = (n: number) => {
  const s = formatMoneyFull(Math.abs(Math.round(n)));
  return (n < 0 ? "-" : n > 0 ? "+" : "") + s;
};

const signedColor = (n: number) =>
  n > 0 ? "text-emerald-400" : n < 0 ? "text-rose-400" : "text-foreground";

const Kpi = ({
  label,
  value,
  tone = "plain",
  accent,
}: {
  label: string;
  value: string;
  tone?: "plain" | "signed";
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
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <span className="text-[0.62em] uppercase tracking-[0.24em] text-muted-foreground/80 font-semibold">
        {label}
      </span>
      <span
        className={`font-mono font-bold tabular-nums tracking-tight text-[2.4em] leading-none ${color}`}
        style={accent ? { textShadow: `0 0 24px ${accent}55` } : undefined}
      >
        {value}
      </span>
    </div>
  );
};

const Panel = ({
  title,
  children,
  accent,
}: {
  title: string;
  accent: string;
  children: React.ReactNode;
}) => (
  <div className="flex-1 min-w-0 flex flex-col gap-4 p-5 min-h-0">
    <div
      className="text-[0.72em] font-extrabold tracking-[0.28em] uppercase"
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
}

export function CasinoDoubleBlock({ name, slug, accent, day }: Props) {
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
      </header>

      {day ? (
        <div className="flex flex-col portrait:flex-col landscape:flex-row divide-y divide-white/5 landscape:divide-y-0 landscape:divide-x">
          <Panel title="MTD" accent={accent}>
            <Kpi label="Drop" value={formatMoneyFull(day.mtd.drop)} accent={accent} />
            <Kpi label="Result" value={formatSigned(day.mtd.result)} tone="signed" />
            <Kpi label="Hold %" value={`${day.mtd.hold.toFixed(1)}%`} />
          </Panel>

          <Panel title="Today" accent={accent}>
            <Kpi label="Drop" value={formatMoneyFull(day.total.drop)} accent={accent} />
            <Kpi label="Result" value={formatSigned(day.total.result)} tone="signed" />
            <div className="grid grid-cols-2 gap-4">
              <Kpi label="Hold %" value={`${day.total.hold.toFixed(1)}%`} />
              <Kpi label="Head Count" value={String(day.total.headCount)} />
            </div>
            <div className="mt-1 grid grid-cols-2 gap-3 text-[0.68em] text-muted-foreground border-t border-white/5 pt-3">
              <div className="flex flex-col">
                <span className="uppercase tracking-widest">Live drop</span>
                <span className="font-mono tabular-nums text-foreground/80">
                  {formatMoneyFull(day.live.drop)}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="uppercase tracking-widest">Slots drop</span>
                <span className="font-mono tabular-nums text-foreground/80">
                  {formatMoneyFull(day.slots.drop)}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="uppercase tracking-widest">Live result</span>
                <span className={`font-mono tabular-nums ${signedColor(day.live.result)}`}>
                  {formatSigned(day.live.result)}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="uppercase tracking-widest">Slots result</span>
                <span className={`font-mono tabular-nums ${signedColor(day.slots.result)}`}>
                  {formatSigned(day.slots.result)}
                </span>
              </div>
            </div>
          </Panel>
        </div>
      ) : (
        <div className="py-16 text-center text-muted-foreground">Loading…</div>
      )}
    </section>
  );
}
