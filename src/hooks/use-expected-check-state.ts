/**
 * useExpectedCheckState — derive per-denomination expected chip counters and
 * per-currency expected cash totals for the currently-open Live Game shift.
 *
 * Sources:
 *   - shift.opening_float.chips      → starting chip inventory (by denom).
 *   - shift.opening_float.cash       → starting cash (by currency → denom).
 *   - transactions (this shift):
 *       IN  → chips OUT of cage (subtract), money IN (add per currency).
 *       OUT → chips IN to cage  (add),      money OUT (subtract per currency).
 *
 * Cancelled transactions are ignored.
 *
 * NOTE: Expected cash is tracked per-currency as a total (not per denomination),
 * because transactions don't record the exact bill breakdown handed over —
 * only the amount and (for foreign IN) original currency + amount. Chip
 * expected is tracked per-denomination because chips ARE recorded that way.
 */
import { useMemo } from "react";
import type { Tables } from "@/integrations/supabase/types";
import { CURRENCIES } from "@/lib/currency";

export type ExpectedCheckState = {
  expectedChips: Record<number, number>;
  expectedCashByCurrency: Record<string, number>;
  hasOpening: boolean;
};

const asNumberRecord = (v: unknown): Record<number, number> => {
  if (!v || typeof v !== "object") return {};
  const out: Record<number, number> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (k === "_meta") continue;
    const denom = Number(k);
    const qty = Number(val);
    if (!isFinite(denom) || denom <= 0 || !isFinite(qty)) continue;
    out[denom] = (out[denom] || 0) + qty;
  }
  return out;
};

const asCurrencyCash = (v: unknown): Record<string, number> => {
  const out: Record<string, number> = {};
  if (!v || typeof v !== "object") return out;
  for (const [cur, denoms] of Object.entries(v as Record<string, unknown>)) {
    if (!denoms || typeof denoms !== "object") continue;
    let total = 0;
    for (const [d, qty] of Object.entries(denoms as Record<string, unknown>)) {
      total += Number(d) * Number(qty);
    }
    out[cur] = total;
  }
  return out;
};

export const useExpectedCheckState = (
  shift: Tables<"shifts"> | null | undefined,
  shiftTransactions: Tables<"transactions">[],
): ExpectedCheckState => {
  return useMemo(() => {
    const of = (shift?.opening_float || {}) as Record<string, unknown>;
    const hasOpening = !!of.chips || !!of.cash;
    const expectedChips = asNumberRecord(of.chips);
    const expectedCashByCurrency: Record<string, number> = {};
    for (const c of CURRENCIES) expectedCashByCurrency[c] = 0;
    Object.assign(expectedCashByCurrency, asCurrencyCash(of.cash));

    for (const tx of shiftTransactions) {
      if ((tx as any).cancelled_at) continue;
      const type = String(tx.type);
      const isIn = type === "in" || type === "buy";
      const isOut = type === "out" || type === "cashout";
      if (!isIn && !isOut) continue;

      const chipsPayload = (tx.chips || {}) as Record<string, any>;
      const meta = (chipsPayload._meta || {}) as Record<string, any>;
      const chipMap = asNumberRecord(chipsPayload);

      // Chip counters
      const chipSign = isIn ? -1 : +1; // IN → chips leave cage
      for (const [d, qty] of Object.entries(chipMap)) {
        const denom = Number(d);
        expectedChips[denom] = (expectedChips[denom] || 0) + chipSign * Number(qty);
      }

      // Cash counters
      if (isIn) {
        const cur = String(meta.original_currency || "TZS");
        const amt = Number(meta.original_amount ?? tx.amount) || 0;
        expectedCashByCurrency[cur] = (expectedCashByCurrency[cur] || 0) + amt;
      } else {
        // OUT — payout_currency / payout_amount if provided (New Out form),
        // otherwise assume TZS payout equal to tx.amount.
        const cur = String(meta.payout_currency || "TZS");
        const amt = Number(meta.payout_amount ?? tx.amount) || 0;
        expectedCashByCurrency[cur] = (expectedCashByCurrency[cur] || 0) - amt;
      }
    }

    return { expectedChips, expectedCashByCurrency, hasOpening };
  }, [shift, shiftTransactions]);
};
