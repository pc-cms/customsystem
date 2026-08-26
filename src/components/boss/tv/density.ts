/**
 * Dashboard TV — one real density scale.
 *
 * Every TV typography primitive reads a CSS variable from this scale, so the
 * S / M / L / XL preset actually changes the rendered size (previously each
 * component had its own px/vw clamp and the preset was almost a no-op).
 *
 * Unit: `--tv-u` equals 1px at a 1920px-wide viewport and scales linearly with
 * the viewport width, so 3840x2160 renders exactly twice as large.
 */

export type TvDensity = "s" | "m" | "l" | "xl";

export const TV_DENSITY_MULT: Record<TvDensity, number> = {
  s: 0.66,
  m: 0.78,
  l: 0.89,
  xl: 1,
};

/** Nominal sizes (px @ 1920 width, XL preset). */
export const TV_BASE = {
  numXs: 17,
  numSm: 23,
  numMd: 29,
  numLg: 32,
  numXl: 40,
  label: 13,
  city: 27,
  cityHead: 14,
  topName: 20,
  brand: 22,
  clock: 40,
  gap: 10,
  rowPad: 8,
} as const;

/**
 * Inline style object with the resolved scale. Applied on the TV stage root.
 * `mult` comes from the density preset, `resNudge` from the FHD/4K toggle.
 */
export function tvDensityVars(
  density: TvDensity,
  resNudge = 1,
): React.CSSProperties {
  const k = TV_DENSITY_MULT[density] * resNudge;
  // 1 unit = 1px at 1920px viewport width, min-clamped so tiny windows stay legible.
  const u = `calc(${k} * max(0.052vw, 0.62px))`;
  const v = (n: number) => `calc(${n} * var(--tv-u))`;
  return {
    "--tv-u": u,
    "--tv-num-xs": v(TV_BASE.numXs),
    "--tv-num-sm": v(TV_BASE.numSm),
    "--tv-num-md": v(TV_BASE.numMd),
    "--tv-num-lg": v(TV_BASE.numLg),
    "--tv-num-xl": v(TV_BASE.numXl),
    "--tv-label": v(TV_BASE.label),
    "--tv-city": v(TV_BASE.city),
    "--tv-city-head": v(TV_BASE.cityHead),
    "--tv-top-name": v(TV_BASE.topName),
    "--tv-brand": v(TV_BASE.brand),
    "--tv-clock": v(TV_BASE.clock),
    "--tv-gap": v(TV_BASE.gap),
    "--tv-row-pad": v(TV_BASE.rowPad),
  } as React.CSSProperties;
}
