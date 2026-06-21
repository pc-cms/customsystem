## Goal
Remember Breaklist scroll position (horizontal + vertical) per user/page, same way as sort/filter state — so reloading or navigating back keeps the user where they were.

## Approach
Reuse the existing `useSessionState` infrastructure (already used for `search`/`sort`/`dept` in other grids). Adds a tiny `useScrollMemory` hook that:

1. Reads `{ x, y }` from sessionStorage under namespace `cms:v1:ss:<userId>::<pathname>::breaklist-scroll`.
2. On the scroll container's `onScroll`, debounces writes (~150ms) so we don't thrash storage.
3. On mount, once the grid has rendered rows (data loaded), restores `scrollLeft` / `scrollTop` once.

## Where
- New file: `src/hooks/use-scroll-memory.ts` — generic hook returning `{ ref, onScroll }` taking a storage key.
- Edit: `src/components/pit/BreaklistGrid.tsx` — attach `ref` and `onScroll` to the `cms-panel overflow-auto` container (line 443). Restore after dealers/rota data is ready (use `useEffect` keyed on `isLoading=false` + row count > 0, guarded by a `restoredRef` so it only runs once per mount).

## Scope
- Only the Breaklist grid container. No other lists changed.
- Storage namespaced per user + per path (same as `useSessionState`), wiped on tab close.
- Zoom level remains independent (already persisted elsewhere).

## Non-goals
- Not restoring selected cell / role picker state.
- Not persisting across tab close (sessionStorage by design).
- No backend changes, no version bump.
