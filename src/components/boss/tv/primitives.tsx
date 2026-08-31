/**
 * Dashboard TV — shared presentational primitives.
 * Every style composes these; no style re-implements number formatting,
 * availability ("—") handling or column alignment.
 *
 * Sizing rules:
 *  - All typography reads the density scale (see `./density`), so S/M/L/XL is
 *    a real, working control.
 *  - Numbers fit by MEASURED container width (ResizeObserver), not by string
 *    length. A 9–12 digit TZS value keeps its nominal size whenever the column
 *    is wide enough; nothing is ever clipped or ellipsised.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { formatMoneyFull } from "@/lib/format-money";
import { NEGATIVE, POSITIVE, PREMIER, resultTone } from "./tokens";
import type { CasinoMetric } from "@/hooks/use-boss-dashboard";
import type { DisplayedToday } from "@/lib/boss-display-metrics";

export const DASH = "—";

/** Unified warm-white / ivory used by every non-result value. */
export const IVORY = PREMIER.champagne;

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

/** Result colour by magnitude — identical rules everywhere on the screen. */
export const resultColor = (n: number | null | undefined) =>
  resultTone(n).color ?? IVORY;

export const resultGlow = (n: number | null | undefined) => resultTone(n).glow;


/* ------------------------------------------------------------------ */
/* Numeric sizing                                                       */
/* ------------------------------------------------------------------ */

export const NUM_SIZE_ORDER = ["xs", "sm", "md", "lg", "xl"] as const;
export type NumSize = (typeof NUM_SIZE_ORDER)[number];

/**
 * Length at which the (very soft) fallback shrink starts. 9–12 digit TZS
 * values such as "1 250 000 000" (13 chars) or "−123 456 789" stay at their
 * nominal size; only genuinely extreme strings step down, and never more than
 * one step — the real fitting is measurement based (`useFitFactor`).
 */
export const NUM_COMFORT_LEN = 16;

export function autoNumSize(size: NumSize, text: string): NumSize {
  const len = (text ?? "").length;
  if (len <= NUM_COMFORT_LEN) return size;
  const idx = Math.max(0, NUM_SIZE_ORDER.indexOf(size) - 1);
  return NUM_SIZE_ORDER[idx];
}

const NUM_SIZE_VAR: Record<NumSize, string> = {
  xs: "var(--tv-num-xs, 14px)",
  sm: "var(--tv-num-sm, 18px)",
  md: "var(--tv-num-md, 22px)",
  lg: "var(--tv-num-lg, 26px)",
  xl: "var(--tv-num-xl, 32px)",
};

const MIN_FIT = 0.62;

/**
 * Measure the container and return a font-size factor <= 1 that makes the
 * value fit exactly. In environments without layout (jsdom) it stays 1.
 */
function useFitFactor(text: string) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [factor, setFactor] = useState(1);
  const factorRef = useRef(1);
  factorRef.current = factor;

  const measure = () => {
    const el = ref.current;
    if (!el) return;
    const avail = el.clientWidth;
    const need = el.scrollWidth;
    if (!avail || !need) return;
    const naturalNeed = need / (factorRef.current || 1);
    const next =
      naturalNeed > avail ? Math.max(MIN_FIT, (avail / naturalNeed) * 0.99) : 1;
    if (Math.abs(next - factorRef.current) > 0.012) setFactor(next);
  };

  useLayoutEffect(measure);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  return { ref, factor };
}

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

/** Fixed-width, tabular, width-fitting, never-wrapping number cell. */
export function Num({
  text,
  color,
  size = "md",
  glow,
  className = "",
  autoFit = true,
  scale = 1,
  align = "right",
}: {
  text: string;
  color?: string;
  size?: NumSize;
  glow?: string;
  className?: string;
  autoFit?: boolean;
  /** Extra multiplier on top of the density step (hero tiles). */
  scale?: number;
  align?: "right" | "center";
}) {
  const step = autoFit ? autoNumSize(size, text) : size;
  const { ref, factor } = useFitFactor(text);
  const mult = factor * scale;
  return (
    <span
      ref={ref}
      className={`block min-w-0 overflow-hidden font-mono tabular-nums tracking-tight whitespace-nowrap leading-none font-semibold ${
        align === "center" ? "text-center" : "text-right"
      } ${className}`}
      style={{
        color,
        fontSize:
          mult === 1
            ? NUM_SIZE_VAR[step]
            : `calc(${NUM_SIZE_VAR[step]} * ${mult.toFixed(3)})`,
        // Restrained premium glow — only ever used at the strongest result step.
        textShadow: glow ? `0 0 16px ${glow}47` : undefined,
      }}
      data-num-size={step}
      data-num-var={NUM_SIZE_VAR[step]}
      title={text}
    >
      {text}
    </span>
  );
}


export function ColHead({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="block min-w-0 overflow-hidden uppercase tracking-[0.2em] text-white/55 font-semibold text-right whitespace-nowrap"
      style={{ fontSize: "var(--tv-label, 12px)" }}
    >
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
      className={`truncate min-w-0 uppercase tracking-[0.16em] ${
        strong ? "font-extrabold" : "font-semibold"
      }`}
      style={{
        color: color ?? "rgba(255,255,255,0.66)",
        fontSize: `calc(var(--tv-label, 12px) * ${strong ? 1.18 : 1.05})`,
      }}
    >
      {children}
    </span>
  );
}

/** Muted-gold hairline used between metric columns and rows. */
export const HAIRLINE = `${PREMIER.darkGold}33`;

/** Neutral, city-independent row fills — identical for every casino. */
export const ROW_FILL = {
  tables: "rgba(255,255,255,0.045)",
  slots: "rgba(255,255,255,0.018)",
  total: `${PREMIER.softGold}1A`,
} as const;


