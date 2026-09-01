# CAPEX как non-operating позиция в Monthly Report

CAPEX перестаёт быть частью операционных расходов месяца и переезжает в существующую секцию Collections (список «не операционные движения»), рядом с Collection и Money Change.

## Поведение после изменения

- CAPEX больше не входит в Paid Expenses, Estimated/Pending Expenses, Budget и Grand Total операционных расходов.
- CAPEX по-прежнему уменьшает Cash Position и Profit — ровно как Collections сегодня.
- CAPEX отображается строкой в секции Collections (Plan / Actual / Remaining) и в блоке деталей Collections на верхней панели.
- Правило применяется ко всем месяцам, включая прошлые. Уже закрытые месяцы сохраняют замороженный Final Profit из снапшота и не переписываются.
- Excel-экспорт отчёта повторяет ту же структуру.

## Что меняется технически

1. База: категория CAPEX (`fin_categories`, сейчас `group_code='additional'`) переносится в `group_code='collections'` с сортировкой после Collection. Существующие расходы не трогаются — они привязаны к категории, а не к группе.
2. `fin_balance_snapshot`: классификация расходов сейчас делит их по `gcode ILIKE '%collection%'`. После смены группы CAPEX автоматически попадает в `collections_total`, но текущее условие также отделяет Money Change/Transfer в `transfers_total` по имени. Добавляется явное исключение, чтобы CAPEX шёл в `collections_total`, а не в transfers.
3. `fin_month_finance` изменений не требует: он берёт `expenses_total` и `collections_total` из снапшота, поэтому Profit и Cash Position останутся корректными (CAPEX вычитается один раз, через collections).
4. `src/hooks/use-fin-monthly-report.ts`: CAPEX попадает в `collections` группу автоматически (группа `collections` уже исключена из `GROUP_ORDER` и `grand`). Проверяется, что `collections_actual` включает CAPEX и что он не задваивается.
5. `src/pages/finances/FinancesMonthlyReportPage.tsx`: отдельных правок структуры не требуется — CAPEX появится строкой в таблице Collections, в деталях KPI Collections и в Excel-экспорте. Обновляется подпись секции на «Collections & Non-Operating», чтобы название соответствовало содержимому.
6. `docs/FINANCE-FORMULAS.md`: фиксируется, что CAPEX — non-operating, вне Budget/Expenses, но внутри Collections для Profit и Cash Position.
7. Регрессионный тест в `src/test/expenses-collections-regression.test.ts` дополняется кейсом: расход CAPEX не увеличивает `grand.actual_grand_tzs`, но увеличивает `cash.collections_actual`.

## Проверка

Сравнить Monthly Report по казино за август и сентябрь до/после: Paid Expenses уменьшаются на сумму CAPEX, Collections увеличиваются на ту же сумму, Profit и Cash Position остаются неизменными.
