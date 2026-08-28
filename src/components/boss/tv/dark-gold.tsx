/**
 * Style C — Dark Gold (owner's preferred base, refined).
 * Compact company summary on top, casino matrix rows on the left, shared
 * Top 8 players column on the right. Strict Label | Drop | Result | Hold
 * columns; the three metric rows stretch over the full card height.
 */
import { SURFACE } from "./tokens";
import {
  MetricsBlock,
  Kpi,
  KpiRow,
  IVORY,
  fmtMoney,
  fmtSigned,
  fmtPct,
  resultColor,
  resultGlow,
  DASH,
} from "./primitives";
import { CityMark } from "./city-marks";
import { TvBrandHeader } from "./tv-header";
import { TopPlayersOverall } from "./top-players";
import type { TvStageProps } from "./types";

export function DarkGoldStage({ casinos, company, newPlayersCount, period, periodLabel }: TvStageProps) {
  const s = SURFACE["dark-gold"];
  const allPlayers = casinos.flatMap((c) => c.top);

  return (
    <div data-tv-style="dark-gold" className="h-full min-h-0 flex flex-col gap-[calc(var(--tv-gap,10px)*0.8)]">
      <TvBrandHeader period={period} periodLabel={periodLabel} className="shrink-0 px-[calc(var(--tv-gap,10px)*0.5)]" />

      {/* Compact company summary */}
      <section
        data-tv-board="company-summary"
        className="rounded-xl border px-[calc(var(--tv-gap,10px)*1.2)] py-[calc(var(--tv-gap,10px)*0.6)] shrink-0"
        style={{ borderColor: s.border, background: "rgba(255,255,255,0.035)" }}
      >
        <KpiRow>
          <Kpi label="Total Drop" value={fmtMoney(company.drop)} color={IVORY} size="lg" align="center" />
          <Kpi
            label="Total Result"
            value={fmtSigned(company.result)}
            color={resultColor(company.result)}
            accent={resultGlow(company.result)}
            size="lg"
            align="center"
          />
          <Kpi
            label="Hold"
            value={company.drop > 0 ? fmtPct(company.hold) : DASH}
            color={IVORY}
            size="lg"
            align="center"
          />
          <Kpi
            label="Head Count"
            value={period === "today" ? String(company.headCount) : DASH}
            color={IVORY}
            size="lg"
            align="center"
          />
          <Kpi
            label="New Players"
            value={period === "today" ? String(newPlayersCount) : DASH}
            color={IVORY}
            size="lg"
            align="center"
          />
        </KpiRow>
      </section>


      <div className="flex-1 min-h-0 grid gap-[var(--tv-gap,10px)] grid-cols-1 xl:grid-cols-[minmax(0,2.5fr)_minmax(0,1fr)]">
        {/* Casino matrix */}
        <section
          data-tv-board="casino-matrix"
          className="grid gap-[calc(var(--tv-gap,10px)*0.7)] min-h-0 min-w-0"
          style={{ gridAutoRows: "minmax(0,1fr)" }}
        >
          {casinos.map((c) => (
            <article
              key={c.id}
              className="rounded-xl border grid grid-cols-[minmax(0,0.62fr)_minmax(0,4fr)] items-stretch gap-[var(--tv-gap,10px)] px-[calc(var(--tv-gap,10px)*1.2)] py-[calc(var(--tv-gap,10px)*0.55)] min-h-0 min-w-0 overflow-hidden"
              style={{
                borderColor: `${c.accent}3D`,
                background: "rgba(255,255,255,0.03)",
              }}
            >
              <div className="flex items-center gap-[calc(var(--tv-gap,10px)*0.8)] min-w-0 overflow-hidden">
                <CityMark slug={c.slug} accent={c.accent} />
                <div className="flex flex-col justify-center gap-[0.25em] min-w-0 overflow-hidden">
                  <h2
                    className="truncate font-extrabold uppercase tracking-[0.16em] leading-none"
                    style={{ color: c.accent, fontSize: "var(--tv-city, 26px)" }}
                  >
                    {c.name}
                  </h2>
                  <span
                    className="uppercase tracking-[0.2em] text-white/45 whitespace-nowrap"
                    style={{ fontSize: "var(--tv-city-head, 13px)" }}
                  >
                    Head {period === "today" ? c.displayed?.total.headCount ?? 0 : DASH}
                  </span>
                </div>
              </div>
              {c.displayed ? (
                <MetricsBlock displayed={c.displayed} accent={c.accent} size="sm" totalSize="md" />
              ) : (

                <div className="grid place-items-center text-white/35">{DASH}</div>
              )}
            </article>
          ))}
        </section>

        <TopPlayersOverall players={allPlayers} casinos={casinos} limit={8} />
      </div>
    </div>
  );
}
