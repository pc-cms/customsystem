/**
 * Compact brand header rendered INSIDE every TV stage, so each style is a
 * self-contained screen and no external chrome is required in TV mode.
 * Typography follows the shared TV density scale.
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
      className={`flex items-center gap-[calc(var(--tv-gap,10px)*1.6)] min-w-0 ${className}`}
    >
      <span className="inline-flex items-center gap-[var(--tv-gap,10px)] min-w-0 shrink-0">
        <img
          src={premierClubLogo}
          alt="Premier Casino"
          className="object-contain"
          style={{ width: "calc(var(--tv-brand,22px) * 1.7)", height: "calc(var(--tv-brand,22px) * 1.7)" }}
        />
        <span className="flex flex-col min-w-0">
          <span
            className="font-extrabold uppercase tracking-[0.26em] leading-none whitespace-nowrap"
            style={{ color: accent, fontSize: "var(--tv-brand, 22px)" }}
          >
            Premier Casino
          </span>
          <span
            className="uppercase tracking-[0.26em] text-white/45 whitespace-nowrap mt-[0.35em]"
            style={{ fontSize: "var(--tv-label, 12px)" }}
          >
            {period === "today" ? "Live · Today" : `Monthly · ${periodLabel}`}
          </span>
        </span>
      </span>

      <span className="inline-flex items-baseline gap-[var(--tv-gap,10px)] whitespace-nowrap shrink-0">
        <span
          className="uppercase tracking-[0.2em] text-white/55 font-semibold"
          style={{ fontSize: "var(--tv-label, 12px)" }}
        >
          {clock.date}
        </span>
        <span
          className="font-mono tabular-nums font-bold leading-none"
          style={{ color: PREMIER.champagne, fontSize: "var(--tv-clock, 34px)" }}
        >
          {clock.time}
        </span>
        <span
          className="uppercase tracking-[0.26em] text-white/35"
          style={{ fontSize: "calc(var(--tv-label, 12px) * 0.85)" }}
        >
          EAT
        </span>
      </span>

      {right ? <div className="flex-1 min-w-0 overflow-hidden">{right}</div> : null}
    </header>
  );
}
