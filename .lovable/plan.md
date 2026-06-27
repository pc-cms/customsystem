## Plan

### 1. Incidents page — sticky Date/Time columns

Fix the visual shift/jitter of the left-sticky Date and Time columns during horizontal scroll.

Changes in `src/pages/Incidents.tsx` only:

- Widen sticky columns to fit native browser date/time picker chrome:
  - `COLS.date`: 110 px → 140 px
  - `COLS.time`: 78 px → 110 px
- Remove the `border-r border-border` class from the four sticky cells (header Date, header Time, body Date, body Time) and replace it with an inset right shadow that is independent of `border-collapse`:
  - Add `shadow-[inset_-1px_0_0_hsl(var(--border))]` to those cells.
- Add `overflow-hidden` to the sticky body `<td>` cells so the calendar/clock icons cannot bleed into the next column during scroll.
- Keep fully opaque sticky backgrounds (`bg-muted` for header, `bg-background` for body, including the draft row) so the underlying row tint never shows through the sticky cell.
- No business-logic, RPC, or schema changes.

### 2. PIT Breaklist — scroll position must work for every user and role

Make the Breaklist scroll position stable and restored consistently across all users and roles.

Investigate and fix the current combination of `useScrollMemory` and the auto-anchor logic in `src/components/pit/BreaklistGrid.tsx`:

- The current auto-anchor effect centers the current time slot for today and defaults to 18:00 for other days. This can race with the saved scroll restoration and override the user’s position.
- Ensure the `useScrollMemory` restore wins when a non-zero saved position exists, regardless of role or whether the user is on a tablet/PC.
- Make the saved position apply to all users and roles (not just pit/managers). The scroll persistence key is already per-user, so the fix is to stop the auto-anchor from clobbering it.
- Harden the restore timing: retry restoration with `requestAnimationFrame` until the grid content is actually wide enough, so the saved `scrollLeft` is not clamped to 0.
- Verify that `onScroll` is attached to the scroll container and that writes are debounced correctly.

Concrete changes:

- In `src/components/pit/BreaklistGrid.tsx`:
  - Read the saved position from `useScrollMemory` (or query the same localStorage key) before running auto-anchor.
  - If a saved position exists and is > 0, restore it and skip the auto-anchor.
  - Keep auto-anchor as a fallback only when there is no saved position.
- In `src/hooks/use-scroll-memory.ts`:
  - Ensure the restore effect is not blocked by stale `ready` or `restoredRef` state across role changes.
  - Consider resetting `restoredRef` when the user changes, not just when `fullKey` changes, so switching users in the same tab re-applies the correct saved position.

### Verification

- Build the frontend and check for TypeScript errors.
- Visually confirm in the preview: Incidents table sticky Date/Time columns no longer jump during horizontal scroll and native inputs fit inside their cells.
- Visually confirm: Breaklist scroll position is restored after reload and across tab close/reopen for representative roles (pit, manager, surveillance, etc.).

### Version

Bump patch version to `1.3.423`.