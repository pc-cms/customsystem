/**
 * Canonical Cash Desk Formula — single source of truth (mirrors DB
 * `compute_shift_balance_from_row`). Used for live preview during Close Shift.
 *
 *   Cash Desk Result = ΔCash + Expenses + Collection − AddFloat
 *                    + SlotsOut − SlotsIn          (NO miss, NO tips, NO cashless)
 *   Shift Balance    = Cash Desk Result − Tables Result − Miss
 *
 * ΔCash is computed from CASH + BANK only (mobile balance excluded).
 *
 * TIPS and CASHLESS IN/OUT are fully balance-neutral — log-only. The printed
 * "Balance" column for cashless reads ONLY the manual closer entry from
 * `closing_count.totals.mobile_<provider>`; it is never derived from NET.
 */
export type CageBalanceInputs = {
  openingCash: number;          // opening cash + bank (no mobile)
  closingCash: number;          // closing cash + bank (no mobile)
  expenses: number;
  collection: number;
  addFloat: number;
  slotsIn: number;
  slotsOut: number;
  cashlessIn: number;
  cashlessOut: number;
  miss: number;
  tablesResult: number;
  tips?: number; // accepted for backward compat — ignored in formula
};

export type CageBalanceResult = {
  deltaCash: number;
  cashDeskResult: number;
  shiftBalance: number;
};

export const computeShiftBalance = (i: CageBalanceInputs): CageBalanceResult => {
  const deltaCash = i.closingCash - i.openingCash;
  const cashDeskResult =
    deltaCash + i.expenses + i.collection - i.addFloat
    + i.slotsOut - i.slotsIn
    + (i.cashlessIn || 0) - (i.cashlessOut || 0);
  const shiftBalance = cashDeskResult - i.tablesResult - i.miss;
  return { deltaCash, cashDeskResult, shiftBalance };
};


/**
 * Cage Slots balance — canonical formula (mirrors DB
 * `compute_slots_shift_balance_from_row`).
 *
 *   ΔCash            = ClosingCash − OpeningCash               (display only)
 *   Cash Desk Result = ClosingCash + Expenses − Ace Fill
 *                    + Collection + LG_Out − LG_In
 *   Cards Miss       = (OpeningCards − ClosingCards) × CardValue
 *   Slots Result     = System Result
 *   Expected         = System Result
 *   Shift Balance    = Cash Desk Result − System Result − Cards Miss
 *
 * Tips CD (`tipsCdIn`, `tipsCdPayout`) are LOG-ONLY: kept on the shift report
 * for visibility but excluded from CDR and Balance. Cashiers must keep tips
 * physically outside the drawer cash count.
 *
 *   Cashless Balance = Cashless IN − Cashless OUT   (derived, display only)
 *   Cashless Final   = manual entry, PRINT ONLY — never used in any formula.
 *
 * `systemResult` is entered MANUALLY by the slots cashier (raw system readout).
 * `addFloat` = Ace Fill (ACE System Fill).
 */
export type SlotsBalanceInputs = {
  openingCash: number;
  closingCash: number;
  expenses: number;
  collection: number;
  addFloat: number;
  lgIn: number;
  lgOut: number;
  cashlessIn: number;
  cashlessOut: number;
  cashlessFinal: number;
  openingCards: number;
  closingCards: number;
  cardValue: number;
  systemResult: number;
  tipsCdIn?: number;       // log-only, ignored in formula
  tipsCdPayout?: number;   // log-only, ignored in formula
};

export type SlotsBalanceResult = {
  deltaCash: number;
  cashDeskResult: number;
  cardsMiss: number;
  slotsResult: number;
  systemResult: number;
  cashlessBalance: number;
  cashlessFinal: number;
  expected: number;
  tipsCdIn: number;
  tipsCdPayout: number;
  shiftBalance: number;
};

export const computeSlotsShiftBalance = (i: SlotsBalanceInputs): SlotsBalanceResult => {
  const deltaCash = i.closingCash - i.openingCash;
  const tipsCdIn = i.tipsCdIn || 0;
  const tipsCdPayout = i.tipsCdPayout || 0;
  // Tips fully neutral: closing cash must NOT include tips physically.
  const cashDeskResult =
    i.closingCash + i.expenses - i.addFloat + i.collection
    + i.lgOut - i.lgIn;
  const cardsMiss = (i.openingCards - i.closingCards) * i.cardValue;
  const slotsResult = i.systemResult;
  const expected = i.systemResult;
  const shiftBalance = cashDeskResult - i.systemResult - cardsMiss;
  return {
    deltaCash,
    cashDeskResult,
    cardsMiss,
    slotsResult,
    systemResult: i.systemResult,
    cashlessBalance: i.cashlessIn - i.cashlessOut,
    cashlessFinal: i.cashlessFinal,
    expected,
    tipsCdIn,
    tipsCdPayout,
    shiftBalance,
  };
};
