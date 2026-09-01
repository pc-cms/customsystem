/**
 * Posting-date helpers for the Office section.
 *
 * The header month is a fixed working window. New entries default to today
 * when today falls inside that window, otherwise to the last day of the
 * selected window — so working in a past month never silently posts into the
 * current one.
 */
export const todayEatIso = () =>
  new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);

export function defaultPostingDate(range: { from: string; to: string }): string {
  const today = todayEatIso();
  if (today >= range.from && today <= range.to) return today;
  return today < range.from ? range.from : range.to;
}

/** True when the chosen date falls outside the currently selected window. */
export function isOutsideWindow(date: string, range: { from: string; to: string }) {
  return !!date && (date < range.from || date > range.to);
}
