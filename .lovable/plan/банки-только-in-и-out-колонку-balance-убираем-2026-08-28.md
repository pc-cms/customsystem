# Банки: только IN и OUT, колонку Balance убираем

Правило: по банковским каналам (CRDB TZS/USD, NBC TZS/USD) кассир вводит только IN и OUT. Итог по банку = NET (IN − OUT). Никакого поля «Balance» ни в чеках, ни в закрытии смены.

## Что меняем

### 1. Ввод (Live Game и Slots)
- В блоке Banks убираем третью колонку «Balance» — остаются только IN и OUT.
- Итоги под блоком: одна строка «Net today (IN − OUT)» плюс «USD in TZS»; строку «Balance total» убираем.
- Общая банковская сумма (та, что идёт в Total Closing Cash и в сверку) считается из NET, а не из введённого остатка.

### 2. Сверка Check
- Live Game: Expected и Counted по банкам считаются от NET — то есть логика остаётся согласованной и при пустом остатке расхождения не появляется.
- Slots: та же база (NET) для строки Banks под плитками; подпись меняем на «Banks · net today».

### 3. Печатные отчёты
- Live (`ShiftClosingReport`) и Slots (`SlotsConsolidatedReport`): строки Bank CRDB TZS / CRDB USD / NBC TZS / NBC USD печатают NET за смену вместо закрывающего остатка.
- Старые смены, где каналов нет, печатаются как раньше по legacy-полям — перепечатка прошлых отчётов не ломается.

### 4. Closing Wallet Inbox (Post All)
- В кошельки уже проводится NET — это не меняется.
- Контрольное поле final_balance для новых банковских строк больше не заполняется (остаётся пустым), в диалоге колонка «Final» для банковских строк не показывается.

## Технические детали
- `src/components/cage/CageHelpers.ts`: `BankChannelEntry.final` становится опциональным (для чтения старых записей), `withDerivedBankTotals` считает `tzs`/`usd` из NET.
- `src/components/cage/CashCountGrid.tsx`: сетка Banks 3 колонки вместо 4, убрана строка Balance total.
- `src/components/cage/ActiveShiftView.tsx`, `src/components/cage-slots/ActiveSlotsShiftView.tsx`: подписи и расчёт от NET.
- `src/components/cage/ShiftClosingReport.tsx`, `src/components/cage-slots/SlotsConsolidatedReport.tsx`, `PrintSlotsShiftDialog.tsx`: канальные строки из NET с fallback на legacy.
- Миграция на `closing_inbox_build`: секции Live и Slots перестают писать `final_balance` для банковских строк (формулы сумм в кошельки не трогаем).
- Bump версии в `package.json` (сейчас 1.3.693).
