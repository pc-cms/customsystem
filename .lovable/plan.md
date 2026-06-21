## Problem

Chip IN / Chip OUT (`player_chip_adjustments`) is applied correctly in:
- `PlayerStatistics` page (rows + totals, formula: `result = (out + chipOut) − (inDrop + chipIn)`)
- `PlayerPreviewHeader` log

But it is **not** included in the extended player profile (`PlayerProfile`) — neither the **Visits** tab (Month → Week → Day breakdown), nor the **Info & History** "Visits" table, nor the **lifetime/period KPIs** in the header card. The `player_economy` view does not aggregate chip adjustments, and `PlayerVisitsBreakdown` only receives transactions + expenses.

## Fix (frontend-only, no DB changes)

Adopt the same canonical formula used in `PlayerStatistics`:
- `Chip In` adds to the drop side (player put more chips on the table)
- `Chip Out` adds to the cashout side
- `Result = (Out + ChipOut) − (Drop + ChipIn)`
- `Drop R` (NEP-aware External cash) is unchanged — chip adjustments never affect NEP, only `Result` / `Total`.

### 1. `src/pages/PlayerProfile.tsx`

- Add lifetime fetch via existing `usePlayerChipAdjustments(id)` hook.
- Filter `chipAdjInRange` by `created_at` against `rangeStartMs..rangeEndMs`.
- Extend `visitFinancials` map to also carry `chipIn`, `chipOut`; walk `chipAdjustments` and attribute each row to the visit window matching `(casino_id, created_at)`, fallback ignored if no window match (matches PlayerStatistics behavior).
- Extend the **Info & History → Visits** table:
  - Add two new columns `Chip In` / `Chip Out` between `Cashout` and `Result`.
  - Adjust `result` and `total` per row + footer totals to include chips.
- Extend `lifetime` KPIs in header:
  - Sum all chip adjustments (lifetime).
  - `result = cashout + chipOut − (dropGross + chipIn)`; `total = result − comps`.
  - Hold % stays based on cash drop only (do not bias hold by audit-only chip adjustments).
- Extend `period` KPIs similarly using `chipAdjInRange`.

### 2. `src/components/player/PlayerVisitsBreakdown.tsx`

- Add new prop `chipAdjustments: Array<{ id; casino_id; created_at; chip_in; chip_out }>`.
- Extend `Agg` with `chipIn`, `chipOut`.
- In the `visitFin` walk, attribute each chip adjustment to its visit window (same `findVisit(casinoId, ts)` helper already used for transactions).
- Add two new columns `Chip +` / `Chip −` between `Out` and `Result`.
- Change `result(a) = (a.out + a.chipOut) − (a.drop + a.chipIn)` for player perspective; `total = result − comps` unchanged.
- `colSpan` bumps from 8 to 10 when `showFinancials`.
- Lifetime total row in `<tfoot>` includes the two new columns.

### 3. `src/pages/PlayerProfile.tsx` (wire-up)

```tsx
<PlayerVisitsBreakdown
  visits={visits}
  transactions={transactions}
  expenses={expenses}
  chipAdjustments={chipAdjustments}
  showFinancials={canSeePlayerFinancials(roles)}
/>
```

### 4. Sanity check other surfaces

Searched the codebase for places consuming visits/transactions for player financials. Confirmed no fix needed elsewhere:
- `PlayerStatistics.tsx` — already correct.
- `PlayerPreviewHeader.tsx` — already correct.
- `Reception.tsx`, `Guests.tsx`, `Blacklist.tsx`, `CrmPlayers.tsx`, `PosPlayerAnalytics.tsx` — use lifetime visit counts or last-visit only; no per-visit cash result.
- `AmPerformancePage.tsx` — AM aggregates, separate domain.

Chip adjustments remain audit-only: no impact on cage, NEP/Drop R, chip inventory, shift balance, or DB triggers.

## Files changed

- `src/pages/PlayerProfile.tsx`
- `src/components/player/PlayerVisitsBreakdown.tsx`

## Out of scope

- No DB migration, no edge function, no version bump (UI presentation fix only).
- `player_economy` view unchanged (adding chip adjustments there would touch every consumer; we sum on the client where needed).
