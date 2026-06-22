## Budget tables — snap-per-month, fixed dividers, sticky borders

Apply to all three budget pages:
- `FinancesBudgetPage.tsx` (TZS/USD twin per month)
- `FinancesBudgetDifferencePage.tsx` (single per month)
- `FinancesBudgetVsActualPage.tsx` (plan/actual/var group per month)

### Fixes

**1. Snap exactly per month group (not per sub-column)**
- Apply `scroll-snap-align: start` ONLY on the outer per-month `<th>` (already correct in Budget, since `colSpan=2` th carries it). For Difference and VsActual it's already per-month.
- Set `scroll-padding-left` on container = `catW + 1` so first month column lands flush against the sticky Category column (currently scrollPaddingLeft is set but month column ends up partially under sticky Category — increase to `catW + 8` and add `scroll-snap-stop: always` on the snap targets to force per-step snap and prevent half-column landing).
- Add `scroll-snap-stop: always` to each month header (Tailwind: `[scroll-snap-stop:always]`).

**2. Vertical column dividers in every body cell**
- Currently only first sub-column of each month carries `border-l`. Add a stronger `border-l-2 border-border` on the FIRST sub-column of each month (the TZS one) and a thin `border-l border-border/40` on the USD sub-column — gives clear month-group boundaries plus light inner divider.
- For Difference / VsActual: add `border-l border-border` on every month cell.

**3. Sticky first & last columns must show clear non-scrolling borders**
- Replace `border-r border-border` on sticky Category column with `shadow-[1px_0_0_0_hsl(var(--border))]` (a stuck right edge that always renders above scrolling content).
- Replace `border-l border-border` on sticky right Plan-Year columns with `shadow-[-1px_0_0_0_hsl(var(--border))]`.
- Keeps the divider crisp regardless of scroll position (CSS borders on sticky cells can disappear under overlapping content).

**4. Budget page Category sticky width fix**
- Set `scrollPaddingLeft: catW` exactly + `scroll-snap-stop: always` so the next month doesn't end up half-hidden under the sticky Category column.

### Implementation details

- Reuse same `monthW`, `catW`, `yearW` constants per page.
- All purely CSS / className changes; no data, RPC, or formula changes.
- Version bump to `v1.3.407` in `package.json`.

### Files
- `src/pages/finances/FinancesBudgetPage.tsx`
- `src/pages/finances/FinancesBudgetDifferencePage.tsx`
- `src/pages/finances/FinancesBudgetVsActualPage.tsx`
- `package.json`
