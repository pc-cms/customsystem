/**
 * Dashboard TV — minimal city pictograms.
 * Pure decoration: one small line-art mark per city, drawn in the city accent
 * at low opacity. No data, no text, no logic.
 */

type MarkProps = { className?: string };

const STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.4,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

/** Arusha — Meru silhouette. */
function ArushaMark(p: MarkProps) {
  return (
    <svg viewBox="0 0 32 32" className={p.className} aria-hidden="true">
      <path d="M2 25 L11 11 L16 18 L21 8 L30 25" {...STROKE} />
      <path d="M18.6 12.4 L21 8 L23.4 12.4" {...STROKE} />
    </svg>
  );
}

/** Mwanza — lake water with a rock. */
function MwanzaMark(p: MarkProps) {
  return (
    <svg viewBox="0 0 32 32" className={p.className} aria-hidden="true">
      <path d="M9 17 C11 11 17 10 20 14 C23 17 21 20 18 20 L11 20 C9 20 8.4 18.6 9 17 Z" {...STROKE} />
      <path d="M3 24 C7 21.5 11 26 15 23.5 C19 21 23 26 29 23" {...STROKE} />
      <path d="M3 28 C7 25.5 11 30 15 27.5" {...STROKE} />
    </svg>
  );
}

/** Dodoma — acacia under the sun. */
function DodomaMark(p: MarkProps) {
  return (
    <svg viewBox="0 0 32 32" className={p.className} aria-hidden="true">
      <circle cx="24" cy="8" r="4" {...STROKE} />
      <path d="M4 16 C7 11 17 11 20 16" {...STROKE} />
      <path d="M12 16 L12 27" {...STROKE} />
      <path d="M12 20 L8 24 M12 20 L16 24" {...STROKE} />
      <path d="M3 27 L29 27" {...STROKE} />
    </svg>
  );
}

/** Mbeya — highland ridge with pines. */
function MbeyaMark(p: MarkProps) {
  return (
    <svg viewBox="0 0 32 32" className={p.className} aria-hidden="true">
      <path d="M2 22 L10 10 L18 22" {...STROKE} />
      <path d="M14 22 L22 12 L30 22" {...STROKE} />
      <path d="M24 27 L24 22 M21 25 L24 22 L27 25" {...STROKE} />
      <path d="M2 27 L30 27" {...STROKE} />
    </svg>
  );
}

const MARKS: Record<string, (p: MarkProps) => JSX.Element> = {
  arusha: ArushaMark,
  mwanza: MwanzaMark,
  dodoma: DodomaMark,
  mbeya: MbeyaMark,
};

/**
 * Small line-art mark for a city. Renders nothing for unknown slugs.
 * Sized from the TV density scale (24–40px band at 1920).
 */
export function CityMark({
  slug,
  accent,
  className = "",
}: {
  slug: string | null | undefined;
  accent: string;
  className?: string;
}) {
  const Mark = MARKS[(slug || "").toLowerCase()];
  if (!Mark) return null;
  return (
    <span
      aria-hidden="true"
      className={`shrink-0 inline-flex ${className}`}
      style={{
        color: accent,
        opacity: 0.32,
        width: "calc(var(--tv-u, 1px) * 30)",
        height: "calc(var(--tv-u, 1px) * 30)",
        minWidth: "20px",
        minHeight: "20px",
      }}
    >
      <Mark className="w-full h-full" />
    </span>
  );
}
