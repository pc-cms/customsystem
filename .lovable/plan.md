## Issue diagnosis

### 1. Miss Chips sign — Live Game printed shift report
File: `src/components/cage/ShiftClosingReport.tsx:562-565`
```tsx
<td>Miss Chips</td>
<td>{missTotal === 0 ? "" : `-${numAlways(Math.abs(missTotal))}`}</td>
```
The cell hard-codes a leading `-` and prints `|missTotal|`, so the row is **always negative**, regardless of whether chips are short or surplus.

Stored convention (`shift.miss_total`, set by `CloseShiftDialog`):
- `+` = chips missing (deficit, e.g. Mwanza 21/06 = +115 000 and +1 487 000)
- `−` = chips surplus

The natural "physical chip" sign is the opposite (`counted − opening`, matching `computeMissByDenom`). The on-screen close dialog already uses the signed form (`−(+115 000)`), but the print bypasses it.

### 2. Cards Miss sign — Slots printed shift report
File: `src/components/cage-slots/PrintSlotsShiftDialog.tsx:263-292`
```ts
const missCardCount = opening - closing;   // 15 − 16 = −1
...
missCards: -Math.abs(missCardCount),       // forced to −1
```
For Mwanza 21/06 (opening 15 → closing 16) the DB has `miss_card_count = +1` (surplus, `closing − opening`), but the print layer flips the sign and forces it negative, so the report shows `-1` instead of `+1`.

`SlotsConsolidatedReport.tsx:209` prints the raw number, so once the source value is corrected the row renders the right sign automatically (just needs an explicit `+` for positives).

## Fix

### A. `src/components/cage/ShiftClosingReport.tsx`
Replace the always-negative Miss Chips cell with a signed display that mirrors the physical chip convention (deficit → `−`, surplus → `+`):
```tsx
{(() => {
  const v = -missTotal;                          // invert storage convention
  if (v === 0) return "";
  return (v > 0 ? "+" : "−") + numAlways(Math.abs(v));
})()}
```
No change to the Shift Balance formula (which still uses raw `missTotal`).

### B. `src/components/cage-slots/PrintSlotsShiftDialog.tsx`
Pass the signed count, not the forced-negative one:
```ts
const missCardCount = cards
  ? Number(cards.closing_card_count || 0) - Number(cards.opening_card_count || 0)
  : 0;
...
missCards: missCardCount,   // signed: +surplus / −deficit
```

### C. `src/components/cage-slots/SlotsConsolidatedReport.tsx`
Render `missCards` with explicit sign so `+1` shows the plus:
```tsx
{missCards !== 0 ? (missCards > 0 ? "+" : "") + missCards : ""}
```
(Negative numbers already render their own `−`.)

## Out of scope
- No DB / trigger changes — both stored values are already correct.
- No change to the on-screen Active views; they already display signed values.
- No change to chip / card balance formulas — only the printed-cell formatting changes.

## Verification
1. Reprint Mwanza Live Game shift 21/06/2026 → `Miss Chips` shows `−115 000` (deficit) and `−1 487 000`.
2. Reprint Mwanza Slots shift 21/06/2026 → `Miss Cards` shows `+1` (surplus).
3. Reprint a shift with a surplus chip miss → `Miss Chips` shows `+X` (no longer forced negative).
