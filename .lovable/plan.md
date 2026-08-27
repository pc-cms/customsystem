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

## Изменения в сводных карточках (Summary cards)

**Карточка A · Month Summary / Income:**
- Убираем нижнюю итоговую строку **«Total Income»** (строки 778–784) — значение уже есть в плитке Total Income.

**Карточка B · Expenses & Obligations:**
- Убираем нижнюю итоговую строку **«Total Expenses & Obligations»** (строки 892–901) вместе с вычислением `obligationsTotal` и импортом `totalExpensesAndObligations` (больше нигде в файле не используется — проверено, строки 30, 486, 894).

**Карточка C · Cash Adjustments:**
- Убираем строку **«Office»** (строка 931).
- **Investment** (строка 932): строка `Line` → раскрывающаяся секция `Section` со стрелкой-шевроном, как Basic Float/Deposits. Детали: каждая запись `fin_other_incomes` с `source = 'investment'` за месяц (дата, описание, сумма в TZS). Для этого в `use-fin-monthly-report.ts` в запрос `fin_other_incomes` (строка 244) добавляются поля `id, label` и в результат кладётся массив `cash.investment_items`.
- **Collections** (строки 933–937): строка `Line` → раскрывающаяся секция `Section`. Детали: разбивка по категориям группы `collections` из уже загруженного `data.collections.categories` (название категории + actual Grand TZS). Новых запросов не требуется.
- Итоги обеих секций и тултипы формул сохраняются без изменений — меняется только способ отображения (стрелка + раскрытие).

## Технические детали
- Файлы: `src/pages/finances/FinancesMonthlyReportPage.tsx` (блок `SummaryBlock`), `src/hooks/use-fin-monthly-report.ts` (поля `id, label` в select и `cash.investment_items` в результате; тип `MonthlyReport.cash` дополняется).
- Все поля плиток уже есть в `use-fin-monthly-report.ts`: `cash.expenses_actual`, `cash.deposits` (678), `cash.investment` (654), `cash.collections_actual` (671), `kpi.total_income`, `g.plan_month_grand_tzs`.
- Сетка плиток: `xl:grid-cols-6` → адаптивная `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-7` (7 плиток без пустот).
- Правила «ровно 5 строк на карточку» больше нет — убираемые строки просто удаляются, `flex-1` спейсеры сохраняют выравнивание.
- UI только на английском; числа через `fmtT`; даты `fmtDateOnly` (DD/MM/YYYY).

## Проверка
- `bunx vitest run` — существующие тесты зелёные.
- Сборка без ошибок (`/tmp/observability/build-errors.log`).
- Визуальная проверка Monthly Report (открытый и закрытый месяц): 7 плиток, Pending = Budget − Paid, Current Cash Balance сходится с ручным расчётом; Office/Total Income/Total Expenses & Obligations отсутствуют; Investment и Collections раскрываются стрелкой и показывают строки деталей.