/** Grid template shared by every metrics block: Label | Drop | Result | Hold. */
export const METRIC_GRID =
  "grid grid-cols-[minmax(0,0.75fr)_minmax(0,1.4fr)_minmax(0,1.4fr)_minmax(0,0.6fr)] gap-x-[calc(var(--tv-gap,10px)*1.4)] items-center min-w-0";

export function MetricRow({
  label,
  metric,
  dropAvailable = true,
  resultAvailable = true,
  size = "md",
  labelColor,
  strong,
  fill,
  marker,
  badge,
  badgeTitle,
}: {
  label: string;
  metric: CasinoMetric;
  dropAvailable?: boolean;
  resultAvailable?: boolean;
  size?: NumSize;
  labelColor?: string;
  strong?: boolean;
  /** Row background fill — visually separates Tables vs Slots vs Total. */
  fill?: string;
  /** Small leading marker color. */
  marker?: string;
  /** Small pill after the label, e.g. "LIVE" for a fresh ACE feed. */
  badge?: string | null;
  /** Tooltip for the badge (period label / feed age). */
  badgeTitle?: string | null;
}) {

  const result = resultAvailable ? metric.result : null;
  const holdOk = dropAvailable && resultAvailable && metric.drop > 0;
  return (
    <div
      className={`${METRIC_GRID} col-span-4 h-full rounded-md px-[calc(var(--tv-gap,10px)*0.6)] py-[var(--tv-row-pad,8px)]`}
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
        {badge && (
          <span
            title={badgeTitle ?? undefined}
            className="shrink-0 rounded-[3px] px-[0.35em] py-[0.05em] text-[0.5em] font-semibold tracking-[0.12em] leading-none"
            style={{
              color: PREMIER.softGold,
              border: `1px solid ${PREMIER.softGold}55`,
              background: `${PREMIER.softGold}14`,
            }}
          >
            {badge}
          </span>
        )}
      </span>

      {/* Drop and Hold: one unified ivory across every city. */}
      <Num text={dropAvailable ? fmtMoney(metric.drop) : DASH} size={size} color={IVORY} />
      {/* Result: the only metric with semantic intensity. */}
      <Num
        text={fmtSigned(result)}
        color={resultColor(result)}
        glow={resultGlow(result)}
        size={size}
      />
      <Num text={holdOk ? fmtPct(metric.hold) : DASH} size={size} color={IVORY} />
    </div>
  );
}

/** Tables / Slots / Total block — identical semantics in every style. */
export function MetricsBlock({
  displayed,
  accent,
  fills,
  size = "sm",
  totalSize = "md",
}: {
  displayed: DisplayedToday;
  /** City accent — used only for the small leading marker. */
  accent: string;
  fills?: { tables?: string; slots?: string; total?: string };
  size?: NumSize;
  totalSize?: NumSize;
}) {
  return (
    <div
      className={`${METRIC_GRID} h-full gap-y-[calc(var(--tv-gap,10px)*0.35)]`}
      style={{ gridTemplateRows: "auto repeat(3, minmax(0,1fr))" }}
    >
      <span />
      <ColHead>Drop</ColHead>
      <ColHead>Result</ColHead>
      <ColHead>Hold</ColHead>

      <MetricRow
        label="Tables"
        metric={displayed.tables}
        size={size}
        fill={fills?.tables ?? ROW_FILL.tables}
        marker={accent}
      />
      <MetricRow
        label="Slots"
        metric={displayed.slots}
        dropAvailable={displayed.slotsDropAvailable}
        resultAvailable={displayed.slotsResultAvailable}
        size={size}
        fill={fills?.slots ?? ROW_FILL.slots}
        marker={`${accent}66`}
      />
      <MetricRow
        label="Total"
        metric={displayed.total}
        size={totalSize}
        strong
        labelColor={PREMIER.softGold}
        fill={fills?.total ?? ROW_FILL.total}
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
  size?: NumSize;
  align?: "left" | "right" | "center";
}) {
  const centered = align === "center";
  return (
    <div
      className={`flex flex-col min-w-0 overflow-hidden ${
        centered ? "items-center gap-[0.42em]" : align === "right" ? "items-end gap-[0.2em]" : "gap-[0.2em]"
      }`}
    >
      <span
        className={`block min-w-0 overflow-hidden uppercase font-semibold whitespace-nowrap ${
          centered ? "tracking-[0.3em] text-white/50 text-center" : "tracking-[0.24em] text-white/55"
        }`}
        style={{ fontSize: centered ? "calc(var(--tv-label, 12px) * 0.92)" : "var(--tv-label, 12px)" }}
      >
        {label}
      </span>
      <Num
        text={value}
        color={color}
        size={size}
        glow={accent}
        align={centered ? "center" : "right"}
        className="w-full"
      />
    </div>
  );
}

/**
 * Global header KPI row — equal-width columns, centered label over value,
 * thin Premier Gold separators between the columns.
 */
export function KpiRow({ children }: { children: React.ReactNode[] }) {
  const items = children.filter(Boolean);
  return (
    <div
      data-tv-kpi-row
      className="grid min-w-0 items-center"
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0,1fr))` }}
    >
      {items.map((child, i) => (
        <div
          key={i}
          className="relative min-w-0 px-[calc(var(--tv-gap,10px)*0.8)] flex items-center justify-center"
        >
          {child}
          {i < items.length - 1 && (
            <span
              aria-hidden="true"
              className="absolute right-0 top-1/2 -translate-y-1/2 w-px"
              style={{
                height: "58%",
                background: `linear-gradient(180deg, transparent, ${PREMIER.softGold}59 22%, ${PREMIER.softGold}59 78%, transparent)`,
                opacity: 0.55,
              }}
            />
          )}
        </div>
      ))}
    </div>
  );
}

