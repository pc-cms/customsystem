# Coins, decimals in foreign currency, manager edit of approved expenses

Three changes, all confirmed with the user.

## 1. Coins in cash counting

Add coin denominations next to the existing banknote rows in every place where cash is counted (cashier open/close, cash checks, day closing, office safe, wallets, bank/wallet counts):

- USD: 1, 0.50, 0.25, 0.10, 0.05
- EUR: 2, 1, 0.50, 0.20, 0.10
- GBP: 2, 1, 0.50, 0.20, 0.10
- KES: 40, 20, 10, 5, 1
- TZS: no coins (unchanged)

Coins appear as a separate "Coins" block under the notes for that currency, so the note grid stays as it is today. Bank/wallet cash counts get the same coin rows. Totals per currency include coins.

## 2. Two decimals for foreign currency

Amounts in USD, EUR, GBP and KES show two decimals (`1 250.50`) everywhere they are displayed or entered: cash counts and totals, expenses, wallets and wallet movements, printed cashier and total closing reports. TZS keeps whole numbers with space separators, unchanged.

## 3. Manager may edit an already approved expense (same day)

Today only Finance Manager and Super Admin can change an expense; a manager who approved a cash expense by mistake cannot fix it.

New rule: Manager / Shift Manager / General Manager can edit an expense of the **current business day** even after approval. Saving the edit returns the expense to "pending approval", so it must be approved again — that keeps the cash effect correct and leaves a clear trail. Older days stay Finance Manager only.

## Technical notes

- `src/lib/currency.ts`: add `COIN_DENOMS` per currency, extend `formatCashDenomLabel` for fractional labels, add `formatMoneyCurrency(amount, currency)` returning 2 decimals for non-TZS. Keep `formatNumberSpaces` untouched for TZS.
- `CashDenomInput` / `CashCountGrid` / `CashCheckNewGrid` / `CashCheckViewerDialog` / `OpenShiftScreen` / `ActiveShiftView` / cage-slots equivalents / `FinancesWalletsPage`, `FinancesOfficeSafePage`, `FinancesDayClosingPage`, `FinancesExpensesPage`: render `COIN_DENOMS[currency]` as a second block; store counts in the same jsonb map with fractional keys (`"0.5"`). Verified that the DB helper `_sum_denoms` casts keys to numeric, so fractional keys sum correctly with no migration.
- Existing ad-hoc `cents` input in `CashDenomInput` is replaced by the coin rows where coins now exist, to avoid double counting.
- Report components (`TotalClosingReportV2`, `LiveClosingReportV2`, `SlotsClosingReportV2`, `ChipsMovementReportV2`, `ShiftClosingReport`) use the new formatter for non-TZS rows and include coin rows in the denomination tables; the 4-page print test (`npm run test:print`) is re-run to confirm pagination still holds.
- New migration: `edit_expense_as_manager(p_expense_id, p_patch jsonb)` SECURITY DEFINER — allows manager/shift_manager/general_manager within casino scope when `business_date = effective business date`; applies category, wallet, amount, currency, description, player fields; sets `approved = false, approved_by = null, approved_at = null`; writes `fin_audit_log` / activity log via existing triggers. Finance Manager keeps the current direct-update path.
- `useEditExpense` picks the RPC path for manager roles, direct update for finance roles; `EditExpenseDialog` gets a hint that saving cancels the approval. Edit action is shown to managers only for current-day rows.
