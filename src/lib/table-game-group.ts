/** Single game-type classifier for tables, shared by every screen.
 * Classifies by table name first (tables are never renamed; stored game types
 * are not always reliable), then falls back to the stored game field. */
export type GameGroup = "AR" | "PK" | "BJ" | "NIU" | "BAC" | "CLUB" | "OTHER";

export const GAME_GROUP_ORDER: GameGroup[] = ["AR", "PK", "BJ", "NIU", "BAC", "CLUB", "OTHER"];

export const GAME_GROUP_LABEL: Record<GameGroup, string> = {
  AR: "American Roulette",
  PK: "Poker",
  BJ: "Blackjack",
  NIU: "Niu Niu",
  BAC: "Baccarat",
  CLUB: "Club Poker",
  OTHER: "Other Games",
};

export const GAME_GROUP_TOTAL_LABEL: Record<GameGroup, string> = {
  AR: "TOTAL ARs",
  PK: "TOTAL POKER",
  BJ: "TOTAL BJ",
  NIU: "TOTAL NIU NIU",
  BAC: "TOTAL BACCARAT",
  CLUB: "TOTAL CLUB",
  OTHER: "TOTAL OTHER",
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

const byGame = (raw?: string | null): GameGroup => {
  const g = (raw || "").trim().toLowerCase();
  if (g.includes("roulette")) return "AR";
  if (g === "club poker") return "CLUB";
  if (["poker", "texas holdem", "omaha", "plo"].includes(g)) return "PK";
  if (g.includes("blackjack")) return "BJ";
  if (g.includes("niu")) return "NIU";
  if (g.includes("baccarat")) return "BAC";
  return "OTHER";
};

export const gameGroupOf = (name: string, game?: string | null): GameGroup =>
  byName(name) ?? byGame(game);

export const naturalCompare = (a: string, b: string) =>
  a.localeCompare(b, "en", { numeric: true, sensitivity: "base" });
