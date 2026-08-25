/**
 * Single source of truth for the DISPLAYED "Today" metrics of the Boss
 * Dashboard TV.
 *
 * Business rules are unchanged — this only removes the duplicated ACE override
 * formula that previously lived inside `CasinoDoubleBlock` while
 * `CompanyTotalPanel` summed the raw (non-overridden) figures, producing a
 * company total that did not match the sum of the visible cards.
 *
 * Rules (unchanged):
 *  - A FRESH (≤15 min) ACE live feed provides the displayed slots drop/result.
 *    Slots result = win_cashdesk − active_credits.
 *  - Without a fresh ACE feed, slots come ONLY from a closed business day.
 *  - Total = tables (live/closed) + displayed slots.
 */
import type { CasinoDay, CasinoMetric } from "@/hooks/use-boss-dashboard";

export interface AceLiveSlots {
  fresh: boolean;
  totalDrop: number | null;
  winCashdesk: number | null;
  activeCredits: number | null;
  ageMs: number | null;
  periodLabel: string | null;
}

export interface DisplayedToday {
  tables: CasinoMetric;
  slots: CasinoMetric;
  total: CasinoMetric;
  slotsAvailable: boolean;
  usesAce: boolean;
  aceHint: string | null;
  aceCreditsHint: string | null;
}

const hold = (drop: number, result: number) => (drop > 0 ? (result / drop) * 100 : 0);

const moneyHint = (n: number) =>
  Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");

/**
 * Derive the metrics actually rendered on a casino card for "Today".
 * Pure function — unit-testable, shared by the card and the company total.
 */
export function deriveDisplayedToday(
  day: CasinoDay | undefined,
  ace?: AceLiveSlots | null,
): DisplayedToday | null {
  if (!day) return null;

  const aceResult =
    ace?.fresh && ace.winCashdesk != null ? ace.winCashdesk - (ace.activeCredits ?? 0) : null;
  const usesAce = !!ace?.fresh && ace.totalDrop != null && aceResult != null;

  const slots: CasinoMetric = usesAce
    ? {
        ...day.slots,
        drop: ace!.totalDrop as number,
        result: aceResult as number,
        hold: hold(ace!.totalDrop as number, aceResult as number),
      }
    : day.slots;

  const tables = day.live;

  const totalDrop = usesAce ? day.total.drop + slots.drop : day.total.drop;
  const totalResult = usesAce
    ? day.total.result - day.slots.result + slots.result
    : day.total.result;

  const total: CasinoMetric = {
    drop: totalDrop,
    result: totalResult,
    headCount: day.total.headCount,
    hold: hold(totalDrop, totalResult),
  };

  return {
    tables,
    slots,
    total,
    slotsAvailable: usesAce || day.slotsAvailable,
    usesAce,
    aceHint: usesAce
      ? `ACE Live · ${Math.max(0, Math.round((ace?.ageMs ?? 0) / 60000))}m${
          ace?.periodLabel ? ` · ${ace.periodLabel}` : ""
        }`
      : null,
    aceCreditsHint:
      ace?.fresh && ace.activeCredits != null
        ? `Credits ${moneyHint(ace.activeCredits)}`
        : null,
  };
}

/**
 * Monthly (MTD) displayed metrics — Tables / Slots / TOTAL.
 * Sources come straight from `CasinoDay.mtdTables` / `mtdSlots`, which mirror
 * Analytics → Statistics (Total Report) 1:1. No ACE live override here.
 */
export function deriveDisplayedMonthly(day: CasinoDay | undefined): DisplayedToday | null {
  if (!day) return null;
  const tables = day.mtdTables;
  const slots = day.mtdSlots;
  const drop = tables.drop + slots.drop;
  const result = tables.result + slots.result;
  return {
    tables,
    slots,
    total: { drop, result, headCount: 0, hold: hold(drop, result) },
    slotsAvailable: slots.drop !== 0 || slots.result !== 0,
    usesAce: false,
    aceHint: null,
    aceCreditsHint: null,
  };
}

export interface CompanyToday {
  drop: number;
  result: number;
  headCount: number;
  hold: number;
}

/** Company Total Today = exact sum of the DISPLAYED casino card totals. */
export function sumDisplayedToday(items: (DisplayedToday | null | undefined)[]): CompanyToday {
  const acc = items.reduce(
    (a, d) => {
      if (!d) return a;
      a.drop += d.total.drop;
      a.result += d.total.result;
      a.headCount += d.total.headCount;
      return a;
    },
    { drop: 0, result: 0, headCount: 0 },
  );
  return { ...acc, hold: hold(acc.drop, acc.result) };
}

