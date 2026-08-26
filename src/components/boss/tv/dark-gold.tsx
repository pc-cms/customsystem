/**
 * Style C — Dark Gold (owner's preferred base, refined).
 * Compact company summary on top, casino matrix rows on the left, shared
 * Top 8 players column on the right. Strict Label | Drop | Result | Hold
 * columns and contrasting fills for Tables / Slots / Total.
 */
import { PREMIER, SURFACE } from "./tokens";
import {
  ColHead,
  MetricRow,
  METRIC_GRID,
  Kpi,
  fmtMoney,
  fmtSigned,
  fmtPct,
  signColor,
  DASH,
} from "./primitives";
import { TvBrandHeader } from "./tv-header";
import { TopPlayersOverall } from "./top-players";
import type { TvStageProps } from "./types";

export function DarkGoldStage({ casinos, company, newPlayersCount, period, periodLabel }: TvStageProps) {
  const s = SURFACE["dark-gold"];
  const allPlayers = casinos.flatMap((c) => c.top);

  return (
    <div data-tv-style="dark-gold" className="h-full min-h-0 flex flex-col gap-[clamp(6px,0.7vh,16px)]">
      <TvBrandHeader period={period} periodLabel={periodLabel} className="shrink-0 px-[clamp(4px,0.4vw,14px)]" />

      {/* Compact company summary */}
      <section
        data-tv-board="company-summary"
        className="rounded-xl border grid grid-cols-5 gap-[clamp(8px,0.9vw,28px)] px-[clamp(10px,1vw,30px)] py-[clamp(4px,0.55vh,13px)] shrink-0"
        style={{ borderColor: s.border, background: "rgba(255,255,255,0.035)" }}
      >
        <Kpi label="Total Drop" value={fmtMoney(company.drop)} color={PREMIER.champagne} size="md" />
        <Kpi
          label="Total Result"
          value={fmtSigned(company.result)}
          color={signColor(company.result) ?? PREMIER.champagne}
          size="md"
        />
        <Kpi
          label="Hold"
          value={company.drop > 0 ? fmtPct(company.hold) : DASH}
          color={PREMIER.softGold}
          size="md"
        />
        <Kpi label="Head Count" value={period === "today" ? String(company.headCount) : DASH} size="md" />
        <Kpi label="New Players" value={period === "today" ? String(newPlayersCount) : DASH} size="md" />
      </section>

      <div className="flex-1 min-h-0 grid gap-[clamp(6px,0.7vw,20px)] grid-cols-1 xl:grid-cols-[minmax(0,2.4fr)_minmax(0,1fr)]">
        {/* Casino matrix */}
        <section
          data-tv-board="casino-matrix"
          className="grid gap-[clamp(5px,0.55vw,14px)] min-h-0 min-w-0"
          style={{ gridAutoRows: "minmax(0,1fr)" }}
        >
          {casinos.map((c) => (
            <article
              key={c.id}
              className="rounded-xl border grid grid-cols-[minmax(0,0.8fr)_minmax(0,3.8fr)] items-center gap-[clamp(6px,0.7vw,20px)] px-[clamp(8px,0.8vw,24px)] py-[clamp(3px,0.5vh,13px)] min-h-0 min-w-0 overflow-hidden"
              style={{
                borderColor: `${c.accent}3D`,
                background: "rgba(255,255,255,0.03)",
              }}
            >
              <div className="flex flex-col gap-[0.2em] min-w-0 overflow-hidden">
                <h2
                  className="truncate text-[clamp(13px,0.95vw,32px)] font-extrabold uppercase tracking-[0.18em]"
                  style={{ color: c.accent }}
                >
                  {c.name}
                </h2>
                <span className="text-[clamp(8px,0.42vw,13px)] uppercase tracking-[0.2em] text-white/40 whitespace-nowrap">
                  Head {period === "today" ? c.displayed?.total.headCount ?? 0 : DASH}
                </span>
              </div>
              {c.displayed ? (
                <div className={`${METRIC_GRID} gap-y-[clamp(1px,0.22vh,6px)]`}>
                  <span />
                  <ColHead>Drop</ColHead>
                  <ColHead>Result</ColHead>
                  <ColHead>Hold</ColHead>
                  <MetricRow
                    label="Tables"
                    metric={c.displayed.tables}
                    size="sm"
                    fill="rgba(255,255,255,0.05)"
                    marker={PREMIER.softGold}
                  />
                  <MetricRow
                    label="Slots"
                    metric={c.displayed.slots}
                    dropAvailable={c.displayed.slotsDropAvailable}
                    resultAvailable={c.displayed.slotsResultAvailable}
                    size="sm"
                    fill="rgba(255,255,255,0.015)"
                    marker={PREMIER.darkGold}
                  />
                  <MetricRow
                    label="Total"
                    metric={c.displayed.total}
                    size="md"
                    strong
                    labelColor={c.accent}
                    fill={`${c.accent}1F`}
                  />
                </div>
              ) : (
                <div className="text-center text-white/35">{DASH}</div>
              )}
            </article>
          ))}
        </section>

        <TopPlayersOverall players={allPlayers} casinos={casinos} limit={8} />
      </div>
    </div>
  );
}
