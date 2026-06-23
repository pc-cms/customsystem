## Monthly Report — refactor summary block and Remain calculation

### Goal

Reorganize `src/pages/finances/FinancesMonthlyReportPage.tsx` so the entire month summary (Incomes, Plan, Actual, **Remain = Plan/Month − Actual**, Profit, Net Balance) sits **at the top in one compact table**, and all per-group category detail follows below. Fix the Remain figure so it consistently means "Plan/Month − Actual this month" everywhere, and surface it as the "unpaid balance for the current month".

### Changes

**1. New top "Summary" block (replaces today's Incomes card + Grand Total card + Total Budget card + Profit card + Net Balance card)**

One bordered table with three vertical sections, in this order:

```text
INCOMES        | TZS              | USD       | Grand TZS
  Live Game    | …                | —         | …
  Slots        | …                | —         | …
  Other        | …                | …         | …
  Total Income | …                | …         | … (bold)

BUDGET (Month) | Plan/Mo  | Actual | Remain (Plan−Actual) | %
  TZS          | …        | …      | …                    | …
  USD          | …        | …      | …                    | …
  Grand TZS    | …        | …      | … (bold, colored)    | …

RESULT         | TZS                          | Grand TZS
  Profit       | Income − Actual (Grand)      | …
  Collections  | …                            | …
  Net Balance  | Profit − Collections (bold)  | …
```

- "Remain" row in BUDGET is the headline "unpaid balance for the current month" — Plan/Month − Actual. Positive = budget left, negative = over budget. Color via existing `cms-amount-positive` / `cms-amount-negative`.
- USD→TZS rate footer stays under this table.
- Drop the now-duplicated `Grand Total`, `Total Budget`, `Profit`, `Net Balance` page sections.
- Keep `Incomes` data but inside the new block (no separate card).

**2. Fix Remain consistency**

In `useMonthlyReport` (`src/hooks/use-fin-monthly-report.ts`) and in the page:

- Define `remain_tzs = plan_month_tzs − actual_tzs`, `remain_usd = plan_month_usd − actual_usd`, `remain_grand_tzs = plan_month_grand_tzs − actual_grand_tzs` at category, group, and grand level inside the hook (so UI and Excel use one source).
- Replace inline arithmetic in the page (`data.grand.plan_month_tzs - data.grand.actual_tzs`, etc.) with these fields. Same for group totals row in `GroupTable` and per-row in `Row`.
- Excel export uses the same fields.
- This removes the "annual − month" confusion the user reported: every Remain cell is now explicitly `Plan/Month − Actual` for the selected month only. Plan/Year columns stay in the per-group detail table for reference only (read-only).

**3. Per-group category tables — keep below summary, minor cleanup**

- Render groups (and Collections) unchanged structurally, but:
  - Remove the page-level `Grand Total` section (moved into summary).
  - Remove the standalone `Total Budget` section (moved into summary).
  - Keep group tables (`GroupTable`) and expand/drill-down behavior identical.
  - In group footer row, use the new `remain_*` fields from the hook for consistency.

**4. Layout order on the page**

```text
PageHeader (month/year/scope filters + XLSX)
└─ Summary block (NEW — Incomes + Budget + Result, single bordered table)
└─ Per-group tables (Fixed, Tax, Variable, Salary, Petrol, Additional)
└─ Collections group table
```

`Profit` and `Net Balance` no longer appear as separate sections — they live in the Summary block's RESULT rows.

### Technical notes

- Files touched:
  - `src/hooks/use-fin-monthly-report.ts` — add `remain_tzs`, `remain_usd`, `remain_grand_tzs` to `ReportCategory`, `ReportGroup.totals`, and `MonthlyReport.grand`. Compute once in the hook.
  - `src/pages/finances/FinancesMonthlyReportPage.tsx` — new `SummaryBlock` component replacing 4 existing `PageSection`s; switch all Remain reads to hook fields; keep Excel export but read from same fields.
- No DB / migration changes. No business logic change beyond centralizing the Remain formula.
- Existing color tokens (`cms-amount-positive`, `cms-amount-negative`) and `formatNumberSpaces` reused — no new design tokens.
- Mobile: summary table uses `overflow-auto` wrapper like existing tables; rows stack horizontally with sticky first column.

### Out of scope (will follow up separately if needed)

- A real "pending/unpaid expenses" status field (you confirmed Remain = Plan − Actual is enough for now).
- Any change to budget entry, expense entry, or per-casino network view logic.
