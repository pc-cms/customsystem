import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  signedWalletTxTzs,
  walletTxIsIn,
  isWalletAdjustment,
  WALLET_TX_NEGATIVE_KINDS,
} from "@/lib/wallet-tx-sign";

/**
 * Canonical wallet kinds allowed by the DB CHECK constraint
 * `fin_wallet_tx_kind_check`. Keep in sync with the migration.
 */
const CANONICAL_KINDS = [
  "income", "expense", "change_in", "change_out",
  "transfer_in", "transfer_out", "reversal", "adjustment",
] as const;

const FORBIDDEN_KINDS = ["adjustment_in", "adjustment_out"];

describe("wallet tx sign helper", () => {
  it("adjustment carries its direction in the signed amount", () => {
    expect(signedWalletTxTzs({ kind: "adjustment", amount_tzs: 500_000 })).toBe(500_000);
    expect(signedWalletTxTzs({ kind: "adjustment", amount_tzs: -500_000 })).toBe(-500_000);
    expect(isWalletAdjustment("adjustment")).toBe(true);
  });

  it("expense-like kinds always drain the wallet regardless of stored sign", () => {
    for (const kind of WALLET_TX_NEGATIVE_KINDS) {
      expect(signedWalletTxTzs({ kind, amount_tzs: 300_000 })).toBe(-300_000);
      expect(signedWalletTxTzs({ kind, amount_tzs: -300_000 })).toBe(-300_000);
      expect(walletTxIsIn({ kind, amount_tzs: 300_000 })).toBe(false);
    }
  });

  it("legacy adjustment_out rows are not treated as income", () => {
    // Direction of a legacy row is carried by the amount; a negative legacy
    // amount must never read as money in.
    expect(walletTxIsIn({ kind: "adjustment_out", amount_tzs: -100 })).toBe(false);
    expect(signedWalletTxTzs({ kind: "adjustment_out", amount_tzs: -100 })).toBe(-100);
  });

  it("no forbidden kind is referenced anywhere in the frontend", () => {
    const root = path.resolve(__dirname, "..");
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) { walk(p); continue; }
        if (!/\.(ts|tsx)$/.test(e.name)) continue;
        if (p.includes(path.join("src", "test"))) continue;
        const src = fs.readFileSync(p, "utf8");
        for (const k of FORBIDDEN_KINDS) {
          if (src.includes(`"${k}"`) || src.includes(`'${k}'`)) hits.push(`${p}: ${k}`);
        }
      }
    };
    walk(root);
    expect(hits).toEqual([]);
  });

  it("canonical kind list stays a superset of what the helper classifies", () => {
    for (const k of WALLET_TX_NEGATIVE_KINDS) {
      expect(CANONICAL_KINDS as readonly string[]).toContain(k as string);
    }
  });
});
