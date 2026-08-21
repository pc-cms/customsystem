/**
 * Canonical wallet taxonomy (Office > Wallets, Finance Hub compatible).
 * Groups drive the default UI ordering; canonical codes are the stable keys
 * Finance Hub maps against. Never rename a canonical code.
 */

export const WALLET_GROUPS = [
  "cash",
  "banks",
  "mobile_money",
  "digital_wallets",
  "selcom",
  "operational_safes",
  "legacy_other",
] as const;

export type WalletGroup = (typeof WALLET_GROUPS)[number];

export const WALLET_GROUP_LABELS: Record<WalletGroup, string> = {
  cash: "CASH",
  banks: "BANKS",
  mobile_money: "MOBILE MONEY",
  digital_wallets: "DIGITAL WALLETS",
  selcom: "SELCOM",
  operational_safes: "OPERATIONAL SAFES",
  legacy_other: "LEGACY / OTHER",
};

export const WALLET_GROUP_ORDER: Record<string, number> = WALLET_GROUPS.reduce(
  (acc, g, i) => ({ ...acc, [g]: i }),
  {} as Record<string, number>,
);

/** Default wallet kind offered when a group is picked in the create/edit dialog. */
export const WALLET_GROUP_KINDS: Record<WalletGroup, string[]> = {
  cash: ["cash"],
  banks: ["bank"],
  mobile_money: ["mobile_money"],
  digital_wallets: ["digital_wallet"],
  selcom: ["selcom"],
  operational_safes: ["safe", "cage"],
  legacy_other: ["cash", "bank", "mobile_money", "safe", "cage", "external", "digital_wallet", "selcom"],
};

/** Fallback classification for legacy rows that have no wallet_group yet. */
export const groupOfWallet = (w: { wallet_group?: string | null; kind?: string | null }): WalletGroup => {
  const g = w.wallet_group as WalletGroup | undefined;
  if (g && WALLET_GROUPS.includes(g)) return g;
  switch (w.kind) {
    case "cash":
      return "cash";
    case "bank":
      return "banks";
    case "mobile_money":
      return "mobile_money";
    case "digital_wallet":
      return "digital_wallets";
    case "selcom":
      return "selcom";
    case "safe":
    case "cage":
      return "operational_safes";
    default:
      return "legacy_other";
  }
};

export const walletGroupLabel = (g: string): string =>
  WALLET_GROUP_LABELS[g as WalletGroup] || "LEGACY / OTHER";
