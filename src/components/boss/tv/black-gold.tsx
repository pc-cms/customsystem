/**
 * Style A — Black Gold: executive comparison board.
 * Narrow brand header with compact company KPIs, ONE large comparison table
 * (each casino = a horizontal group of Tables / Slots / Total rows) and a
 * single horizontal Top Players leaderboard at the bottom.
 * No 2×2 cards, no per-casino top lists.
 */
import { PREMIER } from "./tokens";
import {
  Num,
  Kpi,
  fmtMoney,
  fmtSigned,
  fmtPct,
  signColor,
  DASH,
} from "./primitives";
import { TvBrandHeader } from "./tv-header";
import { TopPlayersStrip } from "./top-players";
import type { TvStageProps } from "./types";
import type { CasinoMetric } from "@/hooks/use-boss-dashboard";

const COLS =
  "grid grid-cols-[minmax(0,1.15fr)_minmax(0,0.6fr)_minmax(0,1.25fr)_minmax(0,1.25fr)_minmax(0,0.55fr)] gap-x-[clamp(6px,0.7vw,22px)] items-center min-w-0";

function Head({ children }: { children: React.ReactNode }) {
  return (
    <span className="block min-w-0 overflow-hidden text-[clamp(8px,0.46vw,14px)] uppercase tracking-[0.24em] text-white/45 font-semibold text-right whitespace-nowrap">
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
}: {
  label: string;
  metric: CasinoMetric;
  dropAvailable?: boolean;
  resultAvailable?: boolean;
  size: "sm" | "md" | "lg";
  fill: string;
  labelColor?: string;
  strong?: boolean;
}) {
  const result = resultAvailable ? metric.result : null;
  const holdOk = dropAvailable && resultAvailable && metric.drop > 0;
  return (
    <>
      <span
        className={`min-w-0 overflow-hidden truncate text-[clamp(9px,0.56vw,17px)] uppercase tracking-[0.18em] px-[clamp(4px,0.4vw,12px)] py-[clamp(2px,0.34vh,9px)] ${
          strong ? "font-extrabold" : "font-semibold"
        }`}
        style={{ background: fill, color: labelColor ?? "rgba(255,255,255,0.6)" }}
      >
        {label}
      </span>
      <span className="px-[clamp(2px,0.2vw,6px)] py-[clamp(2px,0.34vh,9px)] min-w-0" style={{ background: fill }}>
        <Num text={dropAvailable ? fmtMoney(metric.drop) : DASH} size={size} />
      </span>
      <span className="px-[clamp(2px,0.2vw,6px)] py-[clamp(2px,0.34vh,9px)] min-w-0" style={{ background: fill }}>
        <Num text={fmtSigned(result)} color={signColor(result)} size={size} />
      </span>
      <span className="px-[clamp(2px,0.2vw,6px)] py-[clamp(2px,0.34vh,9px)] min-w-0" style={{ background: fill }}>
        <Num text={holdOk ? fmtPct(metric.hold) : DASH} size={size} />
      </span>
    </>
  );
}

export function BlackGoldStage({ casinos, company, newPlayersCount, period, periodLabel }: TvStageProps) {
  const allPlayers = casinos.flatMap((c) => c.top);

  return (
    <div data-tv-style="black-gold" className="h-full min-h-0 flex flex-col gap-[clamp(6px,0.7vh,16px)]">
      {/* Brand strip + compact company KPIs */}
      <div
        className="rounded-xl border px-[clamp(10px,1vw,30px)] py-[clamp(5px,0.7vh,16px)] shrink-0"
        style={{ borderColor: `${PREMIER.softGold}33`, background: "rgba(255,255,255,0.035)" }}
      >
        <TvBrandHeader
          period={period}
          periodLabel={periodLabel}
          right={
            <div className="grid grid-cols-5 gap-[clamp(6px,0.8vw,26px)] min-w-0">
              <Kpi label="Total Drop" value={fmtMoney(company.drop)} color={PREMIER.champagne} size="md" align="right" />
              <Kpi
                label="Total Result"
                value={fmtSigned(company.result)}
                color={signColor(company.result) ?? PREMIER.champagne}
                size="md"
                align="right"
              />
              <Kpi
                label="Hold"
                value={company.drop > 0 ? fmtPct(company.hold) : DASH}
                color={PREMIER.softGold}
                size="md"
                align="right"
              />
              <Kpi
                label="Head Count"
                value={period === "today" ? String(company.headCount) : DASH}
                size="md"
                align="right"
              />
              <Kpi
                label="New Players"
                value={period === "today" ? String(newPlayersCount) : DASH}
                size="md"
                align="right"
              />
            </div>
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
          className={`${COLS} px-[clamp(8px,0.8vw,24px)] py-[clamp(3px,0.42vh,10px)] border-b shrink-0`}
          style={{ borderColor: `${PREMIER.softGold}26`, background: "rgba(0,0,0,0.35)" }}
        >
          <span className="text-[clamp(8px,0.46vw,14px)] uppercase tracking-[0.26em] text-white/45 font-semibold">
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
                className={`${COLS} items-stretch px-[clamp(8px,0.8vw,24px)] py-[clamp(2px,0.4vh,10px)] border-b last:border-b-0 min-w-0`}
                style={{ borderColor: "rgba(255,255,255,0.07)", gridTemplateRows: "repeat(3, minmax(0,1fr))" }}
              >
                <div className="row-span-3 flex flex-col justify-center gap-[0.25em] min-w-0 overflow-hidden pr-[clamp(6px,0.6vw,18px)]">
                  <h2
                    className="truncate text-[clamp(13px,1vw,34px)] font-extrabold uppercase tracking-[0.18em]"
                    style={{ color: c.accent }}
                  >
                    {c.name}
                  </h2>
                  <span className="text-[clamp(8px,0.42vw,13px)] uppercase tracking-[0.2em] text-white/40 whitespace-nowrap">
                    Head {period === "today" ? d?.total.headCount ?? 0 : DASH}
                  </span>
                </div>

                {d ? (
                  <>
                    <Line label="Tables" metric={d.tables} size="sm" fill="rgba(255,255,255,0.04)" />
                    <Line
                      label="Slots"
                      metric={d.slots}
                      dropAvailable={d.slotsDropAvailable}
                      resultAvailable={d.slotsResultAvailable}
                      size="sm"
                      fill="rgba(255,255,255,0.015)"
                    />
                    <Line
                      label="Total"
                      metric={d.total}
                      size="md"
                      strong
                      labelColor={PREMIER.softGold}
                      fill={`${PREMIER.softGold}1A`}
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

      {/* Single leaderboard */}
      <div className="shrink-0">
        <TopPlayersStrip players={allPlayers} casinos={casinos} limit={8} />
      </div>
    </div>
  );
}
