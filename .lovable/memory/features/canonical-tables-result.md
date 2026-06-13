---
name: Canonical tables_result
description: Single source of truth for shift P&L; sources from gaming_tables.closing_result; DB trigger on table close; chip snapshots no longer affect P&L
type: feature
---

# Canonical `shifts.tables_result`

## Formula

```
shifts.tables_result = Σ (gaming_tables.closing_result − Fill + Credit)
```

- `gaming_tables.closing_result` — value entered by Pit when closing the table via the Close Tables wizard.
- `Fill` / `Credit` — per-table sums from `cage_transfers` for the same `shift_id`.
- `imported` overrides from `table_daily_results` win for historical days.

## RPC

`compute_shift_table_results(p_shift_id)` returns one row per table (`closing_result − Fill + Credit`). Used by the active-shift live view + cage reports.

## Triggers

- `recalc_shift_tables_on_table_close` on `gaming_tables` AFTER UPDATE of `closing_result` → recomputes `shifts.tables_result` for the open shift in that casino.
- `block_shift_close_if_tables_open` on `shifts` BEFORE UPDATE → raises `Cannot close shift: N table(s) still open: …` if any non-archived gaming_table has `closing_result IS NULL`.
- The legacy `recalc_shift_tables_on_snapshot` trigger on `chip_snapshots` was REMOVED. Snapshots no longer touch P&L.

## Why snapshot path was removed

Chip Count is operational only (Tracker / Analytics). Cashier counts often include denoms with `expected=0` and `actual=N` (table-not-applicable denoms typed by mistake) which inflated live result by `N × denom`. The authoritative result is what Pit enters at Close Tables — a deliberate, single decision per shift.

## Frontend

- `liveTableResult()` returns `closingResult + adjustment` (no snapshot math). Open table → 0 + Fill/Credit adjustment.
- `CloseTableWizard.getInitialCounts()` defaults to baseline only — snapshots do NOT pre-fill closing cells.
- `CloseShiftPage` blocks navigation to the close form if any table is still open; lists open tables + button to Close Tables route.
