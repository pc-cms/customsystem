// Central currency & chip configuration
export const CURRENCY = "TZS";
export const CURRENCY_SYMBOL = "TZS";

// Supported currencies
export const CURRENCIES = ["TZS", "USD", "EUR", "GBP", "KES"] as const;
export type SupportedCurrency = typeof CURRENCIES[number];

// Currency symbols for display
export const CURRENCY_SYMBOLS: Record<string, string> = {
  TZS: "TZS",
  USD: "$",
  EUR: "€",
  GBP: "£",
  KES: "KSh",
};

// Default exchange rates (TZS per 1 unit)
export const DEFAULT_EXCHANGE_RATES: Record<string, number> = {
  USD: 2500,
  EUR: 2700,
  GBP: 3200,
  KES: 18,
};

// Cash denominations per currency
// Cash denominations per currency (banknotes only — no coin grids).
// EUR 500 is kept: first-series notes remain legal tender and hold value.
export const CASH_DENOMS: Record<string, number[]> = {
  TZS: [10_000, 5_000, 2_000, 1_000],
  USD: [100, 50, 20, 10, 5, 2, 1],
  EUR: [500, 200, 100, 50, 20, 10, 5],
  GBP: [50, 20, 10, 5],
  KES: [1000, 500, 200, 100, 50],
};

// Coin denominations per currency. Counted separately from banknotes but stored
// in the same denomination map (fractional keys such as "0.5" are supported by
// the `_sum_denoms` DB helper, which casts keys to numeric).
export const COIN_DENOMS: Record<string, number[]> = {
  TZS: [],
  USD: [1, 0.5, 0.25, 0.1, 0.05],
  EUR: [2, 1, 0.5, 0.2, 0.1],
  GBP: [2, 1, 0.5, 0.2, 0.1],
  KES: [40, 20, 10, 5, 1],
};

/**
 * Notes + coins for a currency, notes first (used by read-only views/reports).
 * De-duplicated: a value present as BOTH a note and a coin (e.g. USD 1) must
 * appear once, otherwise report rows double-count that denomination.
 */
export const allDenoms = (currency: string): number[] =>
  Array.from(new Set([...(CASH_DENOMS[currency] || []), ...(COIN_DENOMS[currency] || [])]));


/** True when the currency is counted with fractional (coin) precision. */
export const hasCoins = (currency: string): boolean => (COIN_DENOMS[currency] || []).length > 0;

/** Decimal places used for amounts in this currency (TZS = whole numbers). */
export const currencyDecimals = (currency: string): number => (currency === "TZS" ? 0 : 2);

// Non-TZS currencies (for exchange rate inputs)
export const FOREIGN_CURRENCIES = CURRENCIES.filter(c => c !== "TZS");


export const CHIP_DENOMS = [10_000_000, 5_000_000, 1_000_000, 500_000, 100_000, 50_000, 25_000, 10_000, 5_000, 2_000, 1_000, 500] as const;

export const CHIP_COLORS: Record<number, string> = {
  500: "bg-red-600 text-white",
  1_000: "bg-blue-600 text-white",
  2_000: "bg-green-600 text-white",
  5_000: "bg-purple-600 text-white",
  10_000: "bg-yellow-500 text-black",
  25_000: "bg-orange-500 text-white",
  50_000: "bg-pink-600 text-white",
  100_000: "bg-black text-white border border-white/20",
  500_000: "bg-teal-600 text-white",
  1_000_000: "bg-amber-400 text-black",
  5_000_000: "bg-rose-700 text-white",
  10_000_000: "bg-indigo-700 text-white",
};

export const formatChipLabel = (value: number): string => {
  if (value >= 1_000_000) return `${value / 1_000_000}M`;
  if (value >= 1_000) return `${value / 1_000}K`;
  return String(value);
};

// Format a cash denomination label. TZS uses K/M (chip-style); other
// currencies show the bare number with space-separated thousands (e.g. "1 000").
// Coin denominations below 1 keep their decimals ("0.50", "0.05").
// Currency symbol is NOT included — the section total below shows the currency.
export const formatCashDenomLabel = (denom: number, currency: string): string => {
  if (currency === "TZS") return formatChipLabel(denom);
  if (!Number.isInteger(denom)) return denom.toFixed(2);
  return formatNumberSpaces(denom);
};

// Format number with space-separated thousands (global rule: no commas or dots)
export const formatNumberSpaces = (num: number): string => {
  if (num === 0) return "0";
  const isNeg = num < 0;
  const abs = Math.abs(Math.round(num));
  const str = abs.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return isNeg ? `-${str}` : str;
};

// Space-separated thousands with a fixed number of decimals ("1 250.50").
export const formatNumberSpacesDecimals = (num: number, decimals = 2): string => {
  if (!Number.isFinite(num)) return "0";
  const isNeg = num < 0;
  const fixed = Math.abs(num).toFixed(decimals);
  const [int, frac] = fixed.split(".");
  const str = int.replace(/\B(?=(\d{3})+(?!\d))/g, " ") + (frac ? `.${frac}` : "");
  return isNeg ? `-${str}` : str;
};

