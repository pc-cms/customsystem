/**
 * Compact brand header rendered INSIDE every TV stage, so each style is a
 * self-contained screen and no external chrome is required in TV mode.
 */
import premierClubLogo from "/premier-club-logo.svg";
import { useEatClock } from "./primitives";
import { PREMIER } from "./tokens";

export function TvBrandHeader({
  period,
  periodLabel,
  accent = PREMIER.softGold,
  right,
  className = "",
}: {
  period: "today" | "monthly";
  periodLabel: string;
  accent?: string;
  /** Optional trailing content (compact KPIs). */
  right?: React.ReactNode;
  className?: string;
}) {
  const clock = useEatClock();
  return (
    <header
      data-tv-brand-header
      className={`flex items-center gap-[clamp(8px,1vw,28px)] min-w-0 ${className}`}
    >
      <span className="inline-flex items-center gap-[clamp(6px,0.6vw,16px)] min-w-0 shrink-0">
        <img
          src={premierClubLogo}
          alt="Premier Casino"
          className="w-[clamp(22px,1.7vw,52px)] h-[clamp(22px,1.7vw,52px)] object-contain"
        />
        <span className="flex flex-col min-w-0">
          <span
            className="text-[clamp(11px,0.8vw,26px)] font-extrabold uppercase tracking-[0.26em] leading-none whitespace-nowrap"
            style={{ color: accent }}
          >
            Premier Casino
          </span>
          <span className="text-[clamp(8px,0.44vw,13px)] uppercase tracking-[0.26em] text-white/45 whitespace-nowrap mt-[0.35em]">
            {period === "today" ? "Live · Today" : `Monthly · ${periodLabel}`}
          </span>
        </span>
      </span>

      <span className="inline-flex items-baseline gap-[clamp(6px,0.7vw,20px)] whitespace-nowrap shrink-0">
        <span className="text-[clamp(9px,0.52vw,16px)] uppercase tracking-[0.2em] text-white/55 font-semibold">
          {clock.date}
        </span>
        <span
          className="font-mono tabular-nums font-bold leading-none text-[clamp(18px,1.35vw,42px)]"
          style={{ color: PREMIER.champagne }}
        >
          {clock.time}
        </span>
        <span className="text-[clamp(8px,0.42vw,13px)] uppercase tracking-[0.26em] text-white/35">EAT</span>
      </span>

      {right ? <div className="flex-1 min-w-0 overflow-hidden">{right}</div> : null}
    </header>
  );
}
