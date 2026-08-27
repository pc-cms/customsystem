# Monthly Report — обновление KPI-плиток и карточек сводки

## Цель
Переработать блок `SummaryBlock` на странице **Finances → Monthly Report** (`src/pages/finances/FinancesMonthlyReportPage.tsx`): ряд KPI-плиток и три сводные карточки. Логика БД не меняется — используются существующие данные отчёта, добавляется одна детализация в хук.

## Текущий набор плиток
Total Income · Budget · Actual Expenses · Expected/Final Profit · Cash Position · Total Money

## Новый набор плиток (7 штук, порядок слева направо)

1. **Total Income** — без изменений (`kpi.total_income`).
2. **Budget** — без изменений (`g.plan_month_grand_tzs`).
3. **Paid Expenses** — переименование текущей «Actual Expenses» (`cash.expenses_actual`). Tooltip: «Σ approved expenses actually paid in the month (Grand TZS)».
4. **Pending Est Expenses** — новая плитка: `Budget − Paid Expenses` (`g.plan_month_grand_tzs − cash.expenses_actual`). Tooltip: «Remaining planned cost base: Budget − Paid Expenses». Если значение уходит в минус (перерасход) — показываем со знаком через `cls()`.
5. **Current Profit** — переименование «Expected Profit». Для открытого месяца — `Current Profit`, для закрытого оставляем `Final Profit` (формула `kpi.expected_profit` не меняется).
6. **Current Cash Balance** — новая плитка по формуле пользователя:
   `kpi.total_income − cash.expenses_actual − cash.deposits − cash.investment − cash.collections_actual`
   Tooltip: «Total Income − Paid Expenses − Deposits − Investment − Collection». Отображается со знаком (зелёный/красный через `cls()`).
7. **Total Money** — плитка **удаляется** вместе с её загрузкой: убираем `useOfficePeriod`, `useFinBalanceSnapshot`, `computeBalanceTotals` и неиспользуемый более код `walletTotals`.

## Важное уточнение
Плитка **Cash Position** (Basic Float + Income + Office + Investment + Intercompany − …) **остаётся без изменений** — она отражает полную кассовую позицию с Basic Float, а новая «Current Cash Balance» — упрощённый операционный остаток по формуле пользователя. Итого будет 7 плиток.

## Технические детали
- Файл: `src/pages/finances/FinancesMonthlyReportPage.tsx`, блок `SummaryBlock` (строки ~720–762).
- Все поля уже есть в `use-fin-monthly-report.ts`: `cash.expenses_actual`, `cash.deposits` (строка 678), `cash.investment` (654), `cash.collections_actual` (671), `kpi.total_income`, `g.plan_month_grand_tzs` — новых запросов к БД не требуется.
- Сетка: `xl:grid-cols-6` → `xl:grid-cols-7` неудобна для 7 плиток; используем адаптивную сетку `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-7`, чтобы плитки заполняли строку без пустот.
- Формулы в tooltip обновляются под новые названия; порядок плиток фиксированный, как сейчас.
- UI остаётся только на английском; числа через `fmtT` с пробелом-разделителем.

## Проверка
- `bunx vitest run` (существующие тесты не должны пострадать).
- Сборка без ошибок (`/tmp/observability/build-errors.log`).
- Визуальная проверка страницы Monthly Report на открытом и закрытом месяце: 7 плиток, Pending = Budget − Paid, Current Cash Balance совпадает с ручным расчётом по строкам карточек.
