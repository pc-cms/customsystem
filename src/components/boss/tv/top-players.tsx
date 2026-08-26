/**
 * Top players lists — shared by every Dashboard TV style.
 * Two shapes: a vertical ranked column and a horizontal strip.
 */
import { Num, fmtMoney } from "./primitives";
import type { TvCasino, TvTopPlayer } from "./types";
import { PREMIER } from "./tokens";

const rank = (players: TvTopPlayer[], limit: number) =>
  [...players].sort((a, b) => b.drop - a.drop).slice(0, limit);

/** Cross-casino ranked column (Dark Gold / Red Gold right column). */
export function TopPlayersOverall({
  players,
  casinos,
  limit = 8,
  title = "Top players · all casinos",
}: {
  players: TvTopPlayer[];
  casinos: TvCasino[];
  limit?: number;
  title?: string;
}) {
  const accentOf = (id: string) => casinos.find((c) => c.id === id)?.accent ?? PREMIER.softGold;
  const nameOf = (id: string) => casinos.find((c) => c.id === id)?.name ?? "";
  const rows = rank(players, limit);
  return (
    <div
      data-tv-top="column"
      className="rounded-xl border overflow-hidden flex flex-col min-h-0 min-w-0"
      style={{ borderColor: `${PREMIER.darkGold}59`, background: "rgba(255,255,255,0.035)" }}
    >
      <header
        className="px-[clamp(8px,0.7vw,18px)] py-[clamp(3px,0.45vh,10px)] border-b shrink-0"
        style={{ borderColor: `${PREMIER.darkGold}33`, background: "rgba(255,255,255,0.04)" }}
      >
        <span
          className="text-[clamp(9px,0.55vw,17px)] font-extrabold uppercase tracking-[0.24em]"
          style={{ color: PREMIER.softGold }}
        >
          {title}
        </span>
      </header>
      {rows.length === 0 ? (
        <div className="flex-1 grid place-items-center text-white/40 text-[clamp(11px,0.6vw,18px)]">—</div>
      ) : (
        <ol className="flex-1 min-h-0 flex flex-col justify-around px-[clamp(6px,0.55vw,16px)] py-[clamp(2px,0.35vh,10px)]">
          {rows.map((r, i) => (
            <li
              key={`${r.casinoId}:${r.playerId}`}
              className="grid grid-cols-[auto_minmax(0,1fr)_minmax(0,auto)] items-center gap-[clamp(6px,0.6vw,18px)] min-w-0 py-[clamp(1px,0.25vh,7px)]"
            >
              <span
                className="w-[1.7em] h-[1.7em] shrink-0 rounded-[5px] inline-flex items-center justify-center text-[clamp(10px,0.58vw,18px)] font-extrabold tabular-nums"
                style={{ background: `${accentOf(r.casinoId)}26`, color: accentOf(r.casinoId) }}
              >
                {i + 1}
              </span>
              <span className="flex flex-col min-w-0">
                <span className="truncate text-[clamp(12px,0.8vw,25px)] font-semibold text-white/95 leading-tight">
                  {r.name}
                </span>
                <span
                  className="truncate text-[clamp(8px,0.42vw,13px)] uppercase tracking-[0.2em]"
                  style={{ color: accentOf(r.casinoId) }}
                >
                  {nameOf(r.casinoId)}
                </span>
              </span>
              <Num text={fmtMoney(r.drop)} size="md" />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** Cross-casino horizontal leaderboard strip (Black Gold bottom band). */
export function TopPlayersStrip({
  players,
  casinos,
  limit = 8,
  title = "Top players · all casinos",
}: {
  players: TvTopPlayer[];
  casinos: TvCasino[];
  limit?: number;
  title?: string;
}) {
  const accentOf = (id: string) => casinos.find((c) => c.id === id)?.accent ?? PREMIER.softGold;
  const nameOf = (id: string) => casinos.find((c) => c.id === id)?.name ?? "";
  const rows = rank(players, limit);
  return (
    <section
      data-tv-top="strip"
      className="rounded-xl border overflow-hidden min-w-0"
      style={{ borderColor: `${PREMIER.softGold}33`, background: "rgba(255,255,255,0.03)" }}
    >
      <div className="flex items-stretch min-w-0">
        <div
          className="shrink-0 px-[clamp(8px,0.8vw,22px)] flex items-center border-r"
          style={{ borderColor: `${PREMIER.softGold}22` }}
        >
          <span
            className="text-[clamp(8px,0.48vw,15px)] font-extrabold uppercase tracking-[0.24em] leading-tight max-w-[8em]"
            style={{ color: PREMIER.softGold }}
          >
            {title}
          </span>
        </div>
        {rows.length === 0 ? (
          <div className="flex-1 py-[clamp(4px,0.7vh,14px)] text-center text-white/40">—</div>
        ) : (
          <ol
            className="flex-1 min-w-0 grid divide-x"
            style={{
              gridTemplateColumns: `repeat(${rows.length}, minmax(0,1fr))`,
              borderColor: "rgba(255,255,255,0.06)",
            }}
          >
            {rows.map((r, i) => (
              <li
                key={`${r.casinoId}:${r.playerId}`}
                className="min-w-0 overflow-hidden px-[clamp(6px,0.6vw,16px)] py-[clamp(3px,0.5vh,12px)] flex flex-col gap-[0.15em]"
                style={{ borderColor: "rgba(255,255,255,0.06)" }}
              >
                <span className="inline-flex items-center gap-2 min-w-0">
                  <span
                    className="shrink-0 text-[clamp(9px,0.5vw,15px)] font-extrabold tabular-nums"
                    style={{ color: accentOf(r.casinoId) }}
                  >
                    {i + 1}
                  </span>
                  <span className="truncate text-[clamp(11px,0.72vw,22px)] font-semibold text-white/95">
                    {r.name}
                  </span>
                </span>
                <span className="flex items-baseline justify-between gap-2 min-w-0">
                  <span
                    className="truncate text-[clamp(8px,0.4vw,12px)] uppercase tracking-[0.18em]"
                    style={{ color: accentOf(r.casinoId) }}
                  >
                    {nameOf(r.casinoId)}
                  </span>
                  <Num text={fmtMoney(r.drop)} size="sm" />
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
