# Office → Tips & Bonuses tab

Add a dedicated Tips & Bonuses ledger inside Office, built exactly like the existing JP tab: one list where money in is a positive amount (+) and money out (payout/distribution) is a negative amount (-).

## What the user gets

- New Office tab **Tips & Bonuses**, placed alphabetically in the flat tab row (`/office?tab=tips-bonuses`).
- Two buttons: **Add IN (+)** and **Add OUT (-)**, same dialog pattern as JP (date, wallet, amount, note).
- Table columns: Date, Type (Collected / Paid out), Entered in, Wallet, Amount (+/- colour-coded), Note, actions (edit/delete for manager / finance_manager / super_admin).
- Totals row: Total IN, Total OUT, Net — same as JP.
- These rows stop appearing in Office → Transactions (like JP today), so no double counting in that list.

## Data migration

Existing rows in the transactions ledger get re-tagged to the new `tips_bonus` source:

- all 8 rows with source `bonus`
- the 4 rows with source `other` whose note mentions Tips ("Tips dealers 15.08.2026", "Tips collected on 16.08", "Tips OUT July", "Tips")

12 rows total. Only the `source` label changes — amounts, dates, wallets and the mirrored wallet transactions stay untouched, so no balance moves.

## Technical notes

- `fin_other_incomes.source` is a text column with a CHECK constraint listing the allowed values. Migration: drop and recreate the constraint with `tips_bonus` added, then `UPDATE` the 12 matching rows.
- `src/hooks/use-other-incomes.ts`: add `tips_bonus` to `OtherIncomeSource` and `ALL_INCOME_SOURCES` (label "Tips & Bonuses"); exclude it from `OTHER_INCOME_SOURCES` the same way `jp` is excluded. Keep `bonus` in the type for safety but drop it from the selectable list so new entries go to the new tab.
- New `src/pages/office/TipsBonusTab.tsx`, cloned from `JpTab.tsx` with `only: ["tips_bonus"]`, IN/OUT sign handling and its own labels.
- `src/pages/office/OtherIncomesTab.tsx`: extend the exclude list to `["jp", "tips_bonus"]`.
- `src/pages/office/OfficePage.tsx`: register the lazy tab + entry in `TABS`.
- No RLS or grant changes needed — the table and its policies already cover these rows.
