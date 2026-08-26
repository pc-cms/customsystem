/**
 * Dashboard TV — shared presentational primitives.
 * Every style composes these; no style re-implements number formatting,
 * availability ("—") handling or column alignment.
 *
 * Numbers are auto-fitting: the rendered font step is reduced according to the
 * length of the formatted string, so 9–12 digit TZS values, negative values and
 * >100% percentages never overlap their neighbouring column.
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

/* ------------------------------------------------------------------ */
/* Numeric auto-fit                                                     */
/* ------------------------------------------------------------------ */

export const NUM_SIZE_ORDER = ["xs", "sm", "md", "lg", "xl"] as const;
export type NumSize = (typeof NUM_SIZE_ORDER)[number];

/** Length at which a value still renders at its nominal size. */
export const NUM_COMFORT_LEN = 9;

/**
 * Pick the rendered size step for a formatted numeric string.
 * Values longer than `NUM_COMFORT_LEN` step down one level per 3 extra chars
 * (max 3 steps) so nothing is ever clipped or truncated with an ellipsis.
 */
export function autoNumSize(size: NumSize, text: string): NumSize {
  const len = (text ?? "").length;
  if (len <= NUM_COMFORT_LEN) return size;
  const steps = Math.min(3, Math.ceil((len - NUM_COMFORT_LEN) / 3));
  const idx = Math.max(0, NUM_SIZE_ORDER.indexOf(size) - steps);
  return NUM_SIZE_ORDER[idx];
}

const NUM_SIZE_CLASS: Record<NumSize, string> = {
  xs: "text-[clamp(10px,0.56vw,18px)]",
  sm: "text-[clamp(12px,0.72vw,23px)]",
  md: "text-[clamp(14px,0.92vw,29px)]",
  lg: "text-[clamp(17px,1.25vw,39px)]",
  xl: "text-[clamp(21px,1.7vw,52px)]",
};

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

/** Fixed-width, tabular, auto-fitting, never-wrapping number cell. */
export function Num({
  text,
  color,
  size = "md",
  glow,
  className = "",
  autoFit = true,
}: {
  text: string;
  color?: string;
  size?: NumSize;
  glow?: string;
  className?: string;
  autoFit?: boolean;
}) {
  const step = autoFit ? autoNumSize(size, text) : size;
  return (
    <span
      className={`block min-w-0 overflow-hidden font-mono tabular-nums tracking-tight text-right whitespace-nowrap leading-none font-semibold ${NUM_SIZE_CLASS[step]} ${className}`}
      style={{ color, textShadow: glow ? `0 0 22px ${glow}55` : undefined }}
      data-num-size={step}
      title={text}
    >
      {text}
    </span>
  );
}

export function ColHead({ children }: { children: React.ReactNode }) {
  return (
    <span className="block min-w-0 overflow-hidden text-[clamp(8px,0.46vw,14px)] uppercase tracking-[0.2em] text-white/50 font-semibold text-right whitespace-nowrap">
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
      className={`truncate min-w-0 text-[clamp(9px,0.58vw,17px)] uppercase tracking-[0.16em] ${
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
  "grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.35fr)_minmax(0,1.35fr)_minmax(0,0.62fr)] gap-x-[clamp(6px,0.7vw,22px)] items-baseline min-w-0";

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
  size?: NumSize;
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
      className={`${METRIC_GRID} col-span-4 rounded-md px-[clamp(4px,0.35vw,12px)] py-[clamp(2px,0.36vh,10px)]`}
      style={{ background: fill }}
      data-metric-row={label.toLowerCase()}
    >
      <span className="inline-flex items-center gap-2 min-w-0 overflow-hidden">
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
  size?: NumSize;
  totalSize?: NumSize;
}) {
  return (
    <div className={`${METRIC_GRID} gap-y-[clamp(2px,0.3vh,9px)]`}>
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
  size = "md",
  align = "left",
}: {
  label: string;
  value: string;
  color?: string;
  accent?: string;
  size?: NumSize;
  align?: "left" | "right";
}) {
  return (
    <div className={`flex flex-col gap-[0.2em] min-w-0 overflow-hidden ${align === "right" ? "items-end" : ""}`}>
      <span className="block min-w-0 overflow-hidden text-[clamp(8px,0.46vw,14px)] uppercase tracking-[0.24em] text-white/50 font-semibold whitespace-nowrap">
        {label}
      </span>
      <Num text={value} color={color} size={size} glow={accent} className="w-full" />
    </div>
  );
}
