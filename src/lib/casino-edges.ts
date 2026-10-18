/**
 * House edge defaults per game (decimal, e.g. 0.005 = 0.5%).
 * Used to compute Theoretical Win = drop * edge (or avg_bet * hands * edge).
 * Hard-coded for now; can later be moved to a `game_settings` table.
 */
export const HOUSE_EDGE: Record<string, number> = {
  Blackjack: 0.005,
  "American Roulette": 0.0526,
  "European Roulette": 0.027,
  "Texas Holdem": 0.025, // rake-based proxy
  Baccarat: 0.0106,
  Default: 0.02,
};

export function edgeFor(game: string | null | undefined): number {
  if (!game) return HOUSE_EDGE.Default;
  return HOUSE_EDGE[game] ?? HOUSE_EDGE.Default;
}

/** Theoretical win over avg bet & hands (preferred). */
export function theoFromHands(avgBet: number, hands: number, game?: string | null): number {
  return Math.round((avgBet || 0) * (hands || 0) * edgeFor(game));
}

/** Theoretical win from drop only (fallback when hands unknown). */
export function theoFromDrop(drop: number, game?: string | null): number {
  return Math.round((drop || 0) * edgeFor(game));
}

/** Hold % = (drop - cashout - comps) / drop. Returns null when drop=0. */
export function holdPct(drop: number, cashout: number, comps: number): number | null {
  if (!drop) return null;
  return ((drop - cashout - comps) / drop) * 100;
}
