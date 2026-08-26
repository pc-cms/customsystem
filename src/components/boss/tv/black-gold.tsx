/**
 * Style A — Black Gold.
 * Top company strip · 2×2 casino cards · bottom Top-5 per casino.
 * Fits one 1920×1080 / 3840×2160 screen with no scrolling.
 */
import { PREMIER, SURFACE } from "./tokens";
import { Kpi, MetricsBlock, fmtMoney, fmtSigned, fmtPct, signColor } from "./primitives";
import { TopPlayersCard } from "./top-players";
import type { TvStageProps } from "./types";

export function BlackGoldStage({ casinos, company, newPlayersCount, period }: TvStageProps) {
  const s = SURFACE["black-gold"];
  const cols = casinos.length > 1 ? 2 : 1;

  return (
    <div className="h-full min-h-0 flex flex-col gap-[clamp(6px,0.7vh,18px)]">
      {/* Company strip */}
      <section
        className="rounded-xl border grid grid-cols-5 gap-[clamp(8px,1vw,32px)] px-[clamp(10px,1vw,32px)] py-[clamp(6px,0.9vh,20px)] shrink-0"
        style={{ borderColor: s.border, background: s.background, boxShadow: s.shadow }}
      >
        <Kpi label="Total Drop" value={fmtMoney(company.drop)} accent={PREMIER.softGold} size="xl" />
        <Kpi
          label="Total Result"
          value={fmtSigned(company.result)}
          color={signColor(company.result)}
          size="xl"
        />
        <Kpi label="Hold" value={company.drop > 0 ? fmtPct(company.hold) : "—"} size="xl" />
        <Kpi label="Head Count" value={period === "today" ? String(company.headCount) : "—"} size="xl" />
        <Kpi label="New Players" value={period === "today" ? String(newPlayersCount) : "—"} size="xl" />
      </section>

      {/* 2×2 casino cards */}
      <section
        className="grid gap-[clamp(6px,0.7vw,20px)] flex-1 min-h-0"
        style={{
          gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))`,
          gridAutoRows: "minmax(0,1fr)",
        }}
      >
        {casinos.map((c) => (
          <article
            key={c.id}
            className="rounded-xl border flex flex-col min-h-0 min-w-0 overflow-hidden"
            style={{
              borderColor: `${c.accent}4D`,
              background: s.background,
              boxShadow: `inset 0 1px 0 0 ${c.accent}22, 0 0 60px -40px ${c.accent}`,
            }}
          >
            <header
              className="flex items-center justify-between gap-3 px-[clamp(8px,0.8vw,24px)] py-[clamp(3px,0.5vh,12px)]"
              style={{ background: `linear-gradient(90deg, ${c.accent}24, transparent 65%)` }}
            >
              <span className="inline-flex items-center gap-2 min-w-0">
                <span
                  className="w-[0.6em] h-[0.6em] rounded-full shrink-0"
                  style={{ background: c.accent, boxShadow: `0 0 18px ${c.accent}` }}
                />
                <h2
                  className="text-[clamp(13px,0.9vw,30px)] font-extrabold uppercase tracking-[0.2em] truncate"
                  style={{ color: c.accent }}
                >
                  {c.name}
                </h2>
              </span>
              <span className="inline-flex items-baseline gap-2 whitespace-nowrap">
                <span className="text-[clamp(8px,0.44vw,14px)] uppercase tracking-[0.22em] text-white/45">
                  Head
                </span>
                <span className="font-mono tabular-nums font-bold text-[clamp(13px,0.85vw,28px)] text-white/90">
                  {period === "today" ? c.displayed?.total.headCount ?? 0 : "—"}
                </span>
              </span>
            </header>
            <div className="flex-1 min-h-0 flex flex-col justify-center px-[clamp(8px,0.9vw,28px)] py-[clamp(4px,0.6vh,16px)]">
              {c.displayed ? (
                <MetricsBlock displayed={c.displayed} accent={c.accent} size="md" totalSize="xl" />
              ) : (
                <div className="text-center text-white/40">—</div>
              )}
            </div>
          </article>
        ))}
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
