## Monthly Report — USD columns & Grand Total

Scope: `src/pages/finances/FinancesMonthlyReportPage.tsx` only. No backend / hook / migration changes — `useMonthlyReport` already returns `plan_*_usd`, `actual_usd`, `actual_grand_tzs`, `usd_rate`, and group totals.

### 1. Remove "Show USD" toggle
- Drop the `Switch` + `Label` "Show USD" control in the header.
- Drop the `showUsd` state and remove the prop from `<GroupTable>`.
- Render USD columns unconditionally (the existing `{showUsd && …}` blocks become permanent cells).

### 2. Add Grand TZS column to each category row + group total
In each group table, after the existing Plan/Year, Plan/Mo, Actual, %, MTD, Remain blocks, add a new column **Grand TZS** that shows:
- per category row: `actual_grand_tzs` (Σ amount_tzs across all currencies, already in the hook)
- per group total row: `group.totals.actual_grand_tzs`

This is the row-level equivalent of what Total Budget block shows globally and answers "сколько в TZS-эквиваленте потрачено с учётом USD-расходов".

Header order (left → right):
```
Category │ Plan/Year TZS │ Plan/Year USD │ Plan/Mo TZS │ Plan/Mo USD │ Actual TZS │ Actual USD │ Grand TZS │ % │ MTD │ Remain TZS │ Remain USD │ Remain %
```

### 3. Add in-table Grand Total row under the last group
After the last non-collections group, render a single sticky-styled **Grand Total** row (same component pattern as group total rows but visually emphasised: bold + accent border). Values pulled from `data.grand`:
- Plan/Mo TZS = `grand.plan_month_tzs`
- Plan/Mo USD = `grand.plan_month_usd`
- Actual TZS = `grand.actual_tzs`
- Actual USD = `grand.actual_usd`
- Grand TZS = `grand.actual_grand_tzs`
- Remain TZS / USD / Grand TZS computed inline
- % = `actual_grand_tzs / plan_month_grand_tzs`

The existing standalone "Total Budget" PageSection stays (it carries the USD→TZS rate caption), but the in-table Grand row removes the need to scroll for the headline number.

### 4. Show USD→TZS rate in header
Next to the period/casino switcher, add a small muted caption: `USD→TZS @ {rate}` when `data.usd_rate > 0`. Same `formatNumberSpaces` formatting as the Total Budget caption.

### 5. XLSX export
Already exports all USD + Grand columns (lines 106, 129, 144, 204). No change needed beyond keeping headers aligned with the new column order if we reorder. Safer: keep export order unchanged, only adjust on-screen column order.

### Verification
- Toggle gone; USD columns always visible in every group table.
- Each category row shows a Grand TZS cell equal to row's `actual_grand_tzs`.
- Grand Total row appears once, after the last operating group (not inside Collections), bold.
- USD→TZS rate caption shows in header when rate > 0.
- No changes outside `FinancesMonthlyReportPage.tsx`.
