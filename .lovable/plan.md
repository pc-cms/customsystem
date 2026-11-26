# Final Collection and Transactions rows in Dashboard TV Monthly Report

## What you will see
In Dashboard TV → Monthly Report, directly under the **Collection** row, two new rows per casino plus total:

1. **Final Collection** — the final collection amount for the month, entered manually.
   - Only Finance Manager and Super Admin can enter or change it (click the cell → enter amount → save).
   - Everyone else sees the value read-only; empty cells show `·`.
2. **Transactions** — the month total from Office → Transactions (other incomes, voided excluded).
   - Shown only after the month is closed for that casino; before closure the cell shows `·`.

Neither row changes Balance, Expected Profit or any other existing figure.

## Technical details
- New table `fin_month_final_collection` (casino_id, month_start, amount_tzs, updated_by, updated_at; unique casino+month), RLS: read for authenticated users with casino access, write only via RPC checked for `finance_manager` / `super_admin`; changes logged by trigger into `fin_audit_log`.
- Transactions total: sum of `fin_other_incomes` for the month (non-voided), returned only when a `fin_month_closures` row exists for that casino+month.
- `use-boss-dashboard` / monthly hook fetch both values; `monthly-report-panel.tsx` adds the two rows with hints.
- Small test: Transactions value hidden when month not closed, shown when closed.
