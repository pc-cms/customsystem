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
