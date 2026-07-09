Plan

Scope
Remove head count from the live Table Check page (`src/pages/TableTracker.tsx`). Head count will remain available in the dedicated Head Count panel and in closure snapshots, but it will no longer appear under every Table Check cell or in the slot totals.

Changes
1. `src/pages/TableTracker.tsx`
   - Remove `useTableHeadCount` import and hook call.
   - Remove `getHeadCount`, `getSlotHeadCountTotal` helper functions.
   - Remove the per-cell head count sub-label rendered below each tracker input.
   - Remove the "HC {total}" line from the slot-total footer row.
   - Keep the Numbers/Chips toggle, the input grid, slot totals, and TableAnalyticsChart unchanged.

Not in scope
- `HeadCountPanel` component and its `useTableHeadCount` / mutation hooks are left intact; they are not part of the Table Check page UI.
- No backend or database changes.

Verification
- Build passes (`bun run build` / typecheck).
- Open Table Check page: no "Head count" sub-labels below cells, no "HC" totals in the Total row.