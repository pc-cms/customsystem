# Fix transfers + split Tips / Bonuses

Three separate problems from the report, all confirmed against the database.

## 1. Transfer error: `record "w" has no field "fx_rate"`

Confirmed root cause: the three inter-casino RPCs (`fin_inter_casino_send`, `fin_inter_casino_accept`, `fin_inter_casino_resolve`) read `w.fx_rate` from a `fin_wallets` row, but `fin_wallets` has no `fx_rate` column at all. So every send/accept/reject fails and no transfer is ever written — `fin_inter_casino_transfers` is empty (0 rows).

Fix: take the rate from the same source the rest of Finance uses instead of the wallet — `fin_daily_rates` for the transfer's business date and currency, falling back to 1 for TZS. `amount_tzs` = amount × that rate. No schema change, no other logic touched.

## 2. The 10M "hanging" in Mwanza

It is not an inter-casino transfer row (that table is empty). It is a legacy transactions entry:

- Arusha, 08/08/2026, source `Inter-Casino Transfer`, +10 000 000 TZS, note "FLOAT (DEBT) Mwanza"

It only exists on the Arusha side, which is why it looks stuck and why nothing can be accepted or rejected. Deleting works from Office → Transactions while Arusha is the active branch (delete is allowed for manager / finance / super admin) — it fails when Mwanza is active because the row belongs to Arusha.

Plan: delete this single legacy row (its mirrored wallet transaction is removed automatically by the existing delete trigger), then the transfer can be re-entered properly through Inter-Casino once fix 1 is in place. Nothing else is touched.

## 3. Tips and Bonuses as two separate types

Today everything sits under one source `tips_bonus`. Split it:

- Two sources: `tips` and `bonus` (the legacy `bonus` value is reused).
- Entry dialog gets a **Type** selector: Tips / Bonus, next to the existing Direction (IN / OUT).
- Table gets a Type column showing Tips or Bonus plus Collected / Paid out.
- Tiles become two groups: **Tips** (IN / OUT / Net) and **Bonuses** (IN / OUT / Net), with a combined Net.
- Optional filter chips (All / Tips / Bonuses) above the table.

### Re-tagging existing rows

Rows to move into the new tab (still in Transactions today, source `investment`, notes mention tips):

- Arusha 09/08/2026 · 51 000 · "Dealers tips" → Tips
- Arusha 02/08/2026 · 2 020 000 · "Tips from July 2026" → Tips

Existing `tips_bonus` rows are classified by note:

- → Bonus: "Agent Bonus July" (Arusha, 2 rows)
- → Tips: all the rest ("Tips", "Tips dealers 15.08.2026", "Tips distributed", "Tips collected on 16.08", "Tips OUT July", "Dealer tips", "Dealers Tips", "Tips dealer", "Halo", "Airtell")

"Halo" and "Airtell" (Mwanza, 06/08) are ambiguous — they default to Tips; say the word if either should be a Bonus. Only the label changes: amounts, dates, wallets and mirrored wallet transactions stay untouched, so no balance moves.

## Technical notes

- Migration: extend the `fin_other_incomes.source` CHECK constraint with `tips`, then `UPDATE` the rows per the mapping above; recreate the three inter-casino RPCs without `w.fx_rate`.
- `src/hooks/use-other-incomes.ts`: add `tips` to the source type and labels; keep `tips` + `bonus` excluded from the Transactions tab list.
- `src/pages/office/TipsBonusTab.tsx`: Type selector, Type column, per-type tiles, filter chips.
- One-off data delete for the 10M legacy row.
- Version bump + build/typecheck; no publish.
