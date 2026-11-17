# Statistics → Tables: show/hide per-table Drop

## What changes
- New toggle button **Drop** in the table controls bar (next to group filters / Tables / Show all).
- Off: per-table and per-group cells show only Result (no Drop line, no Hold%).
- On: current view (Drop + Result per table).
- Total column (ALL / Σ Period) always shows casino Total Drop from `player_day_drop_cache` and Hold%, regardless of the toggle.
- Choice remembered per casino together with the existing table filter.
- Excel export follows the toggle for per-table/group Drop columns; Total Drop always exported.
- No calculation or data changes; Drop rule stays as is.

## Technical details
- `src/pages/TableResults.tsx`: replace constant `showPerTableDrop = true` with state persisted in `table-results-filter:<casinoId>` (default on); pass to `DRHeadCell`/`DRCell`/`GroupTotalCells` for table and group cells only; total cells keep drop always.
