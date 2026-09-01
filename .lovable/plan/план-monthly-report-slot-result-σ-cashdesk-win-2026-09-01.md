# План: Monthly Report — Slot Result = Σ cashdesk_win

## Что меняем

Переключить строку **Slot Result** в Monthly Report с системного `slots_result` (`net_win`) на физический `cashdesk_win` из `fin_day_closing`.

## Зачем

По решению пользователя Monthly Report должен показывать именно CashDesk Win слотов, а не system result.

## Файлы и правки

1. `src/hooks/use-fin-monthly-report.ts`
   - Строка 266: в `.select(...)` добавить `cashdesk_win`.
   - Строка 387: `slotsIncome` считать как `Σ r.cashdesk_win` вместо `Σ r.slots_result`.
   - Строка 122: обновить комментарий интерфейса: `Slot Result = Σ cashdesk_win (closed days)`.

2. `src/pages/finances/FinancesMonthlyReportPage.tsx`
   - Строка 762: обновить tooltip строки Slot Result: `Σ closed-day cashdesk_win of the month.`

3. `package.json` + `package-lock.json`
   - Поднять версию с `1.3.722` до `1.3.723`.

## Что НЕ меняем

- Boss TV / Dashboard — оставляем текущую логику (ACE live / closed-day `cashdesk_win − card_balance`).
- Wallets Expected — оставляем `cashdesk_win` + Card Balance отдельно.
- `slots_result` в других отчётах (`SlotsHistoryReport`, `use-boss-monthly-report`, UI-lab) не трогаем.
- Расчёты, RPC, схему, права, данные — не изменяем.

## Верификация

- `bunx tsgo --noEmit` (typecheck).
- `npm run build`.
- Deploy не выполняется.
