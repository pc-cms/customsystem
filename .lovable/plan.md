# Niu Niu group, Dashboard table result check, version bump

## 1. Statistics → Tables: Niu Niu and Baccarat as their own games
- New group **NIU · Niu Niu**: tables NU1, N01 and any NU*/N0* table.
- New group **BAC · Baccarat**: tables BC1 and "Baccarat".
- **Other Games** remains only for unknown types.
- Group filter buttons, sorting and Excel get the new groups. Numbers don't change.

## 2. Dashboard check: where the table result comes from
| Screen | Source | Fill / Credit |
|---|---|---|
| Dashboard (main) | latest saved chip count vs expected | counted (current shift only) |
| Boss / TV (open day) | latest saved chip count vs expected | **not counted** |
| Boss / TV (closed day) | saved day closing | as at closing |
| Chip Check | entered count vs current Float | counted |

The difference from Chip Check happens on Boss / TV while the day is open, because Fill and Credit are skipped there. A smaller difference can also appear when the Float was changed after a count, or when the count was only partly saved.
Also the main Dashboard groups by the game written on the table, so Dodoma N01 (written as Roulette) and Mwanza Baccarat (written as Poker) fall into the wrong totals.

## 3. Fix options (choose one)
- **A (recommended):** Boss / TV live result = chip count − Fill + Credit, the same rule as the main Dashboard and Chip Check. Closed days don't change.
- **B:** Boss / TV and Dashboard use the exact Chip Check calculation (current Float + Fill/Credit), so all three always match.
- **C:** A + group the main Dashboard by table name (as in Statistics), so N01 and Baccarat go to Niu Niu / Baccarat.

## 4. Version
- 1.3.759 → 1.3.760.

## Technical details
- `src/pages/TableResults.tsx`: extend `GROUP_ORDER`/`GROUPS`/`tableGroupOf` with NIU (`^(NU|N0)\d*$|NIU`) and BAC (`^BC\d*$|BACCARAT`).
- Option A: `src/hooks/use-boss-dashboard.ts` live branch adds `credit − fill` from `cage_transfers` of the business day per casino.
- Option C: `src/pages/Dashboard.tsx` bucket via shared `tableGroupOf`.
- `package.json` version.
