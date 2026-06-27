## Breaklist: smart default scroll + hide leading empty slots

Apply only when there's no saved scroll position (current `hasSaved` logic still wins). All changes in `src/components/pit/BreaklistGrid.tsx`.

### Behavior

1. **Hide unused leading slots.** Compute `firstFilledSlot` = the earliest `TIME_SLOTS` entry that has any breaklist cell for the visible dealers on this date. Render the table starting from that slot — slots before it are not rendered at all (no empty leading hours like 18:00, 19:00 if the game opened at 20:00).
   - If there are **zero filled slots**, fall back to current behavior: start at `18:00` (or current slot for today, see below).

2. **Default scroll anchor for today.**
   - Let `N` = number of visible slots between `firstFilledSlot` and `currentSlot` (inclusive).
   - If `N > 6` → scroll so `currentSlot` sits in **column 6 from the left** (5 filled slots visible to its left). Same OFFSET_COLS=5 logic that exists today.
   - If `N ≤ 6` → **do not center**; scroll to the very start so all visible slots fit from the left edge. Grid naturally expands as more slots fill (20:00 → at 21:00 shows 20–21, at 22:00 shows 20–22, etc.).

3. **Non-today dates.** Same hide-leading-empty rule; anchor to the start (first visible slot) instead of `18:00`.

4. **Saved position still wins.** If `hasSaved` is true, skip everything above (unchanged).

### Implementation notes (technical)

- Add `visibleSlots = useMemo(...)`: derive `firstFilledIdx` from `breaklist` rows (`b.time_slot`), then `TIME_SLOTS.slice(firstFilledIdx)`. Re-compute when `breaklist` changes.
- Replace the two `TIME_SLOTS.map(...)` renders in `<thead>` and `<tbody>` with `visibleSlots.map(...)`.
- Update the auto-anchor `useEffect` to:
  - Use `visibleSlots` length and `visibleSlots.indexOf(currentSlot)` to decide between "center at col 6" and "scroll to 0".
  - Keep the `requestAnimationFrame` retry loop for layout readiness.
- Re-anchor when `visibleSlots` length changes (first cell added shifts the grid), gated by `!hasSaved`.
- Keep the per-minute interval that resets `didAnchorRef` so today's grid re-centers as the current slot ticks over.
- No schema, RPC, hook, or styling changes. Sticky columns, current-slot highlight, and hour separators continue to work because `isHourStart` / `isCurrentCol` are computed per rendered slot.

### Out of scope

- Saved-position restoration logic (unchanged).
- Vertical scroll, sort, attendance, and role-picker behavior (unchanged).
- Version bump.
