# Net Win убрать, In/Out в Day Closings

## 1. Net Win остаётся только в одном месте

Единственное место, где Net Win виден и редактируется — **Statistics → Slots** (отчёт истории слотов). Значение по-прежнему хранится в закрытии дня, но вводится и правится только там.

Убираем показ и участие в расчётах:
- **Day Closings (Office)** — колонка Net Win удаляется; остаются Table Result, CashDesk Win, новые In / Out, Slot Drop, Card Balance, JP.
- **Close Day (закрытие дня менеджером)** — поле Net Win убирается из окна; закрытие требует Drop, CashDesk Win, Client Balance.
- **Dashboard / Boss TV** — плитка «Net Win» убирается из блока Slots; остаются Drop, Active Credits, Cashdesk Win, результат.
- **Статистика (месячный отчёт Reports)** — сейчас месячный «Slots Result» берётся напрямую из Net Win. Заменяется на канон закрытого дня: **CashDesk Win − Card Balance − Cashless Diff**. Это единственное изменение формулы; после него месячные цифры слотов совпадут с Boss-дашбордом.
- Boss-дашборд Net Win уже не использует в расчётах — просто перестаём его запрашивать.

Что не трогаем: ACE-аналитику (там Net Win — метрика источника), сам сбор данных коллектором, кошельки.

## 2. Day Closings: колонки In / Out

После CashDesk Win добавляются две колонки ручного ввода: **In** и **Out** (по умолчанию 0, сохраняются вместе с закрытием дня).

Правило пересчёта: **CashDesk Win = введённая сумма + Out − In**.

Пересчитанное значение — это и есть итоговый CashDesk Win, который идёт дальше в Wallets / Expected, Statistics → Slots и месячные отчёты. Итоги по столбцам в подвале таблицы учитывают пересчёт.

## Техническая часть

- Миграция: добавить в `fin_day_closing` колонки `cashdesk_in numeric not null default 0`, `cashdesk_out numeric not null default 0`, `cashdesk_win_base numeric` (введённая база). Существующие строки: база = текущий `cashdesk_win`, In/Out = 0, итог не меняется.
- `cashdesk_win` остаётся полем-итогом (`base + out − in`), поэтому все существующие потребители (кошельки, отчёты, RPC `boss_monthly_report`) продолжают работать без изменений.
- `src/pages/office/DayClosingsTab.tsx` — убрать колонку Net Win, добавить In/Out, писать base/in/out и итоговый `cashdesk_win`.
- `src/components/pit/CloseBusinessDayButton.tsx` и `src/hooks/use-business-day-closure.ts` — убрать поле Net Win из формы и из вызова закрытия (RPC-параметр `_net_win` передаём как существующее значение/0, сигнатуру RPC не меняем).
- `src/pages/Dashboard.tsx` — убрать плитку Net Win.
- `src/pages/Reports.tsx` — заменить источник `slotsResult` с `net_win` на `cashdesk_win − players_card_balance − cashless diff` (cashless берётся так же, как в `use-boss-dashboard.ts`); убрать backfill Net Win.
- `src/hooks/use-boss-dashboard.ts` — убрать `net_win` из выборки.
- `src/components/reports/SlotsHistoryReport.tsx` — без изменений (Net Win остаётся редактируемым здесь).
- Проверки: типы, тесты, сборка. Без публикации.
