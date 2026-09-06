# Live-отчёт V2: колонка Drop в таблице столов

## Ответ на вопрос «В какой строке ТОТАЛ?»
Сейчас общий Drop выводится в **footer-строке «Total»** таблицы Gaming Tables (последняя строка таблицы столов) — это Total Drop из `player_day_drop_cache`.

## Что меняем (только `src/components/cage/LiveClosingReportV2.tsx`)

1. **Переименовать колонку** «Turnover (Drop)» → **«Turnover»**.
2. **Вставить новую колонку «Drop»** в таблицу Gaming Tables сразу после Fill/Credit:
   ```
   Table | Opening | Fill | Credit | Drop | Closing | Turnover | Result
   ```
3. **По столам**:
   - колонка **Drop** — пустая (заглушка для будущего значения);
   - колонка **Turnover** — drop per table (`r.dr`).
4. **Строка Total**:
   - колонка **Drop** — пустая;
   - колонка **Turnover** — общий Drop из `player_day_drop_cache`.
5. Плитки KPI не меняем.

Больше ничего не трогаем: источник Total Drop, печать и разметка не меняются.

## Проверка
- `tsgo --noEmit` без ошибок.
- Печатный прогон Live-отчёта (Аруша 05/09) — PDF: колонка Drop после Fill/Credit пустая, Turnover с drop per table, итог в строке Total совпадает.
