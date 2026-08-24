/**
 * Isolated adapters for finance figures that do NOT yet have an agreed
 * source of truth. They intentionally return real data when a reliable
 * structure exists and 0 otherwise — never fabricated values.
 *
 * When the definitions are finalised, connect them HERE only; every page
 * reads the numbers through `MonthlyReport.cash`.
 */

/**
 * Liabilities = money the casino owes.
 * Currently the only reliable structure is the intercompany transfer registry:
 * outstanding funding received (funding in − repayments out), as of period end.
 * Anything else (supplier debts, payroll arrears) has no agreed source yet.
 */
export const adaptLiabilities = (input: { intercompanyLiability: number }) =>
  Math.max(0, Number(input.intercompanyLiability || 0));

/**
 * Unplanned Expenses = approved spend outside the monthly budget.
 * DEFERRED: there is no approval/flag distinguishing "unplanned" spend today,
 * so this returns 0 and the UI shows an explicit placeholder instead of a
 * guessed number. Do not derive it from "actual > plan" — that is variance,
 * not unplanned spend.
 */
export const adaptUnplannedExpenses = (): number => 0;

/** True while `adaptUnplannedExpenses` has no real data source. */
export const UNPLANNED_EXPENSES_DEFERRED = true;
