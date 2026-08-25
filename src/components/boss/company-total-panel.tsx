/**
 * CompanyTotalPanel — bottom-of-page aggregate across all selected casinos.
 * Shows Today + MTD side-by-side and two 100 %-stacked share bars
 * (MTD Drop / MTD Result) broken down by casino.
 *
 * Today aggregates are passed in as the EXACT sum of the displayed casino card
 * totals (`sumDisplayedToday`) — never recomputed here, so the panel always
 * matches the cards (including the ACE live slots override).
 * MTD keeps the existing closed/frozen-data logic.
 */
import { formatMoneyFull } from "@/lib/format-money";
import type { CasinoDay } from "@/hooks/use-boss-dashboard";
import type { CompanyToday } from "@/lib/boss-display-metrics";
import { StackedShareBar, type ShareSegment } from "./stacked-share-bar";

const formatSigned = (n: number) => {
  const s = formatMoneyFull(Math.abs(Math.round(n)));
  return (n < 0 ? "-" : n > 0 ? "+" : "") + s;
};

const Kpi = ({
  label,
  value,
  tone = "plain",
}: {
  label: string;
  value: string;
  tone?: "plain" | "signed";
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
      <span className="text-[clamp(8px,0.42vw,13px)] uppercase tracking-[0.24em] text-muted-foreground/80 font-semibold whitespace-nowrap">
        {label}
      </span>
      <span
        className={`font-mono font-bold tabular-nums tracking-tight whitespace-nowrap text-[clamp(18px,1.5vw,50px)] leading-none ${color}`}
      >
        {value}
      </span>
    </div>
  );
};


interface Casino {
  id: string;
  name: string;
  slug: string | null;
}

interface Props {
  casinos: Casino[];
  days: CasinoDay[];
  /** Returns the accent color (hsl string) for a casino. */
  accentFor: (slug: string | null, idx: number) => string;
}

export function CompanyTotalPanel({ casinos, days, accentFor }: Props) {
  const dayMap = Object.fromEntries(days.map((d) => [d.casinoId, d]));

  // Today aggregate
  const today = days.reduce(
    (acc, d) => {
      acc.drop += d.total.drop;
      acc.result += d.total.result;
      acc.headCount += d.total.headCount;
      return acc;
    },
    { drop: 0, result: 0, headCount: 0 },
  );
  const todayHold = today.drop > 0 ? (today.result / today.drop) * 100 : 0;

  // MTD aggregate
  const mtd = days.reduce(
    (acc, d) => {
      acc.drop += d.mtd.drop;
      acc.result += d.mtd.result;
      return acc;
    },
    { drop: 0, result: 0 },
  );
  const mtdHold = mtd.drop > 0 ? (mtd.result / mtd.drop) * 100 : 0;

  const dropSegments: ShareSegment[] = casinos.map((c, i) => ({
    id: c.id,
    label: c.name,
    value: dayMap[c.id]?.mtd.drop ?? 0,
    color: accentFor(c.slug, i),
  }));

  const resultSegments: ShareSegment[] = casinos.map((c, i) => ({
    id: c.id,
    label: c.name,
    value: dayMap[c.id]?.mtd.result ?? 0,
    color: accentFor(c.slug, i),
  }));

  return (
    <section className="rounded-2xl border border-white/10 bg-gradient-to-b from-primary/[0.08] to-transparent overflow-hidden">
      <header className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-gradient-to-r from-primary/[0.14] to-transparent">
        <h2 className="text-[1.4em] font-extrabold tracking-[0.28em] uppercase text-primary">
          Company Total
        </h2>
        <span className="text-[0.7em] uppercase tracking-widest text-muted-foreground">
          {casinos.length} casino{casinos.length === 1 ? "" : "s"}
        </span>
      </header>

      <div className="flex flex-col landscape:flex-row divide-y landscape:divide-y-0 landscape:divide-x divide-white/5">
        <div className="flex-1 p-6 flex flex-col gap-5">
          <div className="text-[0.72em] font-extrabold tracking-[0.28em] uppercase text-primary/90">
            MTD
          </div>
          <Kpi label="Total Drop" value={formatMoneyFull(mtd.drop)} />
          <Kpi label="Total Result" value={formatSigned(mtd.result)} tone="signed" />
          <Kpi label="Hold %" value={`${mtdHold.toFixed(1)}%`} />
        </div>

        <div className="flex-1 p-6 flex flex-col gap-5">
          <div className="text-[0.72em] font-extrabold tracking-[0.28em] uppercase text-primary/90">
            Today
          </div>
          <Kpi label="Total Drop" value={formatMoneyFull(today.drop)} />
          <Kpi label="Total Result" value={formatSigned(today.result)} tone="signed" />
          <div className="grid grid-cols-2 gap-4">
            <Kpi label="Hold %" value={`${todayHold.toFixed(1)}%`} />
            <Kpi label="Head Count" value={String(today.headCount)} />
          </div>
        </div>
      </div>

      <div className="p-6 border-t border-white/5 flex flex-col gap-5">
        <StackedShareBar title="MTD Drop · share by casino" segments={dropSegments} />
        <StackedShareBar title="MTD Result · share by casino" segments={resultSegments} signed />
      </div>
    </section>
  );
}
