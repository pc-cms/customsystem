# Fix: Wallets "Add money / Take money" fails

## What happens now

The dialog writes a wallet movement with a movement type of `adjustment_in` / `adjustment_out`.
The database only accepts these movement types:

`income`, `expense`, `change_in`, `change_out`, `transfer_in`, `transfer_out`, `reversal`, `adjustment`

So every "Add money" / "Take money" save is rejected by the database and the red error toast appears.
"Transfer" works, because `transfer_in` / `transfer_out` are allowed — this matches what you see.

Confirmed in the live database: there are 0 rows with `adjustment_in` / `adjustment_out`, while transfers exist.

## Fix

1. Database migration: allow the two missing movement types (`adjustment_in`, `adjustment_out`) on wallet movements.
2. Balance formula: make `adjustment_out` subtract (money leaves the wallet) in the balance snapshot function, exactly like expenses and transfers out. `adjustment_in` adds. Both stay outside income/expense reporting, so they do not distort profit — they only move the wallet balance, which is the intent of these two buttons.
3. Keep the generic `adjustment` type behaving exactly as today (still excluded from the movement sum) so nothing in existing reports shifts.
4. Show the real database message in the error toast instead of a bare failure, so a future constraint problem is diagnosable at a glance.

## Technical notes

- Migration: replace `fin_wallet_tx_kind_check` with the same list plus `adjustment_in`, `adjustment_out`.
- `fin_balance_snapshot`: add `adjustment_out` to the negative-sign list in the `tx` CTE (alongside `expense`, `manual_expense`, `collection`, `change_out`, `transfer_out`).
- Frontend sign rules already know these two types (`src/lib/wallet-tx-sign.ts`, `use-fin.ts`, `use-wallet-day-grid.ts`) — no change needed there.
- No data backfill required; nothing was ever written with these types.
- Version bump to 1.3.681.
