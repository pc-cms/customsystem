# CAPEX как отдельная позиция (вне расходов месяца)

Сейчас CAPEX — обычная категория расходов в группе `Additional Expenses` (`fin_categories.main_code = 'capex'`, факт за август: Mwanza 25.5M, Mbeya 9.1M, Arusha 5.0M). Поэтому он попадает и в Budget (Estimated Expenses), и в Paid Expenses, и во все отчёты по расходам.

Решение: CAPEX выделяется в собственную группу и во всех отчётах показывается отдельной строкой — по той же схеме, что уже работает для Collections. Деньги реально ушли, поэтому CAPEX по-прежнему уменьшает Cash Position и Profit, но больше не входит в «расходы месяца» и не сравнивается с бюджетом операционных расходов.

## Что изменится для пользователя

- **Monthly Report (Office)**
  - Budget / Estimated Expenses больше не включает плановый CAPEX.
  - Paid Expenses больше не включает фактический CAPEX.
  - Появляется отдельная строка **CAPEX** (Plan / Actual / Remaining) в блоке Expenses & Obligations, рядом с Collections.
  - Profit и Cash Position остаются прежними по величине: CAPEX вычитается из них отдельным слагаемым.
- **Dashboard TV / Boss report** — Estimated Expenses без CAPEX, добавляется отдельная строка CAPEX.
- **Budget vs Actual и Budget · Difference** — CAPEX выносится в отдельную секцию, не входит в итоговую строку операционных расходов.
- **Expenses by Category / Casino Monthly Balance** — CAPEX отдельной строкой, вне колонки Expenses (как Collections).
- Ввод расходов не меняется: категория CAPEX выбирается как раньше.

## Техническая часть

Признак: `fin_categories.main_code = 'capex'`. Миграция переносит категорию в собственную группу `capex` / «CAPEX» (сортировка после Additional, перед Collections).

Backend:
- `fin_balance_snapshot` — в CTE расходов добавить третий фильтр: `capex_total` (группа/main_code = capex) исключается из `expenses_total`; ключ `capex_total` добавляется в JSON.
- `fin_month_finance` — `v_budget` исключает строки `fin_budget` по CAPEX-категориям; новая переменная `v_capex` из snapshot; `v_cash` и `v_profit` дополнительно вычитают `v_capex` (величина итогов не меняется, меняется только состав); `capex` возвращается в payload; бонус менеджера считается от базы без CAPEX (как сейчас — от Budget, который теперь без CAPEX).
- `boss_monthly_report` — `estimated` без CAPEX-бюджета, новое поле `capex` per casino.

Frontend:
- `src/hooks/use-fin-monthly-report.ts` — группа `capex` исключается из `GROUP_ORDER`/`grand`, отдаётся отдельно (`capex: ReportGroup | null`), плюс `cash.capex_actual` из `fin_month_finance`.
- `src/pages/finances/FinancesMonthlyReportPage.tsx` — строка CAPEX в Expenses & Obligations, tooltip с формулой; Pending Est Expenses считается без CAPEX.
- `src/hooks/use-boss-monthly-report.ts` + Dashboard TV — строка CAPEX, `estimated` без CAPEX.
- `FinancesBudgetVsActualPage.tsx`, `FinancesBudgetDifferencePage.tsx` — отдельная секция CAPEX вне Σ.
- Отчёт Expenses by Category / CMB — CAPEX отдельной строкой вне колонки Expenses.
- Обновить `docs/FINANCE-FORMULAS.md` и поднять версию в `package.json`.

Проверка: за август по трём казино сверить, что Expenses уменьшились ровно на сумму CAPEX, а Profit и Cash Position остались прежними.
