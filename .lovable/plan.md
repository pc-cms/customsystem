# Drop по столам = сырая сумма IN (для всех казино)

## Новое правило
Per-table Drop везде (экран Reports/Table + печатный Shift Closing Report, все казино) = **простая сумма `transactions.amount` по столу за период, где `type = 'buy_in'` и `cancelled_at IS NULL`**. Без NEP-сплита, без peak-per-player, без `table_daily_results.drop_amount`, без `player_day_drop_cache`.

Total Drop (итоговая строка/KPI) остаётся из `player_day_drop_cache` через `fetchTotalDrop`. Per-table сумма может не совпадать с Total — by design.

## Изменения

### 1. `src/components/cage/ShiftClosingReport.tsx`
- Убрать NEP-split (`splitTablesWindow`, import из `@/lib/nep-split`), убрать использование `dailyResults[t.id].drop`.
- `inByTable` заполнять прямой агрегацией из уже загружаемого `tx`:
  ```
  Σ tx.amount где tx.type = 'buy_in' AND tx.table_id = t.id AND cancelled_at IS NULL
  ```
- В строках таблицы печатать это значение для **всех казино** (снять гейт `mwanza/arusha`). `·` если 0.
- Total row по колонке DROP — оставить `totalDropFromCache`.

### 2. `src/pages/TableResults.tsx`
- Убрать гейт `showPerTableDrop` — показывать Drop по столам всем и всегда.
- Заменить источник `drop` в ячейках:
  - Было: `drop: Number(r.drop_amount || 0)` из `table_daily_results`.
  - Станет: сумма IN из `transactions` по (business-day, table_id) за выбранный диапазон.
- Добавить запрос в `transactions` рядом с существующим (по `casino_id`, диапазон дат, `type='buy_in'`, `cancelled_at IS NULL`) и построить карту `{date -> {table_id -> sumIn}}`.
- Бизнес-день: rollover 07:00 EAT (Africa/Dar_es_Salaam) — группировать через `date(created_at AT TIME ZONE 'Africa/Dar_es_Salaam' - interval '7 hours')` или существующую утилиту проекта.
- Итоги за период и drill-down `DayDetail`: тот же источник (Σ IN), не `drop_amount`.

### 3. Память
- Обновить Core-правило Drop в `mem://index.md`:
  «Per-table Drop = Σ IN (raw buy-in transactions) per table, во всех казино, на экране и в печати. Total Drop = SUM(peak) из `player_day_drop_cache` — считается отдельно, значения могут расходиться».
- Обновить `mem://features/drop-source-of-truth` под новое правило (удалить упоминания NEP-split и `drop_amount` как источника per-table).

## Технические детали
- Тип транзакции IN — `'buy_in'` (подтвердить перед правкой быстрым SELECT на `transactions.type`).
- Отменённые исключаются через `cancelled_at IS NULL`.
- Никаких изменений в БД, миграций и RLS не требуется.
