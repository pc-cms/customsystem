export const TICKET_UNIT = 500_000;
export const ROUNDUP_THRESHOLD = 270_000;

/** Tickets for ONE day's result: 1 per full 500 000, +1 if remainder ≥ 270 000, x2 for a losing day. */
export const ticketsForResult = (result: number): number => {
  const abs = Math.abs(result);
  if (abs === 0) return 0;
  const full = Math.floor(abs / TICKET_UNIT);
  const base = full + (abs - full * TICKET_UNIT >= ROUNDUP_THRESHOLD ? 1 : 0);
  return result < 0 ? base * 2 : base;
};

/** Weekly tickets = sum of independent daily tickets. */
export const ticketsForDays = (dailyResults: number[]): number =>
  dailyResults.reduce((s, r) => s + ticketsForResult(r), 0);
