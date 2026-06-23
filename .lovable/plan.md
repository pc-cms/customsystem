## Monthly Report — двухуровневая шапка групповых таблиц

### Новая структура колонок (11)

```text
┌──────────┬──────────────┬──────────────────────────┬──────────────────────────┐
│ Category │     Plan     │          Actual          │        Remaining         │
│          ├──────┬───────┼──────┬──────┬───────┬────┼──────┬──────┬───────┬────┤
│          │ TZS  │  USD  │ TZS  │ USD  │ Grand │ %  │ TZS  │ USD  │ Grand │ %  │
│          │      │       │      │      │  TZS  │    │      │      │  TZS  │    │
└──────────┴──────┴───────┴──────┴──────┴───────┴────┴──────┴──────┴───────┴────┘
```

Что убираем по сравнению с текущей таблицей:
- `Plan/Year TZS` и `Plan/Year USD` — годовой план в месячном отчёте не нужен.
- `MTD` (колонка «June» / месяц‑to‑date) — убираем.

Что оставляем и группируем:
- **Plan** → TZS, USD (`plan_month_tzs`, `plan_month_usd`, инлайн‑редактируются как сейчас).
- **Actual** → TZS, USD, **Grand TZS**, **%**
  - `actual_tzs`, `actual_usd` — нативные валюты.
  - Grand TZS = `actual_grand_tzs` (Σ `amount_tzs`).
  - % = `actual_grand_tzs / plan_month_grand_tzs` — общий процент исполнения (считается по сумме TZS + сконвертированный USD, потому что расходы бывают в двух валютах).
- **Remaining** → TZS, USD, **Grand Total**, **%**
  - `remain_tzs`, `remain_usd`, `remain_grand_tzs` из хука.
  - % = `remain_grand_tzs / plan_month_grand_tzs`.
  - Цвета: `cms-amount-positive` / `cms-amount-negative` через `cls()`.

Между группами Plan / Actual / Remaining — вертикальные разделители `border-l border-border`.

### Реализация

Файл: `src/pages/finances/FinancesMonthlyReportPage.tsx`.

1. **`GroupTable`** — переписать `<thead>` двумя строками:
   - row 1: `Category` (rowSpan=2, sticky), `Plan` (colSpan=2), `Actual` (colSpan=4), `Remaining` (colSpan=4).
   - row 2: `TZS`, `USD` × Plan; `TZS`, `USD`, `Grand TZS`, `%` × Actual; `TZS`, `USD`, `Grand Total`, `%` × Remaining.
   - В строке `Total` группы — соответствующие 11 ячеек из `group.totals`.
   - `colCount` → 11.

2. **`Row`** — те же 11 колонок:
   - Plan TZS/USD: `InlineNumberCell` с `onPlanCommit(c.id, "TZS"|"USD", v)` (как сейчас).
   - Actual TZS/USD/Grand: `fmt(c.actual_tzs)`, `fmt(c.actual_usd)`, `fmt(c.actual_grand_tzs)`.
   - Actual %: `c.plan_month_grand_tzs ? pct(c.actual_grand_tzs / c.plan_month_grand_tzs) : "—"`.
   - Remaining TZS/USD/Grand: `c.remain_tzs`, `c.remain_usd`, `c.remain_grand_tzs` с `cls()`.
   - Remaining %: `c.plan_month_grand_tzs ? pct(c.remain_grand_tzs / c.plan_month_grand_tzs) : "—"`.

3. **Drill‑down раскрывашка по расходам** — без изменений, только `colSpan={11}`.

4. **Excel‑экспорт `exportXlsx`** — синхронизировать колонки:
   `Category | Plan TZS | Plan USD | Actual TZS | Actual USD | Actual Grand TZS | Actual % | Remain TZS | Remain USD | Remain Grand TZS | Remain %` (11 шт). Убрать Plan/Year и MTD из header‑writer, групп‑итогов и Grand Total.

5. **Хук `useMonthlyReport`** — не трогаем, все нужные поля (`remain_*`, `plan_month_grand_tzs`, `actual_grand_tzs`) уже есть.

6. **`useCategoryMtd`** — больше не используется в групповых таблицах; пропсы `mtd`, `mtdMonthLabel` и вызов `useCategoryMtd` из `FinancesMonthlyReportPage` убираем.

### Что НЕ меняется

- `SummaryBlock` сверху (Incomes / Budget / Result).
- Инлайн‑редактирование плана, добавление/архив категорий, переименование группы.
- Drill‑down по расходам и `EditExpenseDialog`.
- `Plan/Year` остаётся в БД и в редакторе бюджета, просто не показывается в этом отчёте.
