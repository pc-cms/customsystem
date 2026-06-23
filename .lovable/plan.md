## Distinguish USD vs TZS visually in report tables

Currently TZS and USD numeric cells look identical — small numbers blur together. Three approaches, each on its own. Pick one (or combine A+B).

---

### Option A — Currency badge on USD cells (recommended, lightest touch)

Add a tiny `$` glyph as a leading badge inside every USD cell. TZS stays clean (it's the default), USD always shows a small green `$` chip.

```text
Plan TZS    Plan USD       Actual TZS   Actual USD
1 250 000   $ 4 500        980 000      $ 3 200
```

- Implementation: small `<span className="text-[10px] font-semibold text-emerald-600/80 mr-1">$</span>` prefix in every USD-rendering `<td>` (Plan USD, Actual USD, Remain USD).
- Also color the entire USD numeric in a slightly different tone: `text-emerald-700 dark:text-emerald-400` (kept subtle, NOT the signed red/green for losses — those still win for `cls()`).
- Header label changes from `USD` to `$ USD`.
- Pros: minimal noise, scannable at a glance, currency self-evident even out of context (e.g. exported screenshot).
- Cons: adds a tiny element to every USD cell.

### Option B — Vertical-stripe background tint on USD column block

Apply a faint background tint to the `Plan USD`, `Actual USD`, `Remain USD` columns so they read as a "USD strip" running down the table.

```text
Plan        |Plan|         Actual        |Actual|       Remain        |Remain|
TZS         |USD |         TZS    Grand  |USD   |       TZS   Grand   |USD   |
…tinted column backgrounds…
```

- Implementation: add `bg-amber-50/40 dark:bg-amber-950/20` (or sky/violet — pick one neutral hue) to USD `<th>`/`<td>` in the GroupTable and SummaryBlock.
- Pros: zero extra glyphs, very strong column-level grouping, works at any zoom.
- Cons: fights with row hover tint; needs careful contrast so the stripe doesn't drown the signed-amount colors.

### Option C — Dashed divider + suffix label inside each block

Inside each `Plan`/`Actual`/`Remain` block, add a dashed vertical divider between TZS and USD columns, and append a tiny `TZS`/`USD` suffix next to non-zero values.

```text
Plan TZS ┊ Plan USD     Actual TZS ┊ Actual USD     …
1 250 000┊  4 500 USD   980 000   ┊ 3 200 USD
```

- Implementation: replace `border-l border-border` between block sub-columns with `border-l border-dashed border-border/60`; add `<span className="text-[9px] text-muted-foreground ml-1">USD</span>` after USD amounts only.
- Pros: keeps a unified visual rhythm.
- Cons: suffix repeats in every row → visual noise; dashed lines can look "draft-y".

---

### Recommendation

**A + B combined, restrained:**

1. Tiny green `$` glyph in front of every USD value, plus subtle emerald text tint on USD numerics (option A).
2. Very faint `bg-muted/30` column tint on the three USD columns (Plan USD / Actual USD / Remain USD) so they read as a continuous vertical strip (option B, neutral hue — not amber — so it doesn't clash with the % heat-map).
3. Headers: rename `USD` → `$ USD` and add the same column tint.

This makes USD instantly recognisable without changing any number formatting or breaking the existing red/green signed-amount colors.

### Files touched

- `src/pages/finances/FinancesMonthlyReportPage.tsx`
  - `GroupTable` header & `Row` cells: add USD glyph + tint to the 3 USD columns and totals row.
  - `SummaryBlock`: apply the same USD glyph + tint to the USD row(s) in Incomes / Budget cards.
- No hook, no data, no Excel-export changes (Excel already labels columns explicitly).

### Behaviour preserved

- All amounts, formulas, and signed colors unchanged.
- `cls()` (positive/negative) still wins over the USD tint on `Remain USD`.
- Heat-map `pctTone()` on `%` cells unchanged.

---

Tell me **A**, **B**, **C**, or **A+B (recommended)** and I'll implement.
