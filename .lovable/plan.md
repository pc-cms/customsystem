# Casino Monthly Balance — источники данных, Terminal, Bank TZS/USD, старт с 10.08

## 1. Откуда берётся каждая колонка (новая жёсткая привязка)

| Колонка | Источник |
|---|---|
| Live Game | Close Day → `tables_result` (только оттуда, не из смен) |
| Slots | Close Day → `cashdesk_win − players_card_balance` |
| Bar | POS-заказы дня (без void) |
| Tips | **Ручной ввод** в ячейке (пока не автоматизируем) |
| Casino Result | Live Game + Slots + Bar |
| Chip Diff | Miss Chips закрытых смен дня |
| Slots Diff | Close Day → `players_card_balance` |
| Cage Casino | Деньги в кассе на закрытие: Live cage (наличные + cashless + mobile) + Cage Slots (закрывающая инвентаризация). Фишки не входят |
| Internal Transfer | **Ручной ввод** (позже — отдельный интерфейс переводов в Wallets) |
| Cage Manager | Офисные кошельки (Wallets): офисный сейф + mobile money + резервы |
| Bank Transfer | **Ручной ввод** (позже — отдельный интерфейс переводов в Wallets) |
| **Terminal (новая, перед Bank)** | Дневной поток: поле BANK из закрытия касс (Live `closing_count.bank` TZS/USD + аналог по слотам). Это оборот дня, не остаток |
| **Bank TZS (новая связка)** | Кошельки CRDB TZS + NBC TZS |
| **Bank USD (в валюте) + пересчёт** | Кошельки CRDB USD + NBC USD; показываем сумму в USD и её эквивалент в TZS по курсу дня |
| Bank (итог) | Bank TZS + Bank USD (TZS) |
| Expenses | Утверждённые расходы дня (касса + офис) |
| Office +/− | Внешние приходы и коллекции (Wallets) |
| Money | Cage Casino + Cage Manager + Bank (TZS+USD) + Terminal за день |
| Fin Result | Result + Diff − Expenses |
| Balance (сверка) | Вчера Money + Result + Diff + Fees + Office − Expenses − Money сегодня → 0 |

Ручные поля (Tips, Internal Transfer, Bank Transfer) редактируются прямо в ячейке отчёта и хранятся по дню и казино; они не пересчитываются системой.


Ручные значения (fin_legacy_balance) и Excel-импорт для банков больше не подменяют кошельки — банк всегда из кошельков.

## 2. Terminal
- Новая колонка в группе Bank, слева от Bank.
- Значение = сумма поля BANK из закрытий касс за бизнес-день (Live + Slots), TZS + USD×курс.
- Клик по ячейке — панель детализации: по сменам и по валютам.
- В строке Total — сумма за месяц (поток).

## 3. Чистка периода 01–09.08.2026 (все 4 казино)
Оставляем: результаты (Close Day: tables/slots/net win/cashdesk/client balance) и расходы.

Удаляем за 01.08–09.08 по Arusha, Dodoma, Mbeya, Mwanza:
- снимки денег дня `fin_day_balance_snapshot`;
- движения по кошелькам `fin_wallet_tx` (переводы, коллекции, внешние приходы, ручные) за эти даты;
- строки `fin_legacy_balance` (ручные банки/касса) за эти даты;
- значения Cage/банк в отчёте за эти дни не показываются — колонки денег для 01–09 остаются пустыми (`·`).

## 4. START = утро 10.08
- Для каждого казино заполняется строка «Start» (`fin_month_start`, месяц = август 2026): Cage Casino, Cage Manager, Bank TZS, Bank USD.
- Эти цифры — фактические остатки на утро 10.08 (кошельки и касса), вводятся вручную через диалог Start в отчёте.
- Расчёт Balance стартует именно от Start: первый «денежный» день — 10.08, до него сверка не считается.
- Кошельки приводятся к тем же значениям: starting float на 10.08, движения до 10.08 отсутствуют.

## Технические детали
- `src/hooks/use-daily-balance-report.ts`: Slots из `cashdesk_win − players_card_balance`; банк только из кошельков CRDB/NBC с разделением TZS/USD (+`bank_usd_raw` в USD); новые поля `terminal_tzs`, `terminal_usd`, `terminal_total`, `terminal_detail`; Money = Cage + Manager + Bank + Terminal; ручные поля Tips / Internal Transfer / Bank Transfer подтягиваются из таблицы ручных значений по дню; отсечка денежных колонок до даты старта (`money_from`).
- Ручные значения: хранение по (казино, дата) — используем существующую `fin_legacy_balance` (поля `tips_tables`, `office_transfer`, `collection_bank`) без новой таблицы; инлайн-редактор в ячейке, как у Bank TZS сейчас.
- `src/pages/reports/DailyBalanceReport.tsx`: колонка Terminal перед Bank, Bank USD показывает USD + TZS, drill-down для Terminal, инлайн-ввод трёх ручных колонок, пустые ячейки для дней до старта.
- `src/lib/monthly-balance-formulas.ts`: тексты формул для Terminal, Bank TZS/USD, Slots, Money и ручных колонок.
- Диалог Start: запись в `fin_month_start` по каждому казино.
- Данные: удаление `fin_day_balance_snapshot`, `fin_wallet_tx`, `fin_legacy_balance` за 01–09.08 по 4 казино; заполнение `fin_month_start` вашими цифрами на 10.08.


## Что нужно от вас
Цифры на утро 10.08 по каждому казино: Cage Casino, Cage Manager (офис), Bank CRDB TZS, NBC TZS, CRDB USD, NBC USD. Без них Start останется нулевым.
