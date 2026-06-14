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
 * Thin inset border applied to the Zone column cell only.
 * No fill — keeps the row background untouched while still highlighting Zone.
 * Text stays colored.
 */
export const ZONE_CELL_CLASSES: Record<PlayerZone, string> = {
  S: "ring-1 ring-inset ring-amber-500/60 text-amber-700 dark:text-amber-300",
  LG: "ring-1 ring-inset ring-sky-500/60 text-sky-700 dark:text-sky-300",
  CP: "ring-1 ring-inset ring-purple-500/60 text-purple-700 dark:text-purple-300",
};

/** Compact chip style — used inside picker buttons. */
export const ZONE_CHIP_CLASSES: Record<PlayerZone, string> = {
  S: "bg-amber-500/30 text-amber-900 dark:text-amber-100 border-amber-500/50",
  LG: "bg-sky-500/30 text-sky-900 dark:text-sky-100 border-sky-500/50",
  CP: "bg-purple-500/30 text-purple-900 dark:text-purple-100 border-purple-500/50",
};
