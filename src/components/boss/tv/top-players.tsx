/**
 * Top players lists — shared by every Dashboard TV style.
 * Two shapes: a vertical ranked column and a horizontal strip.
 * Typography follows the shared TV density scale.
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
        className="px-[var(--tv-gap,10px)] py-[calc(var(--tv-gap,10px)*0.45)] border-b shrink-0"
        style={{ borderColor: `${PREMIER.darkGold}33`, background: "rgba(255,255,255,0.04)" }}
      >
        <span
          className="font-extrabold uppercase tracking-[0.24em]"
          style={{ color: PREMIER.softGold, fontSize: "calc(var(--tv-label,12px) * 1.15)" }}
        >
          {title}
        </span>
      </header>
      {rows.length === 0 ? (
        <div className="flex-1 grid place-items-center text-white/40">—</div>
      ) : (
        <ol
          className="flex-1 min-h-0 grid content-start px-[var(--tv-gap,10px)] py-[calc(var(--tv-gap,10px)*0.35)]"
          style={{ gridTemplateRows: `repeat(${limit}, minmax(0,1fr))` }}
        >
          {rows.map((r, i) => (
            <li
              key={`${r.casinoId}:${r.playerId}`}
              className="grid grid-cols-[auto_minmax(0,1fr)_minmax(0,auto)] items-center gap-[var(--tv-gap,10px)] min-w-0 border-b last:border-b-0"
              style={{ borderColor: "rgba(255,255,255,0.05)" }}
            >
              <span
                className="w-[1.7em] h-[1.7em] shrink-0 rounded-[5px] inline-flex items-center justify-center font-extrabold tabular-nums"
                style={{
                  background: `${accentOf(r.casinoId)}26`,
                  color: accentOf(r.casinoId),
                  fontSize: "calc(var(--tv-top-name,18px) * 0.8)",
                }}
              >
                {i + 1}
              </span>
              <span className="flex flex-col min-w-0">
                <span
                  className="truncate font-semibold text-white/95 leading-tight"
                  style={{ fontSize: "var(--tv-top-name, 18px)" }}
                >
                  {r.name}
                </span>
                <span
                  className="truncate uppercase tracking-[0.2em]"
                  style={{ color: accentOf(r.casinoId), fontSize: "calc(var(--tv-label,12px) * 0.9)" }}
                >
                  {nameOf(r.casinoId)}
                </span>
              </span>
              <Num text={fmtMoney(r.drop)} size="sm" />
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
      className="rounded-xl border overflow-hidden min-w-0 h-full"
      style={{ borderColor: `${PREMIER.softGold}33`, background: "rgba(255,255,255,0.03)" }}
    >
      <div className="flex items-stretch min-w-0 h-full">
        <div
          className="shrink-0 px-[var(--tv-gap,10px)] flex items-center border-r"
          style={{ borderColor: `${PREMIER.softGold}22` }}
        >
          <span
            className="font-extrabold uppercase tracking-[0.24em] leading-tight max-w-[8em]"
            style={{ color: PREMIER.softGold, fontSize: "calc(var(--tv-label,12px) * 1.05)" }}
          >
            {title}
          </span>
        </div>
        {rows.length === 0 ? (
          <div className="flex-1 grid place-items-center text-white/40">—</div>
        ) : (
          <ol
            className="flex-1 min-w-0 grid divide-x h-full"
            style={{
              gridTemplateColumns: `repeat(${limit}, minmax(0,1fr))`,
              borderColor: "rgba(255,255,255,0.06)",
            }}
          >
            {rows.map((r, i) => (
              <li
                key={`${r.casinoId}:${r.playerId}`}
                className="min-w-0 overflow-hidden px-[var(--tv-gap,10px)] py-[calc(var(--tv-gap,10px)*0.5)] flex flex-col justify-center gap-[0.2em]"
                style={{ borderColor: "rgba(255,255,255,0.06)" }}
              >
                <span className="inline-flex items-center gap-2 min-w-0">
                  <span
                    className="shrink-0 font-extrabold tabular-nums"
                    style={{ color: accentOf(r.casinoId), fontSize: "calc(var(--tv-top-name,18px) * 0.75)" }}
                  >
                    {i + 1}
                  </span>
                  <span
                    className="truncate font-semibold text-white/95"
                    style={{ fontSize: "var(--tv-top-name, 18px)" }}
                  >
                    {r.name}
                  </span>
                </span>
                <Num text={fmtMoney(r.drop)} size="sm" />
                <span
                  className="truncate uppercase tracking-[0.18em]"
                  style={{ color: accentOf(r.casinoId), fontSize: "calc(var(--tv-label,12px) * 0.85)" }}
                >
                  {nameOf(r.casinoId)}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
