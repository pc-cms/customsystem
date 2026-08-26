/**
 * Style C — Dark Gold.
 * Operational comparison: compact company strip, four-casino matrix on the
 * left, overall Top 8 across all selected casinos on the right.
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
} from "./primitives";
import { TopPlayersOverall } from "./top-players";
import type { TvStageProps } from "./types";

export function DarkGoldStage({ casinos, company, newPlayersCount, period }: TvStageProps) {
  const s = SURFACE["dark-gold"];
  const allPlayers = casinos.flatMap((c) => c.top);

  return (
    <div className="h-full min-h-0 flex flex-col gap-[clamp(6px,0.7vh,18px)]">
      {/* Compact company strip */}
      <section
        className="rounded-xl border grid grid-cols-5 gap-[clamp(8px,1vw,32px)] px-[clamp(10px,1vw,32px)] py-[clamp(4px,0.6vh,14px)] shrink-0"
        style={{ borderColor: s.border, background: s.background, boxShadow: s.shadow }}
      >
        <Kpi label="Total Drop" value={fmtMoney(company.drop)} color={PREMIER.champagne} size="lg" />
        <Kpi
          label="Total Result"
          value={fmtSigned(company.result)}
          color={signColor(company.result) ?? PREMIER.champagne}
          size="lg"
        />
        <Kpi
          label="Hold"
          value={company.drop > 0 ? fmtPct(company.hold) : "—"}
          color={PREMIER.softGold}
          size="lg"
        />
        <Kpi label="Head Count" value={period === "today" ? String(company.headCount) : "—"} size="lg" />
        <Kpi label="New Players" value={period === "today" ? String(newPlayersCount) : "—"} size="lg" />
      </section>

      <div className="flex-1 min-h-0 grid gap-[clamp(6px,0.7vw,20px)] grid-cols-1 xl:grid-cols-[minmax(0,2.1fr)_minmax(0,1fr)]">
        {/* Casino matrix */}
        <section
          className="grid gap-[clamp(6px,0.6vw,16px)] min-h-0"
          style={{ gridAutoRows: "minmax(0,1fr)" }}
        >
          {casinos.map((c) => (
            <article
              key={c.id}
              className="rounded-xl border grid grid-cols-[minmax(0,0.9fr)_minmax(0,3.6fr)] items-center gap-[clamp(6px,0.7vw,20px)] px-[clamp(8px,0.8vw,24px)] py-[clamp(4px,0.6vh,14px)] min-h-0 min-w-0"
              style={{
                borderColor: `${c.accent}40`,
                background: `linear-gradient(100deg, ${c.accent}1A, ${PREMIER.darkGold}12 40%, rgba(12,10,7,0.85))`,
                boxShadow: s.shadow,
              }}
            >
              <div className="flex flex-col gap-1 min-w-0">
                <h2
                  className="text-[clamp(13px,0.95vw,32px)] font-extrabold uppercase tracking-[0.18em] truncate"
                  style={{ color: c.accent }}
                >
                  {c.name}
                </h2>
                <span className="text-[clamp(8px,0.44vw,14px)] uppercase tracking-[0.22em] text-white/45 whitespace-nowrap">
                  Head {period === "today" ? c.displayed?.total.headCount ?? 0 : "—"}
                </span>
              </div>
              {c.displayed ? (
                <div className={`${METRIC_GRID} gap-y-[clamp(1px,0.25vh,7px)] min-w-0`}>
                  <span />
                  <ColHead>Drop</ColHead>
                  <ColHead>Result</ColHead>
                  <ColHead>Hold</ColHead>
                  <MetricRow
                    label="Tables"
                    metric={c.displayed.tables}
                    size="sm"
                    fill={`${PREMIER.softGold}0F`}
                    marker={PREMIER.softGold}
                  />
                  <MetricRow
                    label="Slots"
                    metric={c.displayed.slots}
                    dropAvailable={c.displayed.slotsDropAvailable}
                    resultAvailable={c.displayed.slotsResultAvailable}
                    size="sm"
                    fill={`${PREMIER.darkGold}26`}
                    marker={PREMIER.darkGold}
                  />
                  <MetricRow
                    label="Total"
                    metric={c.displayed.total}
                    size="lg"
                    strong
                    accent={c.accent}
                    labelColor={c.accent}
                    fill={`${c.accent}1F`}
                  />
                </div>
              ) : (
                <div className="text-center text-white/40">—</div>
              )}
            </article>
          ))}
        </section>

        {/* Overall Top 8 */}
        <TopPlayersOverall players={allPlayers} casinos={casinos} limit={8} />
      </div>
    </div>
  );
}
