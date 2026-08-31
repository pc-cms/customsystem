/**
 * Style A — Black Gold: executive comparison board.
 * Narrow brand header with compact company KPIs, ONE large comparison table
 * (each casino = a horizontal group of Tables / Slots / Total rows) and a
 * single horizontal Top Players leaderboard at the bottom.
 * Fills the full TV viewport; rows stretch to consume the available height.
 */
import { PREMIER } from "./tokens";
import {
  Num,
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
import { TopPlayersStrip } from "./top-players";
import type { TvStageProps } from "./types";
import type { CasinoMetric } from "@/hooks/use-boss-dashboard";

const COLS =
  "grid grid-cols-[minmax(0,0.95fr)_minmax(0,0.5fr)_minmax(0,1.25fr)_minmax(0,1.25fr)_minmax(0,0.5fr)] gap-x-[calc(var(--tv-gap,10px)*1.2)] items-center min-w-0";

function Head({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="block min-w-0 overflow-hidden uppercase tracking-[0.2em] text-white/55 font-semibold text-right whitespace-nowrap"
      style={{ fontSize: "var(--tv-label, 12px)" }}
    >
      {children}
    </span>
  );
}

function Line({
  label,
  metric,
  dropAvailable = true,
  resultAvailable = true,
  size,
  fill,
  labelColor,
  strong,
  title,
}: {
  label: string;
  metric: CasinoMetric;
  dropAvailable?: boolean;
  resultAvailable?: boolean;
  size: "sm" | "md" | "lg";
  fill: string;
  labelColor?: string;
  strong?: boolean;
  /** Hover tooltip for the row (e.g. ACE feed freshness). */
  title?: string | null;
}) {

  const result = resultAvailable ? metric.result : null;
  const holdOk = dropAvailable && resultAvailable && metric.drop > 0;
  const cell = "flex items-center justify-end h-full px-[calc(var(--tv-gap,10px)*0.4)] min-w-0";
  return (
    <>
      <span
        title={title ?? undefined}
        className={`flex items-center h-full min-w-0 overflow-hidden truncate uppercase tracking-[0.16em] px-[calc(var(--tv-gap,10px)*0.6)] ${
          strong ? "font-extrabold" : "font-semibold"
        }`}
        style={{
          background: fill,
          color: labelColor ?? "rgba(255,255,255,0.66)",
          fontSize: `calc(var(--tv-label,12px) * ${strong ? 1.18 : 1.05})`,
        }}
      >
        {label}
      </span>


      <span className={cell} style={{ background: fill }}>
        <Num text={dropAvailable ? fmtMoney(metric.drop) : DASH} size={size} color={IVORY} className="w-full" />
      </span>
      <span className={cell} style={{ background: fill }}>
        <Num
          text={fmtSigned(result)}
          color={resultColor(result)}
          glow={resultGlow(result)}
          size={size}
          className="w-full"
        />
      </span>
      <span className={cell} style={{ background: fill }}>
        <Num text={holdOk ? fmtPct(metric.hold) : DASH} size={size} color={IVORY} className="w-full" />
      </span>
    </>
  );
}


export function BlackGoldStage({ casinos, company, newPlayersCount, period, periodLabel }: TvStageProps) {
  const allPlayers = casinos.flatMap((c) => c.top);

  return (
    <div data-tv-style="black-gold" className="h-full min-h-0 flex flex-col gap-[calc(var(--tv-gap,10px)*0.8)]">
      {/* Brand strip + compact company KPIs */}
      <div
        className="rounded-xl border px-[calc(var(--tv-gap,10px)*1.4)] py-[calc(var(--tv-gap,10px)*0.6)] shrink-0"
        style={{ borderColor: `${PREMIER.softGold}33`, background: "rgba(255,255,255,0.035)" }}
      >
        <TvBrandHeader
          period={period}
          periodLabel={periodLabel}
          right={
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
          }

        />
      </div>

      {/* One comparison table for every casino */}
      <section
        data-tv-board="comparison-table"
        className="flex-1 min-h-0 rounded-xl border overflow-hidden flex flex-col"
        style={{ borderColor: `${PREMIER.softGold}2E`, background: "rgba(255,255,255,0.022)" }}
      >
        <div
          className={`${COLS} px-[var(--tv-gap,10px)] py-[calc(var(--tv-gap,10px)*0.35)] border-b shrink-0`}
          style={{ borderColor: `${PREMIER.softGold}26`, background: "rgba(0,0,0,0.35)" }}
        >
          <span
            className="uppercase tracking-[0.26em] text-white/50 font-semibold"
            style={{ fontSize: "var(--tv-label, 12px)" }}
          >
            Casino
          </span>
          <span />
          <Head>Drop</Head>
          <Head>Result</Head>
          <Head>Hold</Head>
        </div>

        <div className="flex-1 min-h-0 grid" style={{ gridAutoRows: "minmax(0,1fr)" }}>
          {casinos.map((c) => {
            const d = c.displayed;
            return (
              <div
                key={c.id}
                data-tv-casino-group={c.id}
                className={`${COLS} items-stretch px-[var(--tv-gap,10px)] py-[calc(var(--tv-gap,10px)*0.3)] gap-y-[calc(var(--tv-gap,10px)*0.25)] border-b last:border-b-0 min-w-0 min-h-0`}
                style={{ borderColor: "rgba(255,255,255,0.07)", gridTemplateRows: "repeat(3, minmax(0,1fr))" }}
              >
                <div
                  className="row-span-3 flex items-center gap-[calc(var(--tv-gap,10px)*0.8)] min-w-0 overflow-hidden pr-[var(--tv-gap,10px)] border-l-2 pl-[calc(var(--tv-gap,10px)*0.7)]"
                  style={{ borderColor: `${c.accent}59` }}
                >
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
                      Head {period === "today" ? d?.total.headCount ?? 0 : DASH}
                    </span>
                  </div>
                </div>


                {d ? (
                  <>
                    <Line label="Tables" metric={d.tables} size="sm" fill="rgba(255,255,255,0.045)" />
                    <Line
                      label="Slots"
                      metric={d.slots}
                      dropAvailable={d.slotsDropAvailable}
                      resultAvailable={d.slotsResultAvailable}
                      size="sm"
                      fill="rgba(255,255,255,0.02)"
                      badge={d.usesAce ? "LIVE" : null}
                      badgeTitle={d.aceHint}
                    />

                    <Line
                      label="Total"
                      metric={d.total}
                      size="md"
                      strong
                      labelColor={PREMIER.softGold}
                      fill={`${PREMIER.softGold}1F`}
                    />
                  </>
                ) : (
                  <span className="col-span-4 row-span-3 grid place-items-center text-white/35">{DASH}</span>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Single leaderboard — reserved band, always fully visible */}
      <div
        className="shrink-0"
        style={{ height: "calc(var(--tv-u, 1px) * 140)", minHeight: "110px" }}
      >
        <TopPlayersStrip players={allPlayers} casinos={casinos} limit={8} />
      </div>
    </div>
  );
}
