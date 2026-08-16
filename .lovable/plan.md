# Numeric inputs: arrow-key navigation instead of value stepping

## Goal
In chip-count grids, cash-count grids and every other numeric cell, the up/down arrows must no longer increase or decrease the number. Instead arrows move focus between fields, so a counter can fill a whole column with one hand, just like Tab.

## Behaviour after the change
- Arrow Up / Arrow Down: move focus to the previous / next numeric field (same behaviour as Shift+Tab / Tab).
- Arrow Left / Arrow Right: normal caret movement inside the number; only when the caret is already at the very start (Left) or very end (Right) of the field does focus jump to the previous / next numeric field.
- Tab / Shift+Tab: unchanged, native behaviour.
- Enter: unchanged where a screen already defines it (chip grid jumps to the next denomination and then submits).
- Native browser spinner arrows stay hidden (the `no-spin` styling already covers this).
- Moving focus selects the whole value in the target field, so typing overwrites it.

Field order for arrows follows the visual DOM order of numeric fields inside the nearest enclosing form / dialog / panel, so a chip column, a cash column or a stock-count list is traversed top to bottom.

## Technical notes
- `src/components/ui/number-input.tsx` is the single primitive used by chip input, cash input, POS stock count, inline report cells, etc. All changes land there.
  - Delete the `ArrowUp` / `ArrowDown` increment branch and stop using the `step` prop for stepping (prop kept as a no-op for existing call sites to avoid touching every screen).
  - Tag every rendered input with `data-num-input` so siblings can be discovered.
  - Add a shared helper that collects `input[data-num-input]:not([disabled]):not([readonly])` inside the closest `form`, `[role=dialog]`, or `[data-num-group]` container (falling back to `document`), sorts by DOM order, and focuses the neighbour with `select()`.
  - Custom `onKeyDown` handlers passed in by call sites keep running first; navigation only fires when the event was not already prevented (so the chip grid's Enter logic is untouched).
- `src/components/staff-master/editable-cell.tsx` uses a raw `<input>` rather than `NumberInput`; give its numeric variant the same `data-num-input` tag and key handling so the staff grid behaves consistently.
- Add unit coverage in `src/test/number-input.test.ts` for the navigation helper's ordering/edge-caret logic.
- Bump the app version in `package.json`.
