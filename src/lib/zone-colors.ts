export type PlayerZone = "S" | "LG" | "CP";

export const ZONE_VALUES: PlayerZone[] = ["S", "LG", "CP"];

export const ZONE_LABELS: Record<PlayerZone, string> = {
  S: "Slots",
  LG: "Live Game",
  CP: "Club Poker",
};

/** Order used when sorting by Zone (S < LG < CP < none). */
export const ZONE_SORT_ORDER: Record<PlayerZone, number> = {
  S: 0,
  LG: 1,
  CP: 2,
};

/**
 * Square solid fill applied to the whole <td> for both Zone and Bet columns.
 * Mirrored across light/dark so the link Zone↔Bet stays visible in both themes.
 */
export const ZONE_CELL_CLASSES: Record<PlayerZone, string> = {
  S: "bg-amber-500/25 text-amber-900 dark:bg-amber-500/25 dark:text-amber-100",
  LG: "bg-sky-500/25 text-sky-900 dark:bg-sky-500/25 dark:text-sky-100",
  CP: "bg-purple-500/25 text-purple-900 dark:bg-purple-500/25 dark:text-purple-100",
};

/** Compact chip style — used inside picker buttons. */
export const ZONE_CHIP_CLASSES: Record<PlayerZone, string> = {
  S: "bg-amber-500/30 text-amber-900 dark:text-amber-100 border-amber-500/50",
  LG: "bg-sky-500/30 text-sky-900 dark:text-sky-100 border-sky-500/50",
  CP: "bg-purple-500/30 text-purple-900 dark:text-purple-100 border-purple-500/50",
};
