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
  /** Sum of the DISPLAYED casino card Today totals — never recomputed here. */
  today: CompanyToday;
  /** Sum of the DISPLAYED casino card Monthly totals (tables + slots). */
  monthly: CompanyToday;
  /** Active period — drives which KPI block and share bars are shown. */
  period: "today" | "monthly";
  periodLabel?: string;
  /** Returns the accent color (hsl string) for a casino. */
  accentFor: (slug: string | null, idx: number) => string;
}

export function CompanyTotalPanel({ casinos, days, today, monthly, period, periodLabel, accentFor }: Props) {
  const dayMap = Object.fromEntries(days.map((d) => [d.casinoId, d]));
  const isToday = period === "today";

  const monthlyDrop = (id: string) => {
    const d = dayMap[id];
    return d ? d.mtdTables.drop + d.mtdSlots.drop : 0;
  };
  const monthlyResult = (id: string) => {
    const d = dayMap[id];
    return d ? d.mtdTables.result + d.mtdSlots.result : 0;
  };

  const dropSegments: ShareSegment[] = casinos.map((c, i) => ({
    id: c.id,
    label: c.name,
    value: isToday ? 0 : monthlyDrop(c.id),
    color: accentFor(c.slug, i),
  }));

  const resultSegments: ShareSegment[] = casinos.map((c, i) => ({
    id: c.id,
    label: c.name,
    value: isToday ? 0 : monthlyResult(c.id),
    color: accentFor(c.slug, i),
  }));

  return (
    <section className="rounded-2xl border border-white/10 bg-gradient-to-b from-primary/[0.08] to-transparent overflow-hidden">
      <header className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-gradient-to-r from-primary/[0.14] to-transparent">
        <h2 className="text-[1.4em] font-extrabold tracking-[0.28em] uppercase text-primary">
          Company Total · {isToday ? "Today" : `Monthly${periodLabel ? ` · ${periodLabel}` : ""}`}
        </h2>
        <span className="text-[0.7em] uppercase tracking-widest text-muted-foreground">
          {casinos.length} casino{casinos.length === 1 ? "" : "s"}
        </span>
      </header>

      <div className="grid grid-cols-2 landscape:grid-cols-4 gap-6 p-6">
        <Kpi label="Total Drop" value={formatMoneyFull(isToday ? today.drop : monthly.drop)} />
        <Kpi
          label="Total Result"
          value={formatSigned(isToday ? today.result : monthly.result)}
          tone="signed"
        />
        <Kpi label="Hold %" value={`${(isToday ? today.hold : monthly.hold).toFixed(1)}%`} />
        {isToday ? (
          <Kpi label="Head Count" value={String(today.headCount)} />
        ) : (
          <Kpi label="Casinos" value={String(casinos.length)} />
        )}
      </div>

      {!isToday && (
        <div className="p-6 border-t border-white/5 flex flex-col gap-5">
          <StackedShareBar title="Monthly Drop · share by casino" segments={dropSegments} />
          <StackedShareBar title="Monthly Result · share by casino" segments={resultSegments} signed />
        </div>
      )}
    </section>
  );
}

