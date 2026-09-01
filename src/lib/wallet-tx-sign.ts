/**
 * Wallet movement sign rule — single source of truth.
 *
 * `fin_wallet_tx.amount` stores expenses as POSITIVE numbers: the direction is
 * carried by `kind`, not by the sign. Every consumer (Wallets page, Casino
 * Monthly Balance, reports) must apply the same rule, otherwise expenses inflate
 * safe balances instead of draining them.
 */
export const WALLET_TX_NEGATIVE_KINDS = new Set([
  "expense",
  "manual_expense",
  "collection",
]);

/**
 * Manual Actual corrections booked from the Wallets "Add money / Take money"
 * buttons. They are stored as signed `adjustment` rows: they move the physical
 * (Actual) balance only and are NOT income / expense, and never touch Expected.
 */
export const WALLET_TX_ADJUSTMENT_KINDS = new Set(["adjustment"]);

export const isWalletAdjustment = (kind?: string | null) =>
  WALLET_TX_ADJUSTMENT_KINDS.has(String(kind));

/**
 * Which balance a movement actually moves.
 *   "expected" — income / expense / collection / transfers: the calculated balance.
 *   "actual"   — manual ADJ corrections of the physical (counted) balance.
 * Variance = Actual − Expected, so a row never moves both.
 */
export type WalletTxEffect = "expected" | "actual";

export const walletTxEffect = (kind?: string | null): WalletTxEffect =>
  isWalletAdjustment(kind) ? "actual" : "expected";


/** Direction of a movement for display purposes (true = money in). */
export const walletTxIsIn = (row: { kind?: string | null; amount_tzs?: number | string | null; amount?: number | string | null }) => {
  const kind = String(row.kind || "");
  if (WALLET_TX_NEGATIVE_KINDS.has(kind) || kind === "transfer_out" || kind === "change_out")
    return false;
  if (kind === "income" || kind === "transfer_in" || kind === "change_in")
    return true;
  return Number(row.amount_tzs ?? row.amount ?? 0) >= 0;
};



export interface WalletTxLike {
  kind?: string | null;
  amount?: number | string | null;
  amount_tzs?: number | string | null;
}

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Raw TZS magnitude of a movement (prefers the converted column). */
export const walletTxAmountTzs = (row: WalletTxLike): number =>
  row.amount_tzs != null ? num(row.amount_tzs) : num(row.amount);

/** Signed TZS effect of a movement on its wallet balance. */
export const signedWalletTxTzs = (row: WalletTxLike): number => {
  const raw = walletTxAmountTzs(row);
  return WALLET_TX_NEGATIVE_KINDS.has(String(row.kind)) ? -Math.abs(raw) : raw;
};
