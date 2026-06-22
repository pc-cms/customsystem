## POS Manager Dashboard — UI Cleanup (ready to implement)

Single-file change: `src/pages/pos/PosManager.tsx`. No backend, no migrations, no logic touched.

### Card model
Add `status: "live" | "beta" | "soon"` to each card. Render a status badge in the card's top-right. `soon` cards render as a disabled-looking `<button>` (no `<Link>`, no navigation) that fires a sonner toast: **"This module is planned for a future phase."**

### Final 15 cards

| # | Title | Subtitle | Status |
|---|---|---|---|
| 1 | Menu | Categories, items, prices, stock & availability | Live |
| 2 | Inventory | Stock levels, movements, recipe consumption & reversals | Live |
| 3 | Purchases | Purchase entry and receiving — planned future phase | Coming soon |
| 4 | Pricing review | Suggested prices from moving-average cost — future phase | Coming soon |
| 5 | Stock variance | Bartender shelf counts vs system stock | Beta |
| 6 | Shift reconciliation | Sales vs cash vs stock variance per shift | Beta |
| 7 | Reports | Sales by waiter, top items, payment mix | Live |
| 8 | Cost control | COGS and margin reporting — planned for Phase 3C-3 | Coming soon |
| 9 | Player analytics | F&B consumption by player + drill-down | Live |
| 10 | Problem orders | Marked-as-problem and force-closed orders | Live |
| 11 | Locations | Main Bar, Coffee Counter, VIP service… | Live |
| 12 | Modifiers | Price modifiers, allowed items & recipe effects | Live |
| 13 | Recipes / BOM | Recipe ingredients, BOM and stock deduction rules | Live |
| 14 | Player charges | Outstanding postpaid F&B tabs | Live |
| 15 | Shifts & Z-reports | Per-waiter sales and shift close | Coming soon |

### Badges
- Live → `Badge variant="secondary"`
- Beta → `Badge variant="outline"` + amber text
- Coming soon → `Badge variant="outline"` + muted text

### Layout
Untouched. Same grid, icons, dark theme. Only label, subtitle, badge, and disabled behavior changes.

Please switch to **build mode** to apply.
