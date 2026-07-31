// Unified shift & attendance color palette used across Dealer Rota, Staff Rota, Breaklist & Attendance grids.
// D = Day (amber), M = Mid/Afternoon (teal), N = Night (sky), G = Graveyard (indigo)

export const UNIFIED_SHIFT_COLORS: Record<string, string> = {
  // Morning (staff, 06:00–12:00) — lime
  MO: "bg-lime-300 text-lime-950 dark:bg-lime-500 dark:text-lime-950 font-bold",
  // Day — bright amber (high contrast vs Night)
  D: "bg-amber-300 text-amber-950 dark:bg-amber-400 dark:text-amber-950 font-bold",
  // Mid/Afternoon — bright teal (clearly distinct from Day amber and Night blue)
  M: "bg-teal-500 text-white dark:bg-teal-500 dark:text-white font-bold",
  // Swing (Live Game Arusha, 19:00–06:00) — muted violet
  SW: "bg-violet-400 text-violet-950 dark:bg-violet-700 dark:text-white font-bold",
  // Night — deep blue, white text (maximum contrast vs Day in both themes)
  N: "bg-blue-700 text-white dark:bg-blue-600 dark:text-white font-bold",
  // Guard — indigo (security overnight)
  G: "bg-indigo-200 text-indigo-900 dark:bg-indigo-500 dark:text-white font-bold",
  // Leave — emerald
  L: "bg-emerald-200 text-emerald-900 dark:bg-emerald-500 dark:text-emerald-950 font-bold",
  // Extra shifts (E, EM, EN, ESW) — one shared fuchsia colour
  E: "bg-fuchsia-300 text-fuchsia-950 dark:bg-fuchsia-600 dark:text-white font-bold",
  EM: "bg-fuchsia-300 text-fuchsia-950 dark:bg-fuchsia-600 dark:text-white font-bold",
  EN: "bg-fuchsia-300 text-fuchsia-950 dark:bg-fuchsia-600 dark:text-white font-bold",
  ESW: "bg-fuchsia-300 text-fuchsia-950 dark:bg-fuchsia-600 dark:text-white font-bold",
  // Training (09:00–15:00) — rose
  T: "bg-rose-200 text-rose-900 dark:bg-rose-500 dark:text-white font-bold",
  // Off — muted
  O: "bg-muted/30 text-muted-foreground",
};

export const UNIFIED_ATT_COLORS: Record<string, string> = {
  A: "bg-red-200 text-red-900 dark:bg-red-500 dark:text-white font-bold",
  S: "bg-orange-200 text-orange-900 dark:bg-orange-500 dark:text-white font-bold",
  SP: "bg-red-600 text-white dark:bg-red-700 dark:text-white font-bold",
  L: "bg-amber-300 text-amber-950 dark:bg-amber-500 dark:text-amber-950 font-bold",
};


// Lighter tint for scheduled-but-empty rota cells (still clear day vs night separation)
export const UNIFIED_SHIFT_TINTS: Record<string, string> = {
  MO: "bg-lime-100 text-lime-800 dark:bg-lime-500/40 dark:text-lime-100",
  D: "bg-amber-100 text-amber-800 dark:bg-amber-500/40 dark:text-amber-200",
  M: "bg-teal-300 text-teal-950 dark:bg-teal-600/70 dark:text-white",
  SW: "bg-cyan-200 text-cyan-900 dark:bg-cyan-600/60 dark:text-white",
  N: "bg-blue-300 text-blue-900 dark:bg-blue-600/60 dark:text-white",
  G: "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/30 dark:text-indigo-200",
  L: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/30 dark:text-emerald-200",
  E: "bg-purple-100 text-purple-700 dark:bg-purple-500/30 dark:text-purple-200",
  EM: "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-500/30 dark:text-fuchsia-200",
  EN: "bg-violet-100 text-violet-700 dark:bg-violet-500/30 dark:text-violet-200",
  T: "bg-rose-100 text-rose-700 dark:bg-rose-500/30 dark:text-rose-200",
};

/** True if shift code is any Extra variant (legacy E, EM, EN). */
export const isExtraShift = (s: string | null | undefined): boolean =>
  s === "E" || s === "EM" || s === "EN";
