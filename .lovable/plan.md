# Полная сумма расходов в Casino Monthly Balance

Цель: колонка Expenses в CMB (и отчёт Expenses by Category) должна показывать все реальные расходы месяца, без «потерянных» статей.

## Что найдено

- Все расходы августа имеют категорию и статус approved — потерь из-за незаполненных полей нет.
- Статья **CAPEX** ошибочно лежит в служебной группе `collections`. Отчёт CMB исключает всю группу `collections` из колонки Expenses, поэтому из отчёта выпадают: Mwanza 10 471 000 (10/08) и Arusha 2 076 000. Это и есть основная недостача.
- Действительно не отнесены к главным категориям: Other Variable Expenses (~8.1 млн за август по трём казино), Missing Money — Cashiers, Convertions. Они попадают в строку Unallocated и в сумму входят — по решению остаются как есть.
- Служебные статьи Collection, Money Change, Inter-Casino Transfer Out остаются вне расходов (это движение денег, а не расход).

## Что делаем

1. Переносим статью CAPEX из группы `collections` в обычную группу расходов (`additional`), главная категория остаётся CAPEX. После этого CAPEX попадает в колонку Expenses и в Variance.
2. Проверяем, что строка Unallocated (Other Variable Expenses, Missing Money — Cashiers, Convertions) учитывается в итоге Expenses в CMB и в отчёте Expenses by Category — суммы главных категорий + Unallocated должны сходиться с колонкой Expenses.
3. Сверяем итог по каждому казино за 01–11 августа: сумма всех расходов минус Collection / Money Change / Inter-Casino Transfer должна совпадать с суммой колонки Expenses в CMB.
4. Повышаем версию приложения.

## Техническая часть

- Data-миграция: `UPDATE fin_categories SET group_code='additional', group_name='Additional' WHERE name='CAPEX'`.
- `use-daily-balance-report.ts`: логика `isCollectionCat` остаётся (по группе/имени `collection`), после смены группы CAPEX перестаёт под неё попадать; правок кода не требуется — только проверка итогов.
- `use-expenses-matrix.ts` / `ExpensesMatrix.tsx`: убедиться, что Unallocated входит в общий Total (иначе добавить в итоговую строку).
- Проверка выполняется SQL-сверкой по трём казино после применения миграции.
