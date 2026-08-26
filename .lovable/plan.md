# Day Closings: две цифры слотов без путаницы

## Правило (канон, не меняется)

```text
NET WIN      = системный результат слотов (ACE / ручной ввод)
               -> Statistics, P&L, Monthly Report
CASH DESK WIN= физический кэш кассы слотов
               -> Wallets / Expected (кошельки)
CARD BALANCE = деньги клиентов на картах, отдельная цифра
```

Данные в базе уже так и хранятся: `net_win` (= `slots_result`) и `cashdesk_win` — разные поля. Проблема только в названии колонки: в Day Closings колонка называется «Slot Result», хотя вводится и сохраняется именно Net Win. Отсюда путаница.

## Что меняется (только подписи и подсказки, цифры не трогаем)

1. **Day Closings** — колонка «Slot Result» переименовывается в **«Net Win»**.
   - Подсказка: «Net Win — системный результат слотов. Идёт в Statistics и P&L. Не участвует в кошельках.»
2. **CashDesk Win** — название остаётся.
   - Подсказка: «CashDesk Win — физический кэш кассы слотов. Единственная цифра слотов, которая идёт в Wallets / Expected.»
3. **Card Balance** — подсказка уточняется: «Отдельно, один раз добавляется в Wallet Expected, из Net Win не вычитается.»
4. Строка тоталов и печать используют те же новые подписи.
5. Statistics → Slots уже показывает Net Win и Cashdesk отдельно — сверяю подписи, чтобы совпадали с Day Closings.
6. Документация `docs/FINANCE-FORMULAS.md`: раздел Day Closings приводится к тем же двум названиям.

Третья расчётная колонка не добавляется — только Net Win и CashDesk Win.

## Технические детали

- `src/pages/office/DayClosingsTab.tsx`: `header: "Slot Result"` → `"Net Win"`, обновление `title`-подсказок. Логика записи (`slots_result`, `net_win`, `cashdesk_win`) не меняется.
- `src/components/reports/SlotsHistoryReport.tsx`: сверка подписей колонок Net Win / Cashdesk.
- `docs/FINANCE-FORMULAS.md`: §1 и §6 — единая терминология.
- Версия приложения повышается в `package.json`.

Схема базы и формулы кошельков не меняются: Wallet Expected по-прежнему берёт `cashdesk_win`, отчёты — `net_win`.
