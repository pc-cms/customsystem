/**
 * Dashboard TV — Premier Casino visual tokens.
 * Shared by all three Live styles (Black Gold / Red Gold / Dark Gold).
 * Presentation only: no business logic lives here.
 */

export const PREMIER = {
  black: "#0A0A0A",
  darkRed: "#A0000D",
  lightRed: "#D00D13",
  softGold: "#E8C688",
  darkGold: "#A68E61",
  champagne: "#F2E3C4",
  lightBlue: "#B1EFFF",
} as const;

export type TvStyleId = "black-gold" | "red-gold" | "dark-gold";

export const TV_STYLES: { id: TvStyleId; label: string }[] = [
  { id: "black-gold", label: "Black Gold" },
  { id: "red-gold", label: "Red Gold" },
  { id: "dark-gold", label: "Dark Gold" },
];

export const DEFAULT_TV_STYLE: TvStyleId = "black-gold";

/** City accents — fixed brand mapping. */
export const CITY_ACCENTS: Record<string, string> = {
  arusha: PREMIER.darkRed,
  dodoma: PREMIER.softGold,
  mbeya: PREMIER.darkGold,
  mwanza: PREMIER.lightBlue,
};

const FALLBACK_ACCENTS = [
  PREMIER.softGold,
  PREMIER.lightBlue,
  PREMIER.darkGold,
  PREMIER.darkRed,
];

export const tvAccentFor = (slug: string | null | undefined, idx = 0) => {
  const key = (slug || "").toLowerCase();
  if (key && CITY_ACCENTS[key]) return CITY_ACCENTS[key];
  return FALLBACK_ACCENTS[idx % FALLBACK_ACCENTS.length];
};

/** Page-level backdrop per style. */
export const STAGE_BACKGROUND: Record<TvStyleId, string> = {
  "black-gold": `radial-gradient(1400px 900px at 15% -15%, ${PREMIER.softGold}12, transparent 60%), radial-gradient(1100px 700px at 95% 115%, ${PREMIER.darkRed}18, transparent 60%), ${PREMIER.black}`,
  "red-gold": `radial-gradient(1500px 900px at 50% -25%, ${PREMIER.darkRed}55, transparent 65%), radial-gradient(900px 600px at 90% 110%, ${PREMIER.lightRed}22, transparent 60%), #120305`,
  "dark-gold": `radial-gradient(1300px 800px at 10% -10%, ${PREMIER.darkGold}20, transparent 62%), radial-gradient(1000px 700px at 100% 110%, ${PREMIER.softGold}0F, transparent 60%), #0C0A07`,
};

/** Surface (card) styling per style. */
export const SURFACE: Record<TvStyleId, { background: string; border: string; shadow: string }> = {
  "black-gold": {
    background: `linear-gradient(180deg, rgba(255,255,255,0.045), rgba(255,255,255,0.012))`,
    border: `${PREMIER.softGold}3D`,
    shadow: `inset 0 1px 0 0 ${PREMIER.softGold}22`,
  },
  "red-gold": {
    background: `linear-gradient(160deg, ${PREMIER.darkRed}3D, rgba(10,10,10,0.85) 65%)`,
    border: `${PREMIER.softGold}66`,
    shadow: `inset 0 1px 0 0 ${PREMIER.champagne}22, 0 18px 50px -30px ${PREMIER.lightRed}`,
  },
  "dark-gold": {
    background: `linear-gradient(180deg, ${PREMIER.darkGold}26, rgba(12,10,7,0.9) 70%)`,
    border: `${PREMIER.darkGold}59`,
    shadow: `inset 0 1px 0 0 ${PREMIER.softGold}1F`,
  },
};

export const POSITIVE = "#7BE3A2";
export const NEGATIVE = "#FF7A85";
