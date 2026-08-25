# Card (Credit) Balance — знак учтён по-разному в Day Closings и в Wallets/Daily Balance

## Что подтверждено данными и кодом

В `fin_day_closing` карточный баланс игроков хранится в `players_card_balance` и записывается со знаком «плюс», как его вводят в Day Closings.

Дальше он используется в трёх местах — и не одинаково:

| Место | Как считает | Файл/функция |
|---|---|---|
| Day Closings (экран, тотал Slots) | `Slots − Cards` — **вычитает** | `src/pages/office/DayClosingsTab.tsx` (подсказка в колонке: "Subtracted from the Slot Result") |
| Boss Dashboard / Monthly Report | `cashdesk_win − n` — **вычитает** | `use-boss-dashboard.ts`, `use-boss-monthly-report.ts` |
| Wallets Expected / Daily Balance | `+ card_balance` поверх `slots_result` — **прибавляет** | RPC `fin_balance_snapshot` (`incomes.card_balance`, поле `net`), `computeBalanceTotals` в `src/hooks/use-fin-balance.ts` |

При этом `slots_result` в `fin_day_closing` — это сырой cash desk win без вычета карт (Arusha: `slots_result` = `cashdesk_win` = 80 537 944 за август). Значит в Expected карточные деньги учтены со знаком «+» поверх результата, где они ещё не вычтены, — то есть **на 2× по модулю мимо** логики Day Closings.

Суммы за август (MTD, `players_card_balance`): Arusha +134 162, Dodoma +101 460, Mbeya +20 400, Mwanza −42 736.

Отдельно: у Mwanza `slots_result` (240 485 049) не равен `cashdesk_win` (190 532 799), у Dodoma и Mbeya тоже небольшие расхождения. Значит семантика `slots_result` по казино не одинакова — это надо проверить до правки формулы, иначе одна из площадок поедет.

## Что делаем

1. **Проверка семантики.** Пройти по каждому казино и сверить, что записано в `slots_result` (сырой cash desk win или уже за вычетом карт), сопоставив с `cashdesk_win` и `players_card_balance` по дням. Зафиксировать единое правило: `slots_result` = cash desk win, карты хранятся отдельно.
2. **Единый знак.** Привести `fin_balance_snapshot` к правилу Day Closings: карточный баланс **вычитается** из результата слотов (`slots − card_balance`), а не прибавляется. Поправить и `incomes.card_balance`, и строку `net` в дневном массиве.
3. **Клиентская формула.** В `computeBalanceTotals` (`src/hooks/use-fin-balance.ts`) заменить `+ incomes.card_balance` на `− incomes.card_balance`, чтобы Expected и Variance в Wallets считались по тому же правилу.
4. **Подписи в UI.** В Wallets/Daily Balance колонку карт показывать со знаком «−», как в Day Closings, чтобы визуально не читалось как доход.
5. **Проверка после правки.** Пересчитать Variance по Arusha за 01–25/08 и убедиться, что сдвиг равен ровно 2 × 134 162 = 268 324; сверить Mwanza, Dodoma, Mbeya.
6. **Документация.** Обновить `docs/FINANCE-FORMULAS.md`: Card Balance вычитается везде, единый источник — `fin_day_closing.players_card_balance`.

## Технические детали

- Миграция: `CREATE OR REPLACE FUNCTION fin_balance_snapshot(...)` — меняются только знак `v_card_balance` в блоке `incomes` и слагаемое `card_balance` в поле `net` дневного массива. Структура и остальные слагаемые не трогаются.
- Клиент: одна строка в `computeBalanceTotals` + подпись колонки.
- Исторические данные не переписываются — расчёт производный, пересчитается сам.
