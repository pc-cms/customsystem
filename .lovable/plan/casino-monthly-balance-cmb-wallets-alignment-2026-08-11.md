# Casino Monthly Balance — CMB/Wallets alignment

## Goal
Make the **Casino Monthly Balance** report an independent control report whose logic matches the **Wallets** module and the user's 15 answers.

## Decisions implemented

1. **Cage Casino** — running ledger of `cage_table` + `cage_slot` wallets (TZS + USD at daily rate). Chips excluded. No snapshot override.
2. **Cage Manager** — from `fin_day_balance_snapshot` (Record) when available; otherwise live office wallet running balance.
3. **Bank** — from `fin_day_balance_snapshot` (Record) when available; otherwise live bank wallet running balance. Split by TZS/USD.
4. **Terminal column removed** — no `terminal_tzs`, `terminal_usd`, `terminal_total`, `bank_terminal`, `bank_fee`.
5. **Other Incomes / JP** — new columns pulled from `fin_other_incomes` (JP separate; everything else is Other Incomes).
6. **Missed Chips** — sign matches the Office convention (negative = shortage, reduces expected balance).
7. **Missed Cards** — new column from `cage_slots_shifts.cards_miss`, same negative sign as Missed Chips.
8. **Collections** — new reference column for expenses in the Collection category (part of Office Out).
9. **Expenses** — only `approved = true`, not voided, not reversals; office expenses show immediately, cage expenses only after the business day is closed.
10. **Variance formula** — `Start + Result + Diff + JP + Other Incomes + Office IN − Expenses − Office OUT − Money Total`.
11. **Fin Result** — unchanged: `Result − Expenses ± Diff`.
12. **Money Total** — `Cage Casino + Cage Manager + Bank TZS + Bank USD`.
13. **Empty cells** — display `0` instead of `·`.
14. **Balance label** — renamed to **Variance** in the report header, section label, and top tile.
15. **Start row** — editable opening fields from `fin_month_start`; rows before the recorded Start date hide money columns.

## Files changed
- `src/hooks/use-daily-balance-report.ts` — core data model, running balances, variance formula, snapshot/ledger split.
- `src/pages/reports/DailyBalanceReport.tsx` — new column layout, zero blanks, Variance label.
- `src/lib/monthly-balance-formulas.ts` — updated tooltips/sources.
- `src/lib/demo-report-data.ts` — synced demo rows with the new schema.

## Verification
- `bun run build` passes.
- `bunx tsc --noEmit` passes.
