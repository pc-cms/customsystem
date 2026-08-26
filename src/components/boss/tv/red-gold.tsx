/**
 * Style B — Red Gold: performance / ranking screen.
 * Left: dense company performance hero (2×3 KPI grid). Centre: vertical
 * ranking of casinos by Total Result, each rank row showing Tables / Slots /
 * Total with Drop / Result / Hold. Right: one shared Top Players column.
 */
import { PREMIER } from "./tokens";
import {
  MetricsBlock,
  Num,
  fmtMoney,
  fmtSigned,
  fmtPct,
  signColor,
  DASH,
} from "./primitives";
import { TvBrandHeader } from "./tv-header";
import { TopPlayersOverall } from "./top-players";
import type { TvStageProps } from "./types";

function HeroStat({
  label,
  value,
  color,
  size = "lg",
  wide,
}: {
  label: string;
  value: string;
  color?: string;
  size?: "md" | "lg" | "xl";
  wide?: boolean;
}) {
  return (
    <div
      className={`flex flex-col justify-center gap-[0.2em] min-w-0 overflow-hidden rounded-lg px-[calc(var(--tv-gap,10px)*0.9)] py-[calc(var(--tv-gap,10px)*0.6)] ${
        wide ? "col-span-2" : ""
      }`}
      style={{ background: "rgba(255,255,255,0.045)" }}
    >
      <span
        className="uppercase tracking-[0.26em] text-white/60 font-semibold whitespace-nowrap"
        style={{ fontSize: "var(--tv-label, 12px)" }}
      >
        {label}
      </span>
      <Num text={value} color={color} size={size} className="w-full" />
    </div>
  );
}

export function RedGoldStage({ casinos, company, newPlayersCount, period, periodLabel }: TvStageProps) {
  const ranked = [...casinos].sort(
    (a, b) => (b.displayed?.total.result ?? 0) - (a.displayed?.total.result ?? 0),
  );
  const allPlayers = casinos.flatMap((c) => c.top);

  return (
    <div data-tv-style="red-gold" className="h-full min-h-0 flex flex-col gap-[calc(var(--tv-gap,10px)*0.8)]">
      <TvBrandHeader
        period={period}
        periodLabel={periodLabel}
        accent={PREMIER.champagne}
        className="shrink-0 px-[calc(var(--tv-gap,10px)*0.5)]"
      />

      <div className="flex-1 min-h-0 grid gap-[var(--tv-gap,10px)] grid-cols-[minmax(0,0.9fr)_minmax(0,2.4fr)_minmax(0,0.9fr)]">
        {/* Company performance hero — dense 2×3 KPI grid */}
        <section
          data-tv-board="company-hero"
          className="rounded-2xl border grid grid-cols-2 gap-[calc(var(--tv-gap,10px)*0.7)] px-[var(--tv-gap,10px)] py-[var(--tv-gap,10px)] min-h-0 min-w-0 overflow-hidden"
          style={{
            gridTemplateRows: "repeat(3, minmax(0,1fr))",
            borderColor: `${PREMIER.softGold}59`,
            background: `linear-gradient(160deg, ${PREMIER.darkRed}59, rgba(12,4,6,0.92) 70%)`,
          }}
        >
          <HeroStat
            label="Total Result"
            value={fmtSigned(company.result)}
            color={signColor(company.result) ?? PREMIER.champagne}
            size="xl"
            wide
          />
          <HeroStat label="Total Drop" value={fmtMoney(company.drop)} color={PREMIER.champagne} size="lg" wide />
          <HeroStat
            label="Hold"
            value={company.drop > 0 ? fmtPct(company.hold) : DASH}
            color={PREMIER.softGold}
            size="lg"
          />
          <div className="grid grid-rows-2 gap-[calc(var(--tv-gap,10px)*0.5)] min-h-0 min-w-0">
            <HeroStat
              label="Head Count"
              value={period === "today" ? String(company.headCount) : DASH}
              size="md"
            />
            <HeroStat
              label="New Players"
              value={period === "today" ? String(newPlayersCount) : DASH}
              size="md"
            />
          </div>
        </section>

        {/* Ranking */}
        <section
          data-tv-board="ranking"
          className="grid gap-[calc(var(--tv-gap,10px)*0.7)] min-h-0 min-w-0"
          style={{ gridAutoRows: "minmax(0,1fr)" }}
        >
          {ranked.map((c, i) => {
            const d = c.displayed;
            return (
              <article
                key={c.id}
                data-tv-rank={i + 1}
                className="rounded-xl border grid grid-cols-[auto_minmax(0,1fr)] items-stretch gap-[var(--tv-gap,10px)] px-[calc(var(--tv-gap,10px)*1.2)] py-[calc(var(--tv-gap,10px)*0.55)] min-h-0 min-w-0 overflow-hidden"
                style={{
                  borderColor: `${PREMIER.softGold}33`,
                  background: `linear-gradient(100deg, ${PREMIER.darkRed}2E, rgba(10,6,7,0.85) 55%)`,
                }}
              >
                <div className="flex items-center gap-[var(--tv-gap,10px)] min-w-0">
                  <span
                    className="w-[1.8em] h-[1.8em] shrink-0 rounded-md inline-flex items-center justify-center font-extrabold tabular-nums"
                    style={{
                      background: `${PREMIER.softGold}26`,
                      color: PREMIER.softGold,
                      fontSize: "calc(var(--tv-city,26px) * 0.7)",
                    }}
                  >
                    {i + 1}
                  </span>
                  <div className="flex flex-col justify-center min-w-0 max-w-[7em]">
                    <h2
                      className="truncate font-extrabold uppercase tracking-[0.14em] leading-none"
                      style={{ color: c.accent, fontSize: "var(--tv-city, 26px)" }}
                    >
                      {c.name}
                    </h2>
                    <span
                      className="uppercase tracking-[0.2em] text-white/45 whitespace-nowrap mt-[0.3em]"
                      style={{ fontSize: "var(--tv-city-head, 13px)" }}
                    >
                      Head {period === "today" ? d?.total.headCount ?? 0 : DASH}
                    </span>
                  </div>
                </div>

                {d ? (
                  <MetricsBlock
                    displayed={d}
                    accent={PREMIER.softGold}
                    fills={{
                      tables: `${PREMIER.champagne}12`,
                      slots: `${PREMIER.lightRed}1F`,
                      total: `${PREMIER.softGold}24`,
                    }}
                    size="sm"
                    totalSize="md"
                  />
                ) : (
                  <div className="grid place-items-center text-white/35">{DASH}</div>
                )}
              </article>
            );
          })}
        </section>

        {/* Shared Top Players column */}
        <TopPlayersOverall players={allPlayers} casinos={casinos} limit={8} title="Top players" />
      </div>
    </div>
  );
}
