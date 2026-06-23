## Month Summary — convert tall stacked table to a horizontal 3-card band

Current `SummaryBlock` is one tall table stacked **Incomes → Budget → Result**, scrolling far down the page. Reshape it into **3 side-by-side cards** on desktop, wrapping on narrow viewports.

### Layout

```text
┌─── INCOMES ────────────┐  ┌─────── BUDGET (Month) ─────────┐  ┌──── RESULT ─────┐
│ Source     TZS    $USD │  │       Plan    Actual   Remain  │  │ Profit     X TZS│
│ Live Game  ...     —   │  │ TZS   ...     ...      ...  %  │  │ Collections X TZS│
│ Slots      ...     —   │  │$USD   ...     ...      ...  %  │  ├─────────────────│
│ Other      ...     —   │  ├────────────────────────────────│  │ NET BAL   X TZS │
├────────────────────────│  │ Grand ...     ...      ...  %  │  │ (signed color)  │
│ TOTAL      ...     —   │  │ TZS                            │  │                 │
└────────────────────────┘  └────────────────────────────────┘  └─────────────────┘
```

- Outer wrapper: `grid grid-cols-1 lg:grid-cols-[1fr_1.5fr_0.9fr] gap-3`.
  - Budget card gets the widest track (3 numeric columns + %).
  - Result is narrowest (just label + one value).
- Each card: `rounded-md border-2 border-border bg-card overflow-hidden`, with an uppercase header strip `bg-muted/40 h-8 px-3` showing the card title.
- Card body: compact mini-table, `text-[12px]`, mono numerics, `h-7` rows, totals row `bg-muted/30 font-bold border-t-2`.
- The existing USD column tint + `$` glyph (just shipped) carries over to all three cards for consistency.

### Card contents

1. **Incomes** — 3 columns: Source · TZS · $ USD. Rows: Live Game, Slots, Other, **Total Income** (bold). Grand TZS is identical to TZS column today (no USD income), so drop the redundant `Grand TZS` column inside this card — the Total row is the grand.

2. **Budget (Month)** — 4 columns: Currency · Plan · Actual · Remain (with `%` shown small/muted under or beside Remain). Rows:
   - `TZS` row
   - `$ USD` row (tinted, glyph, sky label — matches GroupTable)
   - **Grand TZS** row (bold, top border)
   
   `Remain` uses `cls()` (signed colors); `%` uses the existing `pctTone()` heat-map so it stays consistent with the per-group tables.

3. **Result** — single value-per-row card. Rows:
   - Profit · `Income − Actual Grand` (small muted hint under label, not its own column)
   - Collections · `Owner withdrawals`
   - **Net Balance** (bold, separated by `border-t-2`)
   
   Saves horizontal space by collapsing the "Calculation" column into a sub-label.

### USD rate footer

Moves into the Budget card footer (`text-[10px] text-muted-foreground px-3 py-1.5 border-t`), since that's the only card where USD→TZS conversion matters.

### Responsive

- `≥ lg` (1024px+): 3 cards in one row.
- `md` (768–1024): 2-column grid — Incomes + Budget on top, Result full-width below.
- `< md`: stacks single column — same vertical experience as today on phones.

### Technical changes

- File: `src/pages/finances/FinancesMonthlyReportPage.tsx`.
- Replace the single `<table>` inside `SummaryBlock` with a `<div className="grid …">` containing three independent card `<div>`s, each with its own small `<table>`.
- Reuse helpers `fmt`, `fmtT`, `pct`, `cls`, `pctTone`, `USD_COL`, `UsdGlyph`, `UsdAmt`. No hook/data changes.
- `PageSection title="Month Summary"` wrapper stays.

### Behaviour preserved

- All numbers, formulas, signed colors, USD heat-map unchanged.
- `Remain = Plan − Actual`, `Profit = Income − Actual Grand`, `Net = Profit − Collections`.
- Excel export untouched.
