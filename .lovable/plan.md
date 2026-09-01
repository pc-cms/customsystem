# Явный тип движения в кошельке (Expected / Actual)

## Зачем

Сейчас в таблице движений кошелька непонятно, что именно делает строка: одни записи меняют
расчётный баланс (Expected), другие — только физический (Actual). Из-за этого расход виден
в списке, но Actual не меняется, и это выглядит как ошибка, хотя это правильная механика.

## Правило (текущее, не меняем)

```text
Expected = стартовый float + income − expense − collection ± transfers
Actual   = физический пересчёт (cash count) либо ручная правка ADJ
Variance = Actual − Expected
```

- `income` / `expense` / `collection` / `transfer_in` / `transfer_out` → двигают **Expected**
- `adjustment` (кнопки Add money / Take money) → двигает **Actual**, не доход и не расход
- расходы касс (slots / live_game) не привязаны к офисным кошелькам и не двигают ни один
  кошелёк — они уходят в результат смены

## Что делаем

Только визуально, на странице Finance → Wallets, в таблице движений:

1. Новая колонка **Effect** между `Dir` и `Amount`:
   - `EXPECTED` — для income / expense / collection / transfer_in / transfer_out
   - `ACTUAL` — для adjustment (существующий бейдж `Adj` остаётся)
   - разные варианты бейджа по семантическим токенам, без хардкода цветов
2. Tooltip на бейдже поясняет: «Moves the calculated (Expected) balance» /
   «Manual correction of the physical (Actual) balance — not income or expense».
3. Короткая легенда над таблицей одной строкой:
   `Expected = calculated · Actual = counted / ADJ · Variance = Actual − Expected`
4. Фильтр по Effect (All / Expected / Actual) рядом с существующими фильтрами.

## Технические детали

- Файл: `src/pages/finances/FinancesWalletsPage.tsx` (таблица движений, ~строки 1313–1394).
- Классификация берётся из существующего единого источника правды
  `src/lib/wallet-tx-sign.ts` — добавляется чистый хелпер `walletTxEffect(kind)`,
  возвращающий `"expected" | "actual"`; никакая арифметика балансов не меняется.
- Юнит-тест на новый хелпер в `src/test/wallet-tx-sign.test.ts`.
- Никаких изменений в БД, RPC, расчётах Expected/Actual/Variance и отчётах.
