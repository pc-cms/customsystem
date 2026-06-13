## Change: Table Results come from Close Tables, not Chip Count

New rule across the system:

- **Live Table Result** = `gaming_tables.closing_result` only. While a table is still open → result is `—` (not 0, to distinguish from an actual zero close).
- **Chip Snapshots** = Tracker / Analytics only. They never feed P&L, never feed Live Result, never write to `shifts.tables_result`.
- **Shift cannot be closed** while any gaming table on that casino is still open (`closing_result IS NULL`). UI blocks with a clear message listing the open tables.
- **Shift P&L** (`shifts.tables_result`) = Σ `gaming_tables.closing_result` of tables closed during the shift − Fill + Credit (cage_transfers).

### Backend (DB migration)

1. Rewrite `compute_shift_table_results(p_shift_id)`:
   - Source = `gaming_tables.closing_result` for tables that were closed within the shift window (between `opened_at` and now/`closed_at`).
   - Subtract Fill, add Credit from `cage_transfers` for that `shift_id`.
   - Drop the snapshot/baseline branch entirely.
   - Keep `imported` (table_daily_results) as override for historical days.
2. Rewrite trigger `trg_recalc_shift_tables_on_snapshot` → drop it (snapshots no longer touch shifts).
3. Add trigger on `gaming_tables` AFTER UPDATE of `closing_result` → recompute `shifts.tables_result` for the currently open shift in that casino.
4. Add RPC `can_close_shift(p_shift_id)` returning `(ok bool, open_tables jsonb)`; called by Close Shift flow.
5. Enforce via trigger on `shifts` BEFORE UPDATE → if `status='open'→'closed'` and any active gaming_table in the casino has `closing_result IS NULL`, RAISE EXCEPTION.

### Frontend

- `src/lib/table-live-result.ts` → `liveTableResult()` returns `closingResult ?? null`. Remove snapshot / baseline / adjustment math (snapshots become irrelevant to result).
- `src/hooks/use-shift-table-adjustments.ts` → keep for IN/OUT strip display only; not used in result anymore.
- All consumers of `liveTableResult` render `—` (em-dash) when result is `null`.
- `src/components/tables/CloseTableWizard.tsx` → `getInitialCounts` defaults to **baseline** (not snapshot). Snapshot data no longer pre-fills closing.
- Cage `CloseShiftPage` → before submit, call `can_close_shift` RPC; if not ok, show modal listing open tables + Cancel.
- `src/components/cage/ShiftClosingReport.tsx` and other P&L displays → keep reading `shifts.tables_result` (now sourced from closings).
- Tables page / Pit dashboard → Live Result column shows `—` for open tables (was: live snapshot delta).

### Memory updates

- Rewrite [Canonical tables_result](mem://features/canonical-tables-result) — formula now uses `gaming_tables.closing_result`.
- Rewrite [Live Table Result Resolution](mem://features/live-table-result-resolution) — Result = `closing_result` only; snapshots removed.
- Update Core rule: "Shift P&L source of truth = `shifts.tables_result` (sum of closing_result − Fill + Credit). Snapshots are Tracker/Analytics only."
- Add Core rule: "Shift cannot be closed while any table is open."

### Out of scope (kept as-is)

- Chip Count → Tracker bridge (still writes tracker slot from snapshot).
- Tables Analytics / Drop V calculations.
- Chip conservation / Miss chips logic.
- Imported historical days (`table_daily_results`) override.

Auto-bump `package.json` patch version (backend change).
