## Правило (без исключений)

Никаких round-ов, distribute-ов, peak-share или пропорционального размазывания. Drop по столу = сумма buy-in транзакций с этим `table_id`, целыми числами, как их ввёл кассир. Buy-in без `table_id` не попадает ни на один стол.

NEP как понятие остаётся только там, где он логически определён (player lifetime / period). В table-level Drop его нет.

## Backend

Миграция, переписывающая функцию пересчёта `table_day_drop_cache`:

- `in_at_table` = SUM `transactions.amount` за business day по `(casino_id, table_id, type IN ('in','buy'), cancelled_at IS NULL)`.
- `drop_r_share` = то же самое (никакого peak * in / totalIn).
- `recycled_share` = 0.
- Значения целые (`bigint`), без округлений вниз/вверх — исходные `amount` уже целые.
- Backfill за все дни, где сейчас есть дробные `drop_r_share`, чтобы UI сразу очистился.

RPC `compute_tables_drop_split` переписать по той же логике: чистая сумма по столу, без walk-history и без peak. `compute_player_drop_split` / `compute_players_drop_split` не трогаем (player-level NEP остаётся).

## Frontend

- `useTablesDropCacheToday` и `useTablesDropSplit` не меняются по контракту — просто начнут возвращать целые суммы.
- `src/lib/nep-split.ts`: `splitTablesWindow` переписать в тупую сумму по `table_id` (без peak/recycled). `splitPlayerWindow` / `splitPlayersWindow` оставить как есть — это player-level NEP.
- Убрать колонки/лейблы "Recycled" в table-level UI, где они показывают `recycled_share`. Player-level UI не трогаем.

## Slots — Manual Input reminder

`ActiveSlotsShiftView` (закрытие смены):
- Если за смену были cashless IN/OUT транзакции и `cashless_final_providers` пуст или все нули → красное напоминание "Enter End-Day Cashless balance (M-Pesa, Airtel, Tigo, Halo)" и блокировка "Submit for Review".
- Manager review (`EditClosedCashlessDialog`) как есть — если менеджер сохранил нули, значит нули; печатать нули, не прочерки.

`PrintSlotsShiftDialog`:
- Условие показа блока: не "хотя бы одно значение > 0", а "объект заполнен ключами провайдеров". Заполненные нули печатаются как `0`, а не скрываются.

## Что НЕ трогаем

- Ввод buy-in / cash-out.
- Player-level NEP / peak / recycled.
- Логику Cage/Chip conservation.
- Cashless и балансы кроме указанного reminder.
