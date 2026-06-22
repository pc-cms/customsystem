## Fixes for Budget tables

### Files
- `src/pages/finances/FinancesBudgetPage.tsx` (Budget tab)
- `src/pages/finances/FinancesBudgetDifferencePage.tsx` (Difference tab)

### Problems observed
1. Sticky header and sticky totals use translucent `bg-muted/40` / `bg-muted/60` / `bg-primary/10` — rows scroll through and bleed visually (the "TOTAL TZS / TOTAL USD / GRAND TZS" overlap with category labels in the screenshot).
2. In Difference, month columns are too narrow → values like `-2 009 000` wrap to two lines.
3. User wants Grand totals at the TOP (under the page header), and only the column header row sticky — no sticky footer.

### Plan

**FinancesBudgetPage.tsx**
- Replace all translucent sticky backgrounds (`bg-muted/40`, `bg-muted/60`, `bg-muted/30`, `bg-primary/10`, `bg-card`) on `thead`, sticky left column cells, sticky right `Plan Year` cells, and sticky group/subtotal cells with fully opaque tokens: `bg-background` (header strip) and `bg-card` (body sticky column). For the highlighted Grand row use a solid token like `bg-secondary` (or `bg-muted` without alpha).
- Move the three summary rows (Total TZS / Total USD / Grand TZS) OUT of `<tfoot>` and render them as a separate compact summary block ABOVE the scroll container (a small `PageSection` or inline div with the same monthly cells). Drop `<tfoot>` and its `sticky bottom-0` entirely.
- Keep only the `thead` sticky (`sticky top-0 z-30`), with solid `bg-background` and a bottom border so scrolled rows don't show through.
- Sticky left "Category" column and sticky right "Plan Year TZS / USD" columns: set solid `bg-card` (no alpha) and add `border-r` / `border-l` so they read as panels.

**FinancesBudgetDifferencePage.tsx**
- Increase per-month column width from `w-[72px]` to `w-[96px]` and the wrapping table `min-w` so the table overflows horizontally instead of wrapping cell contents; add `whitespace-nowrap` on numeric cells.
- Wrap the table in `overflow-x-auto` (already `overflow-auto`) but also add explicit `min-w-[1400px]` on the `<table>` so horizontal scroll triggers on narrow screens.
- Make the sticky `thead` and sticky left Category / right YTD columns use solid `bg-background` / `bg-card` (no `/40` alpha), matching the Budget fix.

### Out of scope
- No data, formula, or RPC changes. Pure layout/styling.
- Difference page keeps its existing single sticky header (already no footer).

### Expected result
- No translucent overlap; sticky header is opaque, sticky left/right columns are opaque.
- Grand/Total rows shown as a fixed summary panel at the top of the Budget page; only column header sticks while scrolling.
- Difference table scrolls horizontally; no number wraps to a second line.
