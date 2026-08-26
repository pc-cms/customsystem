/**
 * Top players lists — shared by every Dashboard TV style.
 */
import { Num, fmtMoney } from "./primitives";
import type { TvCasino, TvTopPlayer } from "./types";
import { PREMIER } from "./tokens";

export function TopPlayersCard({
  casino,
  limit = 5,
  dense,
}: {
  casino: TvCasino;
  limit?: number;
  dense?: boolean;
}) {
  const rows = casino.top.slice(0, limit);
  return (
    <div
      className="rounded-xl border overflow-hidden min-w-0 flex flex-col"
      style={{ borderColor: `${casino.accent}33`, background: "rgba(255,255,255,0.028)" }}
    >
      <header
        className="px-[clamp(6px,0.6vw,16px)] py-[clamp(2px,0.35vh,8px)] border-b"
        style={{
          borderColor: `${casino.accent}22`,
          background: `linear-gradient(90deg, ${casino.accent}22, transparent)`,
        }}
      >
        <span
          className="text-[clamp(9px,0.55vw,17px)] font-extrabold uppercase tracking-[0.22em] whitespace-nowrap"
          style={{ color: casino.accent }}
        >
          {casino.name}
        </span>
      </header>
      {rows.length === 0 ? (
        <div className="px-3 py-[clamp(4px,0.8vh,14px)] text-center text-white/40 text-[clamp(10px,0.6vw,18px)]">
          —
        </div>
      ) : (
        <ol className="flex-1 divide-y" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
          {rows.map((r, i) => (
            <li
              key={r.playerId}
              className={`flex items-center justify-between gap-3 px-[clamp(6px,0.6vw,16px)] ${
                dense ? "py-[clamp(1px,0.28vh,7px)]" : "py-[clamp(2px,0.45vh,11px)]"
              }`}
              style={{ borderColor: "rgba(255,255,255,0.05)" }}
            >
              <span className="inline-flex items-center gap-2 min-w-0">
                <span
                  className="w-[1.5em] h-[1.5em] shrink-0 rounded-[4px] inline-flex items-center justify-center text-[clamp(9px,0.5vw,15px)] font-bold"
                  style={{ background: `${casino.accent}26`, color: casino.accent }}
                >
                  {i + 1}
                </span>
                <span className="truncate text-[clamp(11px,0.66vw,20px)] font-medium text-white/85">
                  {r.name}
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

/** Cross-casino ranked list (Dark Gold right column). */
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
  const rows = [...players].sort((a, b) => b.drop - a.drop).slice(0, limit);
  return (
    <div
      className="rounded-xl border overflow-hidden flex flex-col min-h-0"
      style={{ borderColor: `${PREMIER.darkGold}59`, background: "rgba(255,255,255,0.03)" }}
    >
      <header
        className="px-[clamp(8px,0.7vw,18px)] py-[clamp(3px,0.5vh,10px)] border-b"
        style={{
          borderColor: `${PREMIER.darkGold}33`,
          background: `linear-gradient(90deg, ${PREMIER.darkGold}2E, transparent)`,
        }}
      >
        <span
          className="text-[clamp(10px,0.58vw,18px)] font-extrabold uppercase tracking-[0.24em]"
          style={{ color: PREMIER.softGold }}
        >
          {title}
        </span>
      </header>
      {rows.length === 0 ? (
        <div className="flex-1 grid place-items-center text-white/40 text-[clamp(11px,0.6vw,18px)]">—</div>
      ) : (
        <ol className="flex-1 flex flex-col justify-around px-[clamp(6px,0.6vw,16px)] py-[clamp(2px,0.4vh,10px)]">
          {rows.map((r, i) => (
            <li key={`${r.casinoId}:${r.playerId}`} className="flex items-center justify-between gap-3 min-w-0">
              <span className="inline-flex items-center gap-2 min-w-0">
                <span
                  className="w-[1.6em] h-[1.6em] shrink-0 rounded-[4px] inline-flex items-center justify-center text-[clamp(9px,0.52vw,16px)] font-bold"
                  style={{ background: `${accentOf(r.casinoId)}26`, color: accentOf(r.casinoId) }}
                >
                  {i + 1}
                </span>
                <span className="truncate text-[clamp(12px,0.72vw,22px)] font-medium text-white/90">
                  {r.name}
                </span>
                <span
                  className="text-[clamp(8px,0.44vw,13px)] uppercase tracking-[0.2em] whitespace-nowrap"
                  style={{ color: accentOf(r.casinoId) }}
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
