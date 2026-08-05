# Fix Mwanza Variance: cage expenses subtracted twice

## Diagnosis (verified on live data, Mwanza 01–05/08/2026)

- Expected = 60 312 419; Actual − Starting Float = 62 809 272 → Variance **+2 496 853**.
- JP is already handled correctly: `jp = 2 642 598` is in Expected and the same amount is posted into Safe TZS, so it nets to zero. JP is not the problem.
- 35 cage expenses (`source = live_game`) for **2 849 500 TZS** on 01–04/08 are subtracted from Expected but produce **no wallet movement** — they are paid straight out of the cage takings, so the money never reaches a wallet and the reported day result is already net of them. Subtracting them again in Expected pushes Expected too low, which is exactly the positive Variance (residual −352 647 from other noise).

## The rule to implement

Expenses paid from the cage takings must not be subtracted a second time.

```text
Expected = Live + Slots + Other + JP + Card Balance + Miss Chips + Miss Cards
           − Expenses that actually left a wallet
           − Collections
```

An expense counts as "left a wallet" when it has a posted wallet movement (`fin_wallet_tx.ref_table = 'expenses'`). Office expenses post to a wallet today and keep reducing Expected exactly as now. Cage expenses paid from the drawer stop reducing Expected.

## Visibility

The excluded bucket must be visible, not hidden:

- Breakdown panel on Wallets: new line **"Cage expenses (paid from takings)"** with the period total, marked as informational (does not enter Expected).
- Daily audit table: new column **Cage exp.** next to Expenses, so any day can be checked at a glance.

## Technical details

- Rewrite `fin_balance_snapshot`:
  - split the expense aggregate into `expenses_total` (has a posted `fin_wallet_tx` with `ref_table='expenses'`) and `cage_expenses_offbook` (no such movement); keep the collections/transfers split unchanged.
  - add `cage_expenses_offbook` to the response and a `cage_expenses` field to each `daily` row.
- `src/hooks/use-fin-balance.ts`: extend `BalanceSnapshot` with the new fields; `computeBalanceTotals` stays as is (it already uses `expenses_total`, which now excludes the off-book bucket).
- `src/pages/finances/FinancesWalletsPage.tsx`: render the new Breakdown line and the new Daily audit column.
- Bump the version in `package.json`.

## Verification

Recompute Mwanza for August after the change and confirm Variance drops from +2 496 853 to ≈ −352 647, then break the remaining residual down per day in the audit table and report what it consists of.
