/**
 * Casino Monthly Balance — column provenance.
 *
 * Every column of the report explains where its number comes from. The text is
 * rendered in the column header tooltip and next to each footer total, so the
 * grid stays auditable without opening the code.
 */
export type ColumnFormula = {
  /** One-line formula. */
  formula: string;
  /** Where the raw data is read from. */
  source: string;
  /** How the Total footer row aggregates the column. */
  total: "sum" | "stock";
};

export const COLUMN_FORMULAS: Record<string, ColumnFormula> = {
  result: {
    formula: "Live Game result + Slots result (net of card balance) + Bar result",
    source: "Shift closings (live), slots day closing, POS/bar result",
    total: "sum",
  },
  live_cash_result: {
    formula: "Live cage cash-desk result of the day",
    source: "shifts.cash_desk_result (live cage shifts)",
    total: "sum",
  },
  tables_result: {
    formula: "Sum of Live Game table results (Drop + Credit − Fill ± chips)",
    source: "table_daily_results / shift table results",
    total: "sum",
  },
  slots_result: {
    formula: "Slots result of the day, net of players card balance",
    source: "fin_day_closing.slots_result − players_card_balance",
    total: "sum",
  },
  bar_result: {
    formula: "Bar / POS turnover of the day (void orders excluded)",
    source: "pos_orders.total_tzs",
    total: "sum",
  },

  diff_total: {
    formula: "Chip Diff + Slots Diff",
    source: "Chip checks + fin_day_closing.players_card_balance",
    total: "sum",
  },
  chip_difference: {

    formula: "Miss Chips of the day — same figure as the Miss Chips report (per day, not cumulative)",
    source: "shifts.closing_count.chip_miss_total (closed shifts, 07:00 rollover)",
    total: "sum",
  },
  slots_diff: {
    formula: "Players card balance of the day",
    source: "cage_slots_shifts.manual_slots_deposits (Statistics → Slots → Client Balance)",
    total: "sum",
  },
  cage_casino: {
    formula: "Running balance of cage_table + cage_slot wallets (TZS + USD at daily rate). Chips excluded.",
    source: "fin_wallet_tx + starting floats for wallets with kind = cage_table / cage_slot",
    total: "stock",
  },
  bank_total: {
    formula: "Bank TZS + Bank USD (converted at the daily rate)",
    source: "fin_day_balance_snapshot (record) or bank wallets running balance",
    total: "stock",
  },
  transfer_cage_manager: {
    formula: "Internal transfer cage → manager safe (incoming leg matched to a cage outgoing leg)",
    source: "fin_wallet_tx (kind = transfer)",
    total: "sum",
  },
  cage_manager: {
    formula: "Manager (office) safe balance at end of day — frozen from Record when day is closed",
    source: "fin_day_balance_snapshot.cage_manager, else office wallet running balance",
    total: "stock",
  },
  transfer_bank: {
    formula: "Transfers into bank accounts (incoming leg)",
    source: "fin_wallet_tx (kind = transfer, bank wallets)",
    total: "sum",
  },
  bank_tzs: {
    formula: "Bank balance in TZS — frozen from Record when day is closed",
    source: "fin_day_balance_snapshot.bank_tzs, else bank wallet running balance",
    total: "stock",
  },
  bank_usd: {
    formula: "Bank balance in USD × daily rate — frozen from Record when day is closed",
    source: "fin_day_balance_snapshot.bank_usd, else bank wallet running balance",
    total: "stock",
  },
  expenses: {
    formula: "Approved operating expenses (office immediately; cage only after day closing)",
    source: "expenses approved = true, not voided, not reversals",
    total: "sum",
  },
  jp: {
    formula: "Jackpot of the day — part of the Casino Result block, signed as recorded",
    source: "fin_other_incomes (source = JP)",
    total: "sum",
  },
  missed_cards: {
    formula: "Missed Cards (shortage) — part of Diff",
    source: "cage_slots_shifts.cards_miss",
    total: "sum",
  },
  collections: {
    formula: "Collection / owner withdrawals (reference column, part of Office Out)",
    source: "expenses in Collection category",
    total: "sum",
  },

  office_total: {
    formula: "Office net = (+) money in − (−) money out",
    source: "fin_other_incomes split by sign (positive → +, negative → −)",
    total: "sum",
  },
  money_in: {
    formula: "Positive other incomes of the day",
    source: "fin_other_incomes (amount > 0, JP excluded)",
    total: "sum",
  },
  money_out: {
    formula: "Negative other incomes of the day (absolute value)",
    source: "fin_other_incomes (amount < 0, JP excluded)",
    total: "sum",
  },
  money_total: {
    formula: "Cage Casino + Cage Manager + Bank TZS + Bank USD",
    source: "Stock of all money at end of day",
    total: "stock",
  },
  fin_result: {
    formula: "Casino Result (incl. JP) − Expenses ± Diff",
    source: "Derived from Result, Expenses and Diff",
    total: "sum",
  },
  balance: {
    formula: "Variance = Money yesterday (or Start) + Result ± Diff − Expenses ± Office − Money today",
    source: "Derived control check — ideal value is 0",
    total: "stock",
  },

};

export const formulaText = (id: string): string | null => {
  const f = COLUMN_FORMULAS[id];
  if (!f) return null;
  return `${f.formula}\nSource: ${f.source}\nTotal: ${f.total === "sum" ? "sum of the month" : "last day of the month (stock)"}`;
};
