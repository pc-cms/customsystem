/**
 * Single source of truth for the DISPLAYED metrics of the Dashboard TV
 * (Live view). Every visual style and the Company Total consume THIS module —
 * never their own formula.
 *
 * TODAY
 *  - Tables Drop   : compute_daily_diff (drop cache) — always available.
 *  - Tables Result : Chips Check live result while the day is open,
 *                    fin_day_closing.tables_result once the day is closed.
 *  - Slots Drop    : fresh ACE (<= 15 min) total_drop; else the closed day's
 *                    fin_day_closing.drop_slots; else unavailable ("—").
 *  - Slots Result  : fresh ACE net_win − active_credits; else the closed day's
 *                    fin_day_closing.cashdesk_win − players_card_balance;
 *                    else unavailable ("—").
 *  - Total         : STRICTLY displayed Tables + displayed Slots (a missing
 *                    slots source contributes nothing — never double-counted).
 *  - Hold %        : Result / Drop × 100, only when Drop > 0.
 *
 * MONTHLY (MTD) — closed Day Closing figures only, no ACE override.
 */
import type { CasinoDay, CasinoMetric } from "@/hooks/use-boss-dashboard";

export interface AceLiveSlots {
  fresh: boolean;
  totalDrop: number | null;
  /** System result from the gaming system — the Slots Result source. */
  netWin: number | null;
  /** Physical cash figure — used by wallets, NEVER by the dashboard result. */
  winCashdesk: number | null;
  activeCredits: number | null;
  ageMs: number | null;
  periodLabel: string | null;
}

export interface DisplayedToday {
  tables: CasinoMetric;
  slots: CasinoMetric;
  total: CasinoMetric;
  /** false → render "—" for the slots drop cell. */
  slotsDropAvailable: boolean;
  /** false → render "—" for the slots result / hold cells. */
  slotsResultAvailable: boolean;
  /** Convenience: at least one slots figure exists. */
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
 * Pure function — unit-testable, shared by every style and the company total.
 */
export function deriveDisplayedToday(
  day: CasinoDay | undefined,
  ace?: AceLiveSlots | null,
): DisplayedToday | null {
  if (!day) return null;

  const aceFresh = !!ace?.fresh;
  const aceResult =
    aceFresh && ace!.netWin != null ? ace!.netWin - (ace!.activeCredits ?? 0) : null;
  const aceDrop = aceFresh && ace!.totalDrop != null ? ace!.totalDrop : null;
  const usesAce = aceResult != null || aceDrop != null;

  // Slots drop: ACE first, then the closed day's figure, else unavailable.
  const slotsDrop = aceDrop != null ? aceDrop : day.slotsAvailable ? day.slots.drop : null;
  // Slots result: ACE net_win − credits first, then the closed day's
  // cashdesk_win − players_card_balance.
  const slotsResult =
    aceResult != null ? aceResult : day.slotsAvailable ? day.slots.result : null;

  const slots: CasinoMetric = {
    drop: slotsDrop ?? 0,
    result: slotsResult ?? 0,
    headCount: 0,
    hold: hold(slotsDrop ?? 0, slotsResult ?? 0),
  };

  const tables = day.live;

  // Total = displayed Tables + displayed Slots. Nothing else, ever.
  const totalDrop = tables.drop + (slotsDrop ?? 0);
  const totalResult = tables.result + (slotsResult ?? 0);

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
    slotsDropAvailable: slotsDrop != null,
    slotsResultAvailable: slotsResult != null,
    slotsAvailable: slotsDrop != null || slotsResult != null,
    usesAce,
    aceHint: usesAce
      ? `ACE Live · ${Math.max(0, Math.round((ace?.ageMs ?? 0) / 60000))}m${
          ace?.periodLabel ? ` · ${ace.periodLabel}` : ""
        }`
      : null,
    aceCreditsHint:
      aceFresh && ace?.activeCredits != null
        ? `Credits ${moneyHint(ace.activeCredits)}`
        : null,
  };
}

/**
 * Monthly (MTD) displayed metrics — Tables / Slots / TOTAL.
 * Sources: `CasinoDay.mtdTables` / `mtdSlots` (closed Day Closing figures,
 * slots result = Σ(cashdesk_win − players_card_balance)). No ACE override for MTD.
 */
export function deriveDisplayedMonthly(day: CasinoDay | undefined): DisplayedToday | null {
  if (!day) return null;
  const tables = day.mtdTables;
  const slots = day.mtdSlots;
  // Availability = a monthly slots SOURCE record exists (closed Day Closing /
  // closed cage-slots shift). A closed 0 is DATA → 0 and 0.0%; no source → `—`.
  const available = day.mtdSlotsAvailable;

  const drop = tables.drop + slots.drop;
  const result = tables.result + slots.result;
  return {
    tables,
    slots,
    total: { drop, result, headCount: 0, hold: hold(drop, result) },
    slotsDropAvailable: available,
    slotsResultAvailable: available,
    slotsAvailable: available,
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

/** Company Total = exact sum of the DISPLAYED casino card totals. */
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
