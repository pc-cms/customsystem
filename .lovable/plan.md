# Live-отчёт V2: Turnover-колонка и плитка Drop

## Ответ на вопрос «В какой строке ТОТАЛ?»
Сейчас общий Drop выводится в **footer-строке «Total»** таблицы Gaming Tables (последняя строка таблицы столов) — это Total Drop из `player_day_drop_cache`.

## Что меняем (только `src/components/cage/LiveClosingReportV2.tsx`)

1. **Переименовать колонку** «Turnover (Drop)» → **«Turnover»** в таблице Gaming Tables.
2. **По столам** вместо «·» выводить **drop per table** (значение `r.dr` из строки стола).
3. **Строка Total** остаётся без изменений: в ней всё ещё выводится общий Drop из `player_day_drop_cache`.
4. **Добавить Drop в плитки KPI сразу после Fill/Credit**: KpiStrip станет
   `Tables Result · Fill · Credit · Drop · Expenses · Tips · Chip Difference`
   (Drop = `num(totalDrop || 0)`).

Больше ничего не трогаем: источник Total Drop, печать и разметка не меняются.

## Проверка
- `tsgo --noEmit` без ошибок.
- Печатный прогон Live-отчёта (Аруша 05/09) — PDF: колонка «Turnover», по столам drop, итог в строке Total совпадает.