/** Currency-aware amount: TZS whole, foreign currencies with 2 decimals. */
export const formatAmount = (num: number, currency: string = "TZS"): string =>
  currency === "TZS" ? formatNumberSpaces(num) : formatNumberSpacesDecimals(num, 2);

export const formatCurrency = (amount: number, currency: string = "TZS"): string => {
  // Hide the default TZS prefix to save horizontal space; show symbol only for foreign currencies.
  if (currency === "TZS") return formatNumberSpaces(amount);
  const sym = CURRENCY_SYMBOLS[currency] || currency;
  return `${sym} ${formatNumberSpacesDecimals(amount, 2)}`;
};

// Compact number for narrow screens: 1 250 000 -> "1.25M", 12 500 -> "12.5K"
// Drops trailing ".0". Negatives preserved. Below 1000 shown as-is.
export const formatNumberCompact = (num: number): string => {
  if (!num) return "0";
  const isNeg = num < 0;
  const abs = Math.abs(num);
  let out: string;
  if (abs >= 1_000_000) {
    const v = abs / 1_000_000;
    out = (v >= 100 ? v.toFixed(0) : v.toFixed(2).replace(/\.?0+$/, "")) + "M";
  } else if (abs >= 1_000) {
    const v = abs / 1_000;
    out = (v >= 100 ? v.toFixed(0) : v.toFixed(1).replace(/\.0$/, "")) + "K";
  } else {
    out = String(Math.round(abs));
  }
  return isNeg ? `-${out}` : out;
};

// Parse a space-formatted string back to number
export const parseSpacedNumber = (str: string): number => {
  return Number(str.replace(/\s/g, "")) || 0;
};

// Format an input value with spaces as user types
export const formatInputWithSpaces = (value: string): string => {
  const digits = value.replace(/[^\d]/g, "");
  if (!digits) return "";
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
};

// ============ TABLE STRUCTURE ============
export interface TableConfig {
  name: string;
  game: string;
  roles: string[];
  chipCount: number;
}

// Table roles by game type
export const TABLE_ROLES: Record<string, string[]> = {
  "Texas Holdem": ["P", "Pi"],
  "Blackjack": ["BJ", "BJi"],
  "American Roulette": ["AR", "ARi", "ARc"],
  "Club Poker": ["CP"],
};

// All possible breaklist roles (BR = break, TR = training, SRT = sorting, CLS = closing, S = sick — fills until shift end)
export const ALL_ROLES = ["P", "Pi", "BJ", "BJi", "AR", "ARi", "ARc", "CP", "BR", "TR", "SRT", "CLS", "S", "LT"] as const;

// Chip distribution per location type
export const CHIP_DISTRIBUTION = {
  card: 20,
  roulette: 40,
  cashier: 50,
  safe: 100,
} as const;

// Role display colors — light mode uses solid pastels, dark mode uses semi-transparent
export const ROLE_COLORS: Record<string, string> = {
  P: "bg-violet-100 text-violet-800 dark:bg-violet-600/25 dark:text-violet-300",
  Pi: "bg-violet-50 text-violet-700 dark:bg-violet-500/20 dark:text-violet-200",
  BJ: "bg-sky-100 text-sky-800 dark:bg-sky-600/25 dark:text-sky-300",
  BJi: "bg-sky-50 text-sky-700 dark:bg-sky-500/20 dark:text-sky-200",
  AR: "bg-emerald-100 text-emerald-800 dark:bg-emerald-600/20 dark:text-emerald-400",
  ARi: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  ARc: "bg-teal-50 text-teal-700 dark:bg-emerald-400/15 dark:text-emerald-200",
  CP: "bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-600/25 dark:text-fuchsia-300",
  BR: "bg-muted text-muted-foreground",
  // Training — distinct cyan, learning-on-the-floor position
  TR: "bg-cyan-100 text-cyan-800 dark:bg-cyan-500/25 dark:text-cyan-200",
  // Sorting (SRT) and Closing (CLS) — neutral operational positions, distinct from BR
  SRT: "bg-amber-100 text-amber-800 dark:bg-amber-500/25 dark:text-amber-200",
  CLS: "bg-rose-100 text-rose-800 dark:bg-rose-500/25 dark:text-rose-200",
  // Sick — neutral slate, not used by any other role/category
  S: "bg-slate-200 text-slate-700 dark:bg-slate-600/30 dark:text-slate-300",
  // Late — orange, deducts time from shift attendance per slot (20 min each)
  LT: "bg-orange-200 text-orange-800 dark:bg-orange-500/30 dark:text-orange-200",
};

// Get roles available for a specific table
export const getRolesForTable = (tableName: string, game: string): string[] => {
  const baseRoles = TABLE_ROLES[game] || [];
  return baseRoles.map(role => role);
};
