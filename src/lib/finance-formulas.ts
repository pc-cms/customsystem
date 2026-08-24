/**
 * Canonical finance formulas — the ONLY place where the monthly profit /
 * cash-position arithmetic lives on the client. They mirror the SQL in
 * `fin_month_finance` 1:1 so the UI, the export and the DB never disagree.
 *
 * See docs/FINANCE-FORMULAS.md.
 */

/** OPEN month: Budget + all Unplanned Expenses of the month + outstanding Liabilities. */
export const forecastCostBase = (input: {
  budget: number;
  unplannedTotal: number;
  liabilitiesClosing: number;
}) => Number(input.budget || 0) + Number(input.unplannedTotal || 0) + Number(input.liabilitiesClosing || 0);

/**
 * OPEN month Expected Profit =
 *   Total Income − Budget − Unplanned − Liabilities − Collections.
 * Collections reduce the REMAINING expected profit of an open month.
 * A CLOSED month keeps its frozen Final Profit — later collections never rewrite it.
 */
export const expectedProfit = (totalIncome: number, costBase: number, collections = 0) =>
  Number(totalIncome || 0) - Number(costBase || 0) - Number(collections || 0);

/** Manager Bonus (forecast) = max(0, 5% × (Total Income − Budget)). Unplanned/Liabilities never net it. */
export const managerBonusForecast = (input: {
  totalIncome: number;
  budget: number;
}) => Math.max(0, 0.05 * (Number(input.totalIncome || 0) - Number(input.budget || 0)));


/**
 * CLOSED month: Budget is replaced by Total Actual Expenses, but the Unplanned
 * register NEVER disappears — it is a separate permanent register. Only rows
 * already linked to an Actual Expense (`expense_id`) drop out of the separate
 * subtraction, so nothing is counted twice.
 *
 * Final Profit = Total Income − Total Actual Expenses
 *              − Unplanned not represented inside Actual Expenses
 *              − Closing outstanding Liabilities.
 */
export const finalProfit = (input: {
  totalIncome: number;
  expensesActual: number;
  unplannedNotInActual: number;
  liabilitiesClosing: number;
}) =>
  Number(input.totalIncome || 0) -
  Number(input.expensesActual || 0) -
  Number(input.unplannedNotInActual || 0) -
  Number(input.liabilitiesClosing || 0);

/** CLOSED month: 5% of (Total Income − Total Actual Expenses) — the frozen snapshot value. */
export const managerBonusFinal = (input: {
  totalIncome: number;
  expensesActual: number;
}) =>
  Math.max(0, 0.05 * (Number(input.totalIncome || 0) - Number(input.expensesActual || 0)));

/**
 * Deposits — money physically held in the cage but owed to third parties.
 * Signed/net sum of Tips & Bonuses + JP + Card Balance + Miss Chips + Miss Cards.
 */
export const deposits = (i: {
  tipsBonus: number;
  jp: number;
  cardBalance: number;
  missChips: number;
  missCards: number;
}) =>
  Number(i.tipsBonus || 0) +
  Number(i.jp || 0) +
  Number(i.cardBalance || 0) +
  Number(i.missChips || 0) +
  Number(i.missCards || 0);

/**
 * Cash on hand — NOT net worth.
 *
 * Cash Position = Basic Float + Total Income − Deposits + Office + Investment
 *               + Intercompany Cash Effect − Actual Expenses − Collections
 *               − Actual Liability Payments.
 *
 * Deposits are subtracted exactly once. Unpaid Unplanned Expenses and
 * outstanding Liabilities are NEVER subtracted.
 */
export const cashPosition = (i: {
  floatCurrent: number;
  totalIncome: number;
  deposits: number;
  investment: number;
  office: number;
  intercompanyCash: number;
  expensesActual: number;
  liabilityPayments: number;
  collections: number;
}) =>
  Number(i.floatCurrent || 0) +
  Number(i.totalIncome || 0) -
  Number(i.deposits || 0) +
  Number(i.investment || 0) +
  Number(i.office || 0) +
  Number(i.intercompanyCash || 0) -
  Number(i.expensesActual || 0) -
  Number(i.collections || 0) -
  Number(i.liabilityPayments || 0);

/** Available for Collection = max(0, remaining profit) — collections already netted out. */
export const availableForCollection = (profit: number, collections = 0) =>
  Math.max(0, Number(profit || 0) - Number(collections || 0));


/** Opening + New − Repayments = Closing. */
export const liabilityClosing = (opening: number, added: number, repaid: number) =>
  Number(opening || 0) + Number(added || 0) - Number(repaid || 0);

/** Opening Basic Float + Σ signed adjustments = Current Basic Float. */
export const floatCurrent = (opening: number, adjustments: number) =>
  Number(opening || 0) + Number(adjustments || 0);

/** A float adjustment is rejected when the resulting Basic Float would go negative. */
export const floatAdjustAllowed = (current: number, delta: number) =>
  Number(current || 0) + Number(delta || 0) >= -0.5;

/** A collection is rejected when it exceeds what is still available. */
export const collectionAllowed = (amount: number, available: number) =>
  Number(amount || 0) > 0 && Number(amount || 0) <= Number(available || 0) + 0.5;
