# Live-отчёт V2: DROP-колонка и плитка Drop

## Ответ на вопрос «В какой строке ТОТАЛ?»
Сейчас общий Drop выводится в **footer-строке «Total»** таблицы Gaming Tables (последняя строка таблицы столов) — это Total Drop из `player_day_drop_cache`. По отдельным столам в колонке стоит «·» (канон: постоловый Drop не печатаем).

## Что меняем (только `src/components/cage/LiveClosingReportV2.tsx`)

1. **Переименовать колонку** «Turnover (Drop)» → **«DROP»** в таблице Gaming Tables.
2. **Добавить Drop в плитки KPI сразу после Fill/Credit**: KpiStrip станет
   `Tables Result · Fill · Credit · Drop · Expenses · Tips · Chip Difference`
   (Drop = `num(totalDrop || 0)`, то же значение, что в строке Total).

Больше ничего не трогаем: постоловые «·», источник Total Drop, печать и разметка не меняются.

## Проверка
- `tsgo --noEmit` без ошибок.
- Печатный прогон Live-отчёта (Аруша 05/09) — PDF: колонка «DROP», плитка Drop после Credit, итог в строке Total совпадает.
