# ShiftClosingReport (Live) — банки, дубли, Tips + кнопка Tips в кассе

## 1. Банки отдельными строками (вместо «Other in TZS»)

В блоке Cash Flow (Opener / Closer) банки сейчас сворачиваются в одну строку `Other in TZS`
(`bank.tzs` + `bank.usd × курс`).

Станет: после строк валют печатаются четыре строки по каналам — `Bank CRDB TZS`,
`Bank CRDB USD`, `Bank NBC TZS`, `Bank NBC USD` с закрывающим остатком (`channels[key].final`)
в колонках Opener и Closer; USD показывается в USD, а в Total идёт пересчитанным в TZS
по курсу смены.

- Есть `bank.channels` → печатаются 4 канальные строки.
- Старый снапшот без каналов → остаётся прежняя строка `Other in TZS` (перепечатка не ломается).
- Суммы `Total Cash (TZS)` и `Total` не меняются — меняется только детализация.

## 2. Дубли в сводной панели

**Cashless.** Строки `+ Cashless IN · M Pesa`, `+ Cashless IN · Airtel Money`,
`− Cashless OUT · …` дублируют таблицу «Cash Less Shift Transactions» выше (там уже есть
Deposit / Withdraw / NET / End Day). В сводной панели остаётся одна строка `NET Cashless`.

**Tips.** Вместо трёх строк (`Tips Day`, `Tips Night`, `− Tips (this shift)`) в Live-отчёте
печатается одна строка `Tips` — сумма чаевых смены, со знаком минус (она вычитается из
Shift Balance и далее переносится в колонку TIPS). Разбивка Day/Night в Live убирается;
в Slots (Tips CD Day / Night) всё остаётся как есть.

## 3. Кнопка Tips в кассе Live Game

В `ActiveShiftView` блок кнопок Tips Live / Tips Poker / Tips Floor / Promo IN / Issue Ticket
сейчас отключён (`{false && …}`). Возвращается одна кнопка `Tips` (иконка Gift), открывающая
существующий `TipsDialog` с kind `tips_live`. Остальные кнопки (Tips Poker, Tips Floor,
Promo IN, Issue Ticket) остаются скрытыми.

## Технические детали

- `src/components/cage/ShiftClosingReport.tsx`
  - Cash Flow: рендер строк по `BANK_CHANNELS` из `@/components/cage/CageHelpers`,
    чтение `openingFloat.bank.channels` / `closingCount.bank.channels`, fallback на legacy.
  - Сводная панель: `leftRows` = только `NET Cashless`; блок Tips → одна строка `Tips`
    со значением `tipsTotal ?? (day + night)`.
- `src/components/cage/ActiveShiftView.tsx`: кнопка `Tips` выводится вне блока `{false && …}`.
- Логика балансов, `TipsDialog`, Closing Inbox и БД не меняются — правки только UI/печать.
- Bump версии в `package.json` (сейчас 1.3.683).
