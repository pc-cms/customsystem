/** Single game-type classifier for tables, shared by every screen.
 * Game types come from the managed list (table_game_types). The stored
 * table game decides the type; table name is only a fallback. */
export type GameGroup = string;
export type GameTypeDef = { code: string; label: string; sort_order: number; legacy_games: string[] };

const DEFAULT_TYPES: GameTypeDef[] = [
  { code: "AR", label: "American Roulette", sort_order: 10, legacy_games: ["European Roulette"] },
  { code: "PK", label: "Poker", sort_order: 20, legacy_games: ["Texas Holdem", "Omaha", "PLO"] },
  { code: "BJ", label: "Blackjack", sort_order: 30, legacy_games: [] },
  { code: "NIU", label: "Niu Niu", sort_order: 40, legacy_games: [] },
  { code: "BAC", label: "Baccarat", sort_order: 50, legacy_games: [] },
  { code: "CLUB", label: "Club Poker", sort_order: 60, legacy_games: [] },
];

const TOTAL_OVERRIDE: Record<string, string> = { AR: "TOTAL ARs", BJ: "TOTAL BJ" };

/** Mutable, kept in sync by useGameTypes(). */
export const GAME_GROUP_ORDER: GameGroup[] = [];
export const GAME_GROUP_LABEL: Record<GameGroup, string> = {};
export const GAME_GROUP_TOTAL_LABEL: Record<GameGroup, string> = {};
let TYPES: GameTypeDef[] = [];

export const setGameTypes = (list: GameTypeDef[]) => {
  TYPES = [...(list.length ? list : DEFAULT_TYPES)].sort((a, b) => a.sort_order - b.sort_order);
  GAME_GROUP_ORDER.splice(0, GAME_GROUP_ORDER.length, ...TYPES.map((t) => t.code));
  for (const k of Object.keys(GAME_GROUP_LABEL)) delete GAME_GROUP_LABEL[k];
  for (const k of Object.keys(GAME_GROUP_TOTAL_LABEL)) delete GAME_GROUP_TOTAL_LABEL[k];
  for (const t of TYPES) {
    GAME_GROUP_LABEL[t.code] = t.label;
    GAME_GROUP_TOTAL_LABEL[t.code] = TOTAL_OVERRIDE[t.code] ?? `TOTAL ${t.label.toUpperCase()}`;
  }
};
setGameTypes(DEFAULT_TYPES);

export const getGameTypes = () => TYPES;

const byGame = (raw?: string | null): GameGroup | null => {
  const g = (raw || "").trim().toLowerCase();
  if (!g) return null;
  const hit = TYPES.find(
    (t) => t.label.toLowerCase() === g || t.code.toLowerCase() === g || t.legacy_games.some((l) => l.toLowerCase() === g),
  );
  return hit ? hit.code : null;
};

const byName = (raw: string): GameGroup | null => {
  const n = (raw || "").trim().toUpperCase();
  if (/^AR\d*$/.test(n)) return "AR";
  if (/^PK?\d+$/.test(n)) return "PK";
  if (/^BJ\d*$/.test(n)) return "BJ";
  if (/^(NU|N0)\d*$/.test(n) || n.includes("NIU")) return "NIU";
  if (/^BC\d*$/.test(n) || n.includes("BACCARAT")) return "BAC";
  if (n === "CLUB") return "CLUB";
  return null;
};

/** Stored game wins; name is a fallback; an unknown game becomes its own group. */
export const gameGroupOf = (name: string, game?: string | null): GameGroup => {
  const g = byGame(game);
  if (g) return g;
  const n = byName(name);
  if (n && GAME_GROUP_LABEL[n]) return n;
  const own = (game || name || "").trim();
  if (own && !GAME_GROUP_LABEL[own]) {
    GAME_GROUP_ORDER.push(own);
    GAME_GROUP_LABEL[own] = own;
    GAME_GROUP_TOTAL_LABEL[own] = `TOTAL ${own.toUpperCase()}`;
  }
  return own;
};

export const naturalCompare = (a: string, b: string) =>
  a.localeCompare(b, "en", { numeric: true, sensitivity: "base" });

/** Game groups present in a list of tables, in managed order. */
export const orderedGroupsFor = (items: Array<{ name: string; game?: string | null }>): GameGroup[] => {
  const present = new Set(items.map((i) => gameGroupOf(i.name, i.game)));
  return GAME_GROUP_ORDER.filter((g) => present.has(g));
};

/** Pure name-based hint (no side effects), used for "name vs game" warnings. */
export const groupFromName = (name: string): GameGroup | null => byName(name);
