/**
 * Style B — Red Gold.
 * Premium executive identity: deep-red gradient hero with all five company
 * metrics, four ranked casino cards (total result emphasised), Top-5 strip.
 */
import { PREMIER, SURFACE } from "./tokens";
import {
  ColHead,
  MetricRow,
  METRIC_GRID,
  Kpi,
  Num,
  fmtMoney,
  fmtSigned,
  fmtPct,
  signColor,
} from "./primitives";
import { TopPlayersCard } from "./top-players";
import type { TvStageProps } from "./types";

export function RedGoldStage({ casinos, company, newPlayersCount, period }: TvStageProps) {
  const s = SURFACE["red-gold"];
  const ranked = [...casinos].sort(
    (a, b) => (b.displayed?.total.result ?? 0) - (a.displayed?.total.result ?? 0),
  );
  const cols = casinos.length > 1 ? 2 : 1;

  return (
    <div className="h-full min-h-0 flex flex-col gap-[clamp(6px,0.7vh,18px)]">
      {/* Executive hero */}
      <section
        className="rounded-2xl border grid grid-cols-5 items-center gap-[clamp(8px,1vw,32px)] px-[clamp(12px,1.2vw,40px)] py-[clamp(8px,1.2vh,26px)] shrink-0"
        style={{
          borderColor: PREMIER.softGold,
          background: `linear-gradient(120deg, ${PREMIER.darkRed} 0%, ${PREMIER.lightRed}80 38%, rgba(10,10,10,0.92) 100%)`,
          boxShadow: `inset 0 1px 0 0 ${PREMIER.champagne}44, 0 24px 70px -40px ${PREMIER.lightRed}`,
        }}
      >
        <Kpi label="Total Drop" value={fmtMoney(company.drop)} color={PREMIER.champagne} size="xl" />
        <Kpi
          label="Total Result"
          value={fmtSigned(company.result)}
          color={signColor(company.result) ?? PREMIER.champagne}
          accent={PREMIER.softGold}
          size="xl"
        />
        <Kpi
          label="Hold"
          value={company.drop > 0 ? fmtPct(company.hold) : "—"}
          color={PREMIER.softGold}
          size="xl"
        />
        <Kpi
          label="Head Count"
          value={period === "today" ? String(company.headCount) : "—"}
          color={PREMIER.champagne}
          size="xl"
        />
        <Kpi
          label="New Players"
          value={period === "today" ? String(newPlayersCount) : "—"}
          color={PREMIER.champagne}
          size="xl"
        />
      </section>

      {/* Ranked casino cards */}
      <section
        className="grid gap-[clamp(6px,0.7vw,20px)] flex-1 min-h-0"
        style={{
          gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))`,
          gridAutoRows: "minmax(0,1fr)",
        }}
      >
        {ranked.map((c, rank) => {
          const d = c.displayed;
          return (
            <article
              key={c.id}
              className="rounded-2xl border flex flex-col min-h-0 min-w-0 overflow-hidden"
              style={{
                borderColor: `${PREMIER.softGold}59`,
                background: s.background,
                boxShadow: s.shadow,
              }}
            >
              <header className="flex items-center justify-between gap-3 px-[clamp(8px,0.9vw,26px)] py-[clamp(3px,0.5vh,12px)]">
                <span className="inline-flex items-center gap-2 min-w-0">
                  <span
                    className="w-[1.5em] h-[1.5em] rounded-[5px] inline-flex items-center justify-center text-[clamp(10px,0.56vw,17px)] font-extrabold shrink-0"
                    style={{ background: `${PREMIER.softGold}26`, color: PREMIER.softGold }}
                  >
                    {rank + 1}
                  </span>
                  <h2
                    className="text-[clamp(13px,0.9vw,30px)] font-extrabold uppercase tracking-[0.2em] truncate"
                    style={{ color: c.accent }}
                  >
                    {c.name}
                  </h2>
                </span>
                <span className="inline-flex items-baseline gap-3 whitespace-nowrap">
                  <span className="text-[clamp(8px,0.44vw,14px)] uppercase tracking-[0.22em] text-white/50">
                    Result
                  </span>
                  <Num
                    text={fmtSigned(d?.total.result)}
                    color={signColor(d?.total.result)}
                    size="lg"
                    glow={PREMIER.softGold}
                  />
                </span>
              </header>

              <div className="flex-1 min-h-0 flex flex-col justify-center px-[clamp(8px,0.9vw,26px)] pb-[clamp(4px,0.6vh,16px)]">
                {d ? (
                  <div className={`${METRIC_GRID} gap-y-[clamp(2px,0.35vh,10px)]`}>
                    <span />
                    <ColHead>Drop</ColHead>
                    <ColHead>Result</ColHead>
                    <ColHead>Hold</ColHead>
                    <MetricRow
                      label="Tables"
                      metric={d.tables}
                      size="md"
                      fill={`${PREMIER.champagne}0F`}
                      marker={PREMIER.champagne}
                    />
                    <MetricRow
                      label="Slots"
                      metric={d.slots}
                      dropAvailable={d.slotsDropAvailable}
                      resultAvailable={d.slotsResultAvailable}
                      size="md"
                      fill={`${PREMIER.darkRed}2E`}
                      marker={PREMIER.lightRed}
                    />
                    <MetricRow
                      label="Total"
                      metric={d.total}
                      size="lg"
                      strong
                      accent={PREMIER.softGold}
                      labelColor={PREMIER.softGold}
                      fill={`${PREMIER.softGold}1A`}
                    />
                  </div>
                ) : (
                  <div className="text-center text-white/40">—</div>
                )}
              </div>
            </article>
          );
        })}
      </section>

      {/* Top 5 per casino */}
      <section
        className="grid gap-[clamp(6px,0.7vw,20px)] shrink-0"
        style={{ gridTemplateColumns: `repeat(${Math.max(1, casinos.length)}, minmax(0,1fr))` }}
      >
        {casinos.map((c) => (
          <TopPlayersCard key={c.id} casino={c} limit={5} />
        ))}
      </section>
    </div>
  );
}
