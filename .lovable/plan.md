# Ускорить Drop на Pit Dashboard

## Проблема
На дашборде (роль Pit/Pit-менеджер) колонка **Drop** по столам появляется с задержкой: данные приходят через RPC `compute_tables_drop_split`, который проходит по всей истории NEP каждого игрока. На больших объёмах это занимает секунды, поэтому новое значение «доезжает» уже после визуального ожидания.

В Player Statistics такого ощущения нет, потому что там строка по игроку считается в основном из локальной суммы транзакций (`playerInDropSum`) и обновляется мгновенно по realtime-событию `transactions`. RPC-значение приходит уже как уточнение.

## Решение
Использовать на дашборде уже существующий материализованный кэш `table_day_drop_cache` (поддерживается триггерами на `transactions`) как **основной** источник Drop для текущего бизнес-дня, и оставить RPC только как фоновое уточнение для исторических дат.

### Что меняется

1. **Новый хук `useTablesDropCacheToday(businessDate)`** в `src/hooks/use-drop-split.ts`
   - Читает `table_day_drop_cache` по `casino_id` + `business_date`.
   - Агрегирует `drop_r_share` / `recycled_share` по `table_id` (в таблице запись на пару table×player).
   - `staleTime: 5_000`, без `refetchInterval` — обновления идут через realtime.

2. **Realtime-подписка на `table_day_drop_cache`** в `src/hooks/use-realtime.ts`
   - В блок, который подписывается на `transactions` (для всех ролей), добавить подписку `event: "*"` на `table_day_drop_cache` с фильтром `casino_id=eq.${casinoId}`, инвалидирующую ключ `["tables-drop-cache-today"]`.
   - Триггеры на `transactions` уже пишут в кэш — событие придёт как UPDATE/INSERT в `table_day_drop_cache` сразу после операции.

3. **`src/pages/Dashboard.tsx`**
   - Подключить `useTablesDropCacheToday(effectiveBusinessDate)` параллельно с `useTablesDropSplit(...)`.
   - В `tableRows` (строка с Drop) брать значение по приоритету: **cache → split → 0**. Так Drop появляется мгновенно из кэша, а если по какой-то причине кэш пуст, fallback на RPC сохраняется.
   - Если выбран не текущий бизнес-день, использовать только RPC (как сейчас).

4. **`src/pages/Tables.tsx`** — то же самое (там тот же `useTablesDropSplit` и та же задержка).

5. **PlayerStatistics, PlayerPreviewHeader** — не трогаем, поведение там уже устраивает.

## Технические детали

- Кэш `table_day_drop_cache` уже включён в Realtime publication (записи туда идут постоянно — это видно по уже существующим инвалидациям `dashboard-table-results` по `chip_snapshots`). Если publication для него ещё не настроена, добавим миграцией `ALTER PUBLICATION supabase_realtime ADD TABLE public.table_day_drop_cache;` и `REPLICA IDENTITY FULL`.
- Поле для агрегации — `drop_r_share` (внешний кэш), сумма по всем игрокам на столе за день = Drop R стола.
- Запрос лёгкий: индекс по `(casino_id, business_date)` уже подразумевается схемой; при необходимости добавим миграцией.

## Файлы

- `src/hooks/use-drop-split.ts` — новый `useTablesDropCacheToday`.
- `src/hooks/use-realtime.ts` — подписка на `table_day_drop_cache`.
- `src/pages/Dashboard.tsx` — использовать cache-first для Drop по столам.
- `src/pages/Tables.tsx` — то же.
- (опц.) миграция: publication + индекс на `table_day_drop_cache`.

## Эффект
Drop по столу на Pit-дашборде обновляется в момент сохранения Buy-In (≤200 мс через realtime), без ожидания тяжёлого RPC. RPC остаётся фоновой страховкой и единственным источником для прошлых дней.
