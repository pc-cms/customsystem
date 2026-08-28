# Банки в кассе Live и Slots: единая связка Check → Печать → Post All

Проверено в коде и в базе — сейчас есть три разрыва.

## Что не так сегодня

1. **Check (Live Game).** Пересчитанная сумма (Counted) включает банки, а Expected — нет: он строится из `opening_float.totals.total_tzs` плюс движения (fill/credit/collection/expenses…), но дневное движение по банкам (IN − OUT по каналам CRDB/NBC) в Expected не попадает. Итог: как только кассир вносит банк, чек показывает ложное расхождение, и визуально «банки в сумму не идут».
2. **Печатный отчёт Slots.** `SlotsConsolidatedReport` печатает только обобщённые строки `Bank TZS` / `Bank USD` / `Total Bank`, а `PrintSlotsShiftDialog` читает лишь `bank.tzs` / `bank.usd` из чеков. Каналы CRDB TZS/USD и NBC TZS/USD (они есть в данных) в нужные ячейки не попадают. В Live-отчёте построчная детализация каналов уже сделана.
3. **Post All (Closing Inbox).** В функции `closing_inbox_build` секция Slots формирует только строки Cash (по номиналам) и Mobile. Строк `bank` для Slots нет вообще — поэтому банки Slots не приходят в кошельки. Для Live строки по каналам строятся корректно.

## Что сделаем

### 1. Check — банки участвуют в сверке
- Live Game: в Expected добавляется банковская часть — стартовый остаток по каналам из `opening_float.bank.channels` плюс NET (IN − OUT) за смену; Counted остаётся как есть (закрывающие остатки каналов). Тогда при корректном вводе разница = 0.
- Slots: сумма чека уже включает банки (подтверждено данными); дополнительно на плитках чека выводим строку «Banks (net / final)», чтобы кассир видел, что банк учтён.
- В блоке банков в `CashCountGrid` показываем подытог NET и подытог Final отдельно — сейчас смешение этих двух чисел и вводит в заблуждение.

### 2. Печатный отчёт Slots — каналы в свои ячейки
- В `SlotsConsolidatedReport` вместо двух строк `Bank TZS` / `Bank USD` печатаем четыре канальные строки: `Bank CRDB TZS`, `Bank CRDB USD`, `Bank NBC TZS`, `Bank NBC USD` (колонки Opener / Closer), плюс `Total Bank (TZS)`.
- `PrintSlotsShiftDialog` читает `bank.channels` из открывающего/закрывающего чека и из `closing_denominations` смены; при отсутствии каналов (старые смены) остаётся прежняя пара TZS/USD — перепечатка старых отчётов не ломается.

### 3. Post All — банки Slots доходят до кошельков
- Миграция: в `closing_inbox_build` добавить для секции `slots` тот же блок по банковским каналам, что уже есть для Live: источник — `cage_slots_shifts.closing_denominations->'bank'->'channels'`, в кошелёк проводится NET (IN − OUT), `final_balance` — контрольная величина, мэппинг через `closing_inbox_map_wallet(...,'bank',currency,label)`.
- Legacy-банки Slots без каналов создаются как справочные строки (`orig_amount = 0`, `wallet_id = NULL`) — по той же логике, что уже принята для Live.
- Для уже созданных, но не проведённых инбоксов даём пересборку (удалить и построить заново для незапощенной даты), чтобы вчерашние банки Slots появились без ручного ввода.

## Технические детали

- `src/hooks/use-expected-check-state.ts` / `src/components/cage/ActiveShiftView.tsx` — добавить банковскую составляющую в `expectedTotal`.
- `src/components/cage/CashCountGrid.tsx` — подытоги NET и Final по банкам.
- `src/components/cage-slots/PrintSlotsShiftDialog.tsx`, `src/components/cage-slots/SlotsConsolidatedReport.tsx` — канальные строки с fallback.
- Новая миграция на `closing_inbox_build` (только секция Slots + legacy-строки), формулы баланса смены и P&L не трогаем.
- Bump версии в `package.json` (сейчас 1.3.692).
