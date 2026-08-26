/**
 * Dashboard TV — shared presentational primitives.
 * Every style composes these; no style re-implements number formatting,
 * availability ("—") handling or column alignment.
 */
import { useEffect, useState } from "react";
import { formatMoneyFull } from "@/lib/format-money";
import { NEGATIVE, POSITIVE } from "./tokens";
import type { CasinoMetric } from "@/hooks/use-boss-dashboard";
import type { DisplayedToday } from "@/lib/boss-display-metrics";

export const DASH = "—";

export const fmtMoney = (n: number | null | undefined) =>
  n == null ? DASH : formatMoneyFull(Math.round(n));

export const fmtSigned = (n: number | null | undefined) => {
  if (n == null) return DASH;
  const r = Math.round(n);
  const s = formatMoneyFull(Math.abs(r));
  return (r < 0 ? "−" : r > 0 ? "+" : "") + s;
};

export const fmtPct = (n: number | null | undefined) =>
  n == null ? DASH : `${n.toFixed(1)}%`;

export const signColor = (n: number | null | undefined) =>
  n == null ? undefined : n < 0 ? NEGATIVE : n > 0 ? POSITIVE : undefined;

/** EAT (Africa/Dar_es_Salaam) live clock, ticking every second. */
export function useEatClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const time = now.toLocaleTimeString("en-GB", {
    timeZone: "Africa/Dar_es_Salaam",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const date = now.toLocaleDateString("en-GB", {
    timeZone: "Africa/Dar_es_Salaam",
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  return { time, date };
}

/** Fixed-width, tabular, never-wrapping number cell. */
export function Num({
  text,
  color,
  size = "md",
  glow,
  className = "",
}: {
  text: string;
  color?: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  glow?: string;
  className?: string;
}) {
  const sizes: Record<string, string> = {
    xs: "text-[clamp(11px,0.62vw,20px)]",
    sm: "text-[clamp(13px,0.82vw,26px)]",
    md: "text-[clamp(15px,1vw,32px)]",
    lg: "text-[clamp(20px,1.55vw,48px)]",
    xl: "text-[clamp(26px,2.2vw,68px)]",
  };
  return (
    <span
      className={`font-mono tabular-nums tracking-tight text-right whitespace-nowrap leading-none font-semibold ${sizes[size]} ${className}`}
      style={{ color, textShadow: glow ? `0 0 24px ${glow}66` : undefined }}
    >
      {text}
    </span>
  );
}

export function ColHead({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[clamp(9px,0.5vw,15px)] uppercase tracking-[0.22em] text-white/45 font-semibold text-right whitespace-nowrap">
      {children}
    </span>
  );
}

export function RowLabel({
  children,
  color,
  strong,
}: {
  children: React.ReactNode;
  color?: string;
  strong?: boolean;
}) {
  return (
    <span
      className={`text-[clamp(10px,0.64vw,19px)] uppercase tracking-[0.18em] whitespace-nowrap ${
        strong ? "font-extrabold" : "font-semibold"
      }`}
      style={{ color: color ?? "rgba(255,255,255,0.62)" }}
    >
      {children}
    </span>
  );
}

/** Grid template shared by every metrics block: Label | Drop | Result | Hold. */
export const METRIC_GRID =
  "grid grid-cols-[minmax(0,auto)_minmax(0,1.3fr)_minmax(0,1.3fr)_minmax(0,0.52fr)] gap-x-[clamp(8px,0.9vw,28px)] items-baseline";

export function MetricRow({
  label,
  metric,
  dropAvailable = true,
  resultAvailable = true,
  size = "md",
  accent,
  labelColor,
  strong,
  fill,
  marker,
}: {
  label: string;
  metric: CasinoMetric;
  dropAvailable?: boolean;
  resultAvailable?: boolean;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  accent?: string;
  labelColor?: string;
  strong?: boolean;
  /** Row background fill — visually separates Tables vs Slots vs Total. */
  fill?: string;
  /** Small leading marker color. */
  marker?: string;
}) {
  const result = resultAvailable ? metric.result : null;
  const holdOk = dropAvailable && resultAvailable && metric.drop > 0;
  return (
    <div
      className={`${METRIC_GRID} col-span-4 rounded-md px-[clamp(4px,0.35vw,12px)] py-[clamp(3px,0.42vh,11px)]`}
      style={{ background: fill }}
    >
      <span className="inline-flex items-center gap-2 min-w-0">
        {marker && (
          <span
            className="inline-block w-[0.5em] h-[0.5em] rounded-[2px] shrink-0"
            style={{ background: marker }}
          />
        )}
        <RowLabel color={labelColor} strong={strong}>
          {label}
        </RowLabel>
      </span>
      <Num text={dropAvailable ? fmtMoney(metric.drop) : DASH} size={size} glow={strong ? accent : undefined} />
      <Num
        text={fmtSigned(result)}
        color={signColor(result)}
        size={size}
        glow={strong ? accent : undefined}
      />
      <Num text={holdOk ? fmtPct(metric.hold) : DASH} size={size} glow={strong ? accent : undefined} />
    </div>
  );
}

/** Tables / Slots / Total block — identical semantics in every style. */
export function MetricsBlock({
  displayed,
  accent,
  fills,
  size = "md",
  totalSize = "lg",
}: {
  displayed: DisplayedToday;
  accent: string;
  fills?: { tables?: string; slots?: string; total?: string };
  size?: "xs" | "sm" | "md" | "lg";
  totalSize?: "md" | "lg" | "xl";
}) {
  return (
    <div className={`${METRIC_GRID} gap-y-[clamp(2px,0.35vh,10px)]`}>
      <span />
      <ColHead>Drop</ColHead>
      <ColHead>Result</ColHead>
      <ColHead>Hold</ColHead>

      <MetricRow
        label="Tables"
        metric={displayed.tables}
        size={size}
        fill={fills?.tables ?? "rgba(255,255,255,0.05)"}
        marker={accent}
      />
      <MetricRow
        label="Slots"
        metric={displayed.slots}
        dropAvailable={displayed.slotsDropAvailable}
        resultAvailable={displayed.slotsResultAvailable}
        size={size}
        fill={fills?.slots ?? "rgba(255,255,255,0.015)"}
        marker={`${accent}66`}
      />
      <MetricRow
        label="Total"
        metric={displayed.total}
        size={totalSize}
        strong
        accent={accent}
        labelColor={accent}
        fill={fills?.total ?? `${accent}14`}
      />
    </div>
  );
}

/** Company KPI tile — used by the totals strips/heroes. */
export function Kpi({
  label,
  value,
  color,
  accent,
  size = "lg",
  align = "left",
}: {
  label: string;
  value: string;
  color?: string;
  accent?: string;
  size?: "md" | "lg" | "xl";
  align?: "left" | "right";
}) {
  return (
    <div className={`flex flex-col gap-[0.25em] min-w-0 ${align === "right" ? "items-end" : ""}`}>
      <span className="text-[clamp(9px,0.5vw,15px)] uppercase tracking-[0.26em] text-white/50 font-semibold whitespace-nowrap">
        {label}
      </span>
      <Num text={value} color={color} size={size} glow={accent} className="w-full" />
    </div>
  );
}
