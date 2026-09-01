# Fix: Open Month wipes the previous month's Starting Float

## What is actually wrong (verified)

Starting Float is stored as a single "current" value per wallet (`fin_wallets.starting_float_amount` + `starting_float_date`). There is no per-month history.

When September was opened for Mbeya, `fin_open_month` overwrote every Mbeya wallet:

| Wallet | Now | Float date |
|---|---|---|
| Main Phone | 25 000 533 TZS | 01/09/2026 |
| All other 19 wallets | 0 | 01/09/2026 |

The Balance snapshot (`fin_balance_snapshot`) reads Starting Float straight from `fin_wallets` with **no period filter at all**. So August now uses September's float:

- August's own float was overwritten to 0 on every wallet;
- the whole September float sits on one wallet (Main Phone) and is added to August's Expected too;
- Expected for August shifted, Actual (August physical counts) did not → the minus.

Arusha (float 01/08, 25 000 000) and Mwanza (float 01/08, 4 190 744) are still intact, but they will get the exact same damage the moment September is opened there. Dodoma has no float set at all.

## What we change

1. **Per-month float history.** New table `fin_wallet_float_history` (casino, wallet, effective_date = 1st of the opened month, amount, currency, source, created_by). `fin_open_month` writes one row per wallet instead of only overwriting the live value (it still updates `fin_wallets` so current-month views keep working).

2. **Period-aware Starting Float in the balance snapshot.** `fin_balance_snapshot` picks, per wallet, the latest history row with `effective_date <= p_period_start`; falls back to `fin_wallets` when there is no history. Opening a new month can no longer touch a previous month's Expected/Variance.

3. **Backfill history from today's data** so nothing changes for currently correct months: Arusha 01/08, Mwanza 01/08, Mbeya 01/09.

4. **Restore Mbeya's August float** as a history row dated 01/08/2026 (see question below). After that, August Mbeya Expected/Variance returns to the pre-September numbers and September keeps its own 25 000 533.

5. **Guard in the Open Month wizard**: it already prefills wallets, but it will show a warning line "This sets the float for <Month> only; previous months are unaffected" so the ritual is unambiguous.

## Not touched

Day Closings, cashier shifts, expenses, incomes, JP, inter-casino, wallet counts (`cash_count_snapshots`) — none of them change. Only how Starting Float is stored and read per accounting month.

## Open question

Mbeya's August float was overwritten and is not recoverable from the audit log (no `fin_wallets` audit rows exist). Please confirm the August 2026 Mbeya Starting Float — either a single total (like the September 25 000 533 on Main Phone) or the per-wallet breakdown. Without it I will restore August as 0 float, which is likely not what you want.

## Technical detail

- Migration: create `fin_wallet_float_history` with GRANTs (authenticated read, service_role all) + RLS scoped by `has_casino_scope` / `can_finance` / `super_admin`; unique on (wallet_id, effective_date).
- `fin_open_month`: insert history rows for every entry of `p_float_details` (upsert on conflict).
- `fin_balance_snapshot`: replace the `SELECT ... FROM fin_wallets` starting-float block with a `DISTINCT ON (wallet_id)` lookup over the history table filtered by `effective_date <= p_period_start`, `LEFT JOIN fin_wallets` for name/currency, fallback to `fin_wallets.starting_float_amount` when the wallet has no history.
- Data fix: history rows for Arusha/Mwanza (01/08), Mbeya (01/09) + Mbeya 01/08 restore row.
