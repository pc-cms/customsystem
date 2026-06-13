# Fix: Chip Count Result must reflect Fill / Credit

## Problem (confirmed in code)

`src/components/tables/CloseTableWizard.tsx` shows a single **Result** number computed by `calcResult` = `Σ(actual − baseline) × denom`. This is **pure physical** chip delta. Fill and Credit are NOT applied in this view.

But the canonical Shift P&L (`shifts.tables_result`, DB RPC `compute_shift_table_results`) is `closing_result − Σ Fill + Σ Credit`.

Consequence: Pit closes a table after a 10M Fill, sees "Result +7M" on screen, but the shift report later shows −3M for that table. The two numbers don't match → user confusion → exactly what was reported now.

## Decision

Keep `gaming_tables.closing_result` semantics unchanged (= raw physical Σ(actual − baseline) × denom). It remains the audited "what's physically on the table vs float" number. The DB trigger / RPC continues to add −Fill+Credit on top — no schema or trigger changes.

Only the **UI** of Chip Count (Close Tables wizard) changes to make Fill/Credit visible and to show the corrected Final Result alongside.

## Scope (frontend only)

### 1. Load per-table Fill / Credit for the OPEN shift
- Reuse existing `useShiftTableAdjustments` (or equivalent — same source that feeds `liveTableResult`'s `adjustmentMap`) inside `CloseTableWizard`.
- Result: `adjustmentMap[tableId] = Σ Credit − Σ Fill` (signed, same sign convention as `liveTableResult`).

### 2. Update the wizard footer (lines ~340-355)
Replace the single "Result" block with three compact lines:

```
Chip Count        +7 000 000   ← raw physical (current calcResult)
Fill              −10 000 000  ← only if non-zero
Credit             +5 000 000   ← only if non-zero
─────────────────────────────
Result             +2 000 000   ← chipCount + adjustment (matches shift P&L)
```

- Hide Fill/Credit rows when both are 0 (most common case — keeps UI clean).
- Use `cms-amount-positive` / `cms-amount-negative` semantic classes.
- The big "Result" is the **adjusted** value (this is the number Pit cares about and the one that ends up in the shift report).

### 3. Update per-table badges in the left list (line ~244-249)
Each closed table currently shows `closing_result` (raw). Change to `closing_result + (adjustmentMap[t.id] ?? 0)` so the list value matches the footer and the shift report. Color logic stays the same.

### 4. Save unchanged
`setSingleResult.mutate` continues to send `closing_result = calcResult(...)` (raw). No DB / RPC / trigger changes.

## Out of scope
- DB schema, triggers, RPCs.
- `liveTableResult` / Tables page / Dashboard — they already apply the adjustment.
- Tracker / Analytics flows.

## Files touched
- `src/components/tables/CloseTableWizard.tsx` — only file.
- Possibly tiny import addition if the existing adjustments hook isn't already imported.

## QA checklist
1. Open a table, do a Fill 10M from Cage, do Chip Count of the same table with physical = baseline + 10M → wizard shows: Chip Count +10M, Fill −10M, **Result 0**.
2. Credit 5M, Chip Count = baseline → Chip Count 0, Credit +5M, **Result +5M**.
3. No Fill/Credit at all → only single "Result" line is visible (no clutter).
4. After closing, the per-table badge in the left list equals the footer Result and equals what the shift closing report shows for that table.

## Memory update
After implementation, update `mem://features/live-table-result-resolution` to note that the Close Tables wizard now displays the adjusted Result (raw chip-count + Fill/Credit) in both the footer and the per-table list, so on-screen number matches `shifts.tables_result`.
