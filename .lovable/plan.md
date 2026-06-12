## Goal
Reports → **Daily** tab becomes the manager's end-of-day reconciliation table. Columns left-to-right:

| Date | Drop | Table Result | Hold % | Player Result | Chip Difference | Gaming Balance |

- **Drop** — real external drop per business day, same source as Player Tracking (Drop R from `compute_tables_drop_split`, summed across all tables of the casino).
- **Hold %** — `Table Result / Drop × 100`, 1 decimal, `—` when Drop = 0.
- **Gaming Balance** — `Table Result + Player Result − Chip Difference`. Should land on 0 for a clean day; coloured red when ≠ 0.
- **Tips column removed** from the table, KPI strip, totals, and CSV/print export. (Tips remain captured via Player Tracking — out of scope here.)

Totals row and the KPI strip on top mirror the same six columns (Days + 5 metrics, Hold % = weighted = ΣResult / ΣDrop).

## Where
- `src/pages/Reports.tsx` → `DailyReport` component (lines 693-789).
- DB RPC `compute_daily_diff` extended to also return `drop_r` per business day so the page makes one round-trip.

## Backend change
Extend `compute_daily_diff(_casino_id, _from, _to)` to add one more output column `drop_r bigint` populated from `compute_tables_drop_split(_casino_id, win_from, win_to)` aggregated per day. No signature break for old callers because Postgres returns rows by name; UI mapping updated in the same pass. `tips` column stays in the RPC (still used by other surfaces) — only the UI hides it.

## Frontend change
`DailyReport`:
- Add `drop` to the row mapping.
- KPI strip: Days, Drop, Result, Hold %, Player Result, Miss Chips, Gaming Balance.
- Table headers + cells reordered to: Date, Drop, Result, Hold %, Player Result, Miss Chips, Gaming Balance.
- Remove all Tips references (header, cell, totals, KPI tile).
- `signCls` colouring on Gaming Balance unchanged.

## Out of scope
- Tips capture flow via Player Tracking (already exists).
- Other report tabs (Total/Shifts/Live/Slots/Players/Groups/Cashless) — untouched.
- No version bump UI change; auto-bump applies because of the migration.
