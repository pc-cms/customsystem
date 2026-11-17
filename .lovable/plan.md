# Statistics → Tables: show every table, including Niu Niu, Baccarat and new games

## Problem (confirmed)
The Table Results page has a fixed list of columns: AR1–AR3, P1–P5, BJ1, Club. Any other table (NU1, N01, BC1, Baccarat, any future table) is not shown, and its result is not counted in totals, even though its data exists.

## What will change
- Columns are built from the tables that actually have results in the selected period (Week / Month / Year / Custom) for the selected casino. If a table had results in the month, it appears in that month; in the Year view it appears if it played in any day of the year.
- Groups stay as now: **AR**, **PK**, **BJ**, **CLUB**, plus a new **OTHER** group (Niu Niu, Baccarat and any other new game). Grouping is by table name (AR…, P…, BJ…, Club; everything else → OTHER), because some tables have a wrong game type saved (Dodoma N01 is saved as "American Roulette", Mwanza "Baccarat" as "Texas Holdem").
- Tables are never renamed, so one column = one table name. Archived tables still show if they have results in the period (history is preserved).
- OTHER results go into the group total row, ALL total, Hold %, the top TOTAL strip and the Excel export.
- Order within a group: natural (AR1, AR2, AR3; P1…P5).

## Tables per casino (current)
- Arusha: AR1–3, P1–5, BJ1, Club, OTHER: NU1, BC1
- Dodoma: AR1–3, P1–5, BJ1, OTHER: N01
- Mbeya: AR1–3, P1–5, BJ1, Club, OTHER: N01
- Mwanza: AR1–3, P1–4, BJ1, OTHER: N01, Baccarat

## Not changed
Calculations of table result and Drop, saved data, game types in the database.

## Technical
- `src/pages/TableResults.tsx`: replace the 4 constant arrays with dynamic per-group lists derived from `data` (names from `gaming_tables.name`), add `otherDrop/otherResult` to buckets and totals, render OTHER group header/subheaders/cells, include in export and detail ordering.
- Check with Playwright on Arusha month view that NU1 appears and totals include it.
