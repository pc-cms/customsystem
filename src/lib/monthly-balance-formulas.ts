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
    formula: "Tables result + Slots result (net of card balance) + Bar result",
    source: "Shift closings (live), slots day closing, POS/bar result",
    total: "sum",
  },
  live_cash_result: {
    formula: "Live cage cash-desk result of the day",
    source: "shifts.cash_desk_result (live cage shifts)",
    total: "sum",
  },
  tables_result: {
    formula: "Sum of table results (Drop + Credit − Fill ± chips)",
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

    formula: "Chip miss = cage chip delta vs. declared chips",
    source: "Chip checks / cage closing (07:00 rollover)",
    total: "sum",
  },
  slots_diff: {
    formula: "Players card balance of the day",
    source: "fin_day_closing.players_card_balance",
    total: "sum",
  },
  cage_casino: {
    formula: "Live cage (cash + cashless) + Slots cage (cash + cashless) at closing",
    source: "shifts closing cash & cashless providers, cage_slots_shifts",
    total: "stock",
  },
  transfer_cage_manager: {
    formula: "Transfers cage → manager safe (incoming leg matched to a cage outgoing leg)",
    source: "fin_wallet_tx (kind = transfer)",
    total: "sum",
  },
  cage_manager: {
    formula: "Manager (office) safe balance at end of day",
    source: "Office safe wallet: starting float + all posted movements",
    total: "stock",
  },
  transfer_bank: {
    formula: "Transfers into bank accounts (incoming leg)",
    source: "fin_wallet_tx (kind = transfer, bank wallets)",
    total: "sum",
  },
  bank_tzs: {
    formula: "Bank balance in TZS — manual figure when entered, else wallet running balance",
    source: "fin_legacy_balance.bank_account / bank wallets (TZS)",
    total: "stock",
  },
  bank_usd: {
    formula: "Bank balance in USD × daily rate — manual figure when entered",
    source: "fin_legacy_balance.bank_account_usd / bank wallets (USD)",
    total: "stock",
  },
  expenses: {
    formula: "Approved expenses of the business day (cage + office)",
    source: "expenses (approved), posted on day closing",
    total: "sum",
  },
  office_total: {
    formula: "Office net = (+) money in − (−) money out",
    source: "fin_wallet_tx (external_income, collection)",
    total: "sum",
  },
  money_in: {
    formula: "Owner deposits into the business",
    source: "fin_wallet_tx (kind = external_income, positive)",
    total: "sum",
  },
  money_out: {
    formula: "Collections / owner withdrawals",
    source: "fin_wallet_tx (kind = collection)",
    total: "sum",
  },
  money_total: {
    formula: "Cage Casino + Cage Manager + Bank TZS + Bank USD",
    source: "Stock of all money at end of day",
    total: "stock",
  },
  balance: {
    formula: "Variance = Money (actual) − (yesterday Money + Result + IN − OUT − Expenses). Should be 0",
    source: "Derived control check",
    total: "stock",
  },
};

export const formulaText = (id: string): string | null => {
  const f = COLUMN_FORMULAS[id];
  if (!f) return null;
  return `${f.formula}\nSource: ${f.source}\nTotal: ${f.total === "sum" ? "sum of the month" : "last day of the month (stock)"}`;
};
