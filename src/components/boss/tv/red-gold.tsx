/**
 * Style B — Red Gold: performance / ranking screen.
 * Left: large company performance hero. Centre: vertical ranking of casinos by
 * Total Result, each rank row still showing Tables / Slots / Total with
 * Drop / Result / Hold. Right: one narrow shared Top Players column.
 */
import { PREMIER } from "./tokens";
import {
  ColHead,
  MetricRow,
  METRIC_GRID,
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
}: {
  label: string;
  value: string;
  color?: string;
  size?: "md" | "lg" | "xl";
}) {
  return (
    <div className="flex flex-col gap-[0.15em] min-w-0 overflow-hidden">
      <span className="text-[clamp(8px,0.44vw,14px)] uppercase tracking-[0.26em] text-white/55 font-semibold whitespace-nowrap">
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
    <div data-tv-style="red-gold" className="h-full min-h-0 flex flex-col gap-[clamp(6px,0.7vh,16px)]">
      <TvBrandHeader
        period={period}
        periodLabel={periodLabel}
        accent={PREMIER.champagne}
        className="shrink-0 px-[clamp(4px,0.4vw,14px)]"
      />

      <div className="flex-1 min-h-0 grid gap-[clamp(6px,0.7vw,20px)] grid-cols-[minmax(0,0.85fr)_minmax(0,2.3fr)_minmax(0,0.85fr)]">
        {/* Company performance hero */}
        <section
          data-tv-board="company-hero"
          className="rounded-2xl border flex flex-col justify-between gap-[clamp(4px,0.6vh,16px)] px-[clamp(10px,0.9vw,28px)] py-[clamp(8px,1vh,24px)] min-h-0 min-w-0 overflow-hidden"
          style={{
            borderColor: `${PREMIER.softGold}59`,
            background: `linear-gradient(160deg, ${PREMIER.darkRed}59, rgba(12,4,6,0.92) 70%)`,
          }}
        >
          <HeroStat
            label="Total Result"
            value={fmtSigned(company.result)}
            color={signColor(company.result) ?? PREMIER.champagne}
            size="xl"
          />
          <HeroStat label="Total Drop" value={fmtMoney(company.drop)} color={PREMIER.champagne} size="lg" />
          <HeroStat
            label="Hold"
            value={company.drop > 0 ? fmtPct(company.hold) : DASH}
            color={PREMIER.softGold}
            size="lg"
          />
          <div className="grid grid-cols-2 gap-[clamp(6px,0.6vw,18px)] min-w-0">
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
          className="grid gap-[clamp(5px,0.55vh,14px)] min-h-0 min-w-0"
          style={{ gridAutoRows: "minmax(0,1fr)" }}
        >
          {ranked.map((c, i) => {
            const d = c.displayed;
            return (
              <article
                key={c.id}
                data-tv-rank={i + 1}
                className="rounded-xl border grid grid-cols-[auto_minmax(0,1fr)] items-center gap-[clamp(6px,0.7vw,20px)] px-[clamp(8px,0.8vw,24px)] py-[clamp(3px,0.45vh,12px)] min-h-0 min-w-0 overflow-hidden"
                style={{
                  borderColor: `${PREMIER.softGold}33`,
                  background: `linear-gradient(100deg, ${PREMIER.darkRed}2E, rgba(10,6,7,0.85) 55%)`,
                }}
              >
                <div className="flex items-center gap-[clamp(6px,0.6vw,16px)] min-w-0">
                  <span
                    className="w-[1.9em] h-[1.9em] shrink-0 rounded-md inline-flex items-center justify-center text-[clamp(12px,0.8vw,26px)] font-extrabold tabular-nums"
                    style={{ background: `${PREMIER.softGold}26`, color: PREMIER.softGold }}
                  >
                    {i + 1}
                  </span>
                  <div className="flex flex-col min-w-0 max-w-[9em]">
                    <h2
                      className="truncate text-[clamp(12px,0.88vw,30px)] font-extrabold uppercase tracking-[0.16em]"
                      style={{ color: c.accent }}
                    >
                      {c.name}
                    </h2>
                    <span className="text-[clamp(8px,0.4vw,12px)] uppercase tracking-[0.2em] text-white/40 whitespace-nowrap">
                      Head {period === "today" ? d?.total.headCount ?? 0 : DASH}
                    </span>
                  </div>
                </div>

                {d ? (
                  <div className={`${METRIC_GRID} gap-y-[clamp(1px,0.2vh,6px)]`}>
                    <span />
                    <ColHead>Drop</ColHead>
                    <ColHead>Result</ColHead>
                    <ColHead>Hold</ColHead>
                    <MetricRow
                      label="Tables"
                      metric={d.tables}
                      size="sm"
                      fill={`${PREMIER.champagne}0F`}
                      marker={PREMIER.champagne}
                    />
                    <MetricRow
                      label="Slots"
                      metric={d.slots}
                      dropAvailable={d.slotsDropAvailable}
                      resultAvailable={d.slotsResultAvailable}
                      size="sm"
                      fill={`${PREMIER.lightRed}1F`}
                      marker={PREMIER.lightRed}
                    />
                    <MetricRow
                      label="Total"
                      metric={d.total}
                      size="md"
                      strong
                      labelColor={PREMIER.softGold}
                      fill={`${PREMIER.softGold}1F`}
                    />
                  </div>
                ) : (
                  <div className="text-center text-white/35">{DASH}</div>
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
