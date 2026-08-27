# ShiftClosingReport — банки по каналам и чистка дублей

## 1. Банки отдельными строками (вместо «Other in TZS»)

Сейчас в блоке Cash Flow (Opener / Closer) банки сворачиваются в одну строку `Other in TZS`
(`openerOtherTzs` / `closerOtherTzs` = legacy `bank.tzs` + `bank.usd × курс`).

Станет: в этом же блоке после строк валют печатаются четыре строки по каналам —
`Bank CRDB TZS`, `Bank CRDB USD`, `Bank NBC TZS`, `Bank NBC USD`, с закрывающим остатком
(`channels[key].final`) в колонках Opener и Closer. Значения USD показываются в USD,
а в общий Total идут пересчитанными в TZS по курсу смены (как сейчас).

Правила:
- Если в снапшоте есть `bank.channels` — печатаются 4 канальные строки.
- Если снапшот старый (только `bank.tzs` / `bank.usd`, без каналов) — печатается прежняя
  строка `Other in TZS`, чтобы перепечатка старых смен не сломалась.
- Итоги `Total Cash (TZS)` и `Total` не меняются по сумме — только детализация строк.

## 2. Дубли в сводной панели

**Cashless.** Провайдерские строки `+ Cashless IN · M Pesa`, `+ Cashless IN · Airtel Money`,
`− Cashless OUT · …` повторяют таблицу «Cash Less Shift Transactions», которая уже печатается
выше с колонками Deposit / Withdraw / NET / End Day. В сводной панели остаётся одна итоговая
строка `NET Cashless`, построчная детализация убирается.

**Tips.** Сейчас всегда печатаются три строки: `Tips Day`, `Tips Night`, `− Tips (this shift)`.
Останется: строка `− Tips (this shift)` печатается всегда (она участвует в Shift Balance),
а `Tips Day` / `Tips Night` печатаются только если значение ненулевое. При одной смене
получится ровно одна строка Tips вместо трёх.

Освободившиеся ячейки правой/левой колонки таблицы 4×N заполняются оставшимися строками
(`Cash Desk Chips CREDIT`, `Miss Chips`) — сетка выравнивается автоматически по числу строк.

## Технические детали

- `src/components/cage/ShiftClosingReport.tsx`
  - Cash Flow: рендер строк банков по `BANK_CHANNELS` из `@/components/cage/CageHelpers`,
    чтение `openingFloat.bank.channels` / `closingCount.bank.channels`, fallback на legacy.
  - Сводная панель: `leftRows` = только `NET Cashless`; блок Tips — условный рендер
    нулевых `Tips Day` / `Tips Night`.
- Расчёты балансов, `bankTotalTzs`, Closing Inbox и БД не трогаются — правка только печатная.
- Bump версии в `package.json` (сейчас 1.3.683).
