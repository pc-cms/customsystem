
## Monthly Report — polish USD glyph, neutralize colors, rename columns, enlarge Summary

Targeted tweaks to `src/pages/finances/FinancesMonthlyReportPage.tsx`. No data/hook changes.

### 1. `$` glyph — move to column header, match header style

Currently the `$` is rendered as a small sky-blue prefix in front of every USD number. Instead:

- Drop `UsdGlyph` from every body cell (`UsdAmt`, plan input cell, Summary USD row).
- In all USD column **headers**, the label becomes a single `$` sign — same size as the header font (`text-[11px]` in GroupTable, `text-[10px]` in Summary), same muted color as the rest of the header (`text-muted-foreground`, no sky-blue, no bold).
- Helper change: `UsdAmt` simply renders the number (no glyph). Keep the `—` fallback for zero.

### 2. Stronger USD column fill

`USD_COL` bumps from `bg-muted/40 dark:bg-muted/20` to `bg-muted/70 dark:bg-muted/40` so the vertical stripe is clearly visible against `bg-card`. Applied identically in `GroupTable` headers/cells/totals and in the Summary Budget USD row.

### 3. Neutralize number colors — keep heat-map only on Grand TZS

In `GroupTable` `<Row>` and totals row:

- Plan TZS, Plan USD, Actual TZS, Actual USD, Remain TZS, Remain USD → no `cls()`; render with default `text-foreground` (white in dark mode).
- **Grand TZS** column (Actual Grand, Remain Grand) keeps `cls()` signed coloring.
- `%` columns keep `pctTone()` heat-map (green / neutral / yellow / orange / red).

In Summary `Budget` card:

- TZS row and USD row → drop `cls()` on Remain cells; numbers stay white.
- **Grand TZS** row keeps `cls()` on Remain and `pctTone()` on `%`.

### 4. Rename "Grand Total" → "Grand TZS"

`GroupTable` header (line 569) `Grand Total` becomes `Grand TZS` so it matches the Actual `Grand TZS` column and the Summary row label. Excel export header unchanged for now (separate ask).

### 5. Summary block typography & label cleanup

- `Ccy` header in Budget card → `Currency` (full word, widen column to `w-[90px]`).
- USD row label: currently `$ USD` in sky-blue bold — change to plain `USD` in muted style to match TZS row label (the `$` now lives in the column header instead).
- Body numbers in all 3 Summary cards: bump from `text-[12px]` to `text-[15px] font-bold`. Header strips and small hints under labels stay at current size.
- Row heights bump from `h-7` to `h-9` so the larger text breathes.
- Keep all "Profit / Owner withdrawals / Income − Actual / Profit − Collections" hints for now (user said remove later).

### 6. Behavior preserved

- All numbers, formulas, signed colors on Grand TZS, USD heat-map unchanged.
- Excel export untouched.
- No changes to hooks, queries, or other pages.

### Files touched

- `src/pages/finances/FinancesMonthlyReportPage.tsx` (helpers + `SummaryBlock` + `GroupTable` header + `Row`).
