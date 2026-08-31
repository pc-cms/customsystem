# Card Balance: одно имя + подтягивание из Day Closings

## Что происходит сейчас

Проверено по данным: в `fin_day_closing.players_card_balance` цифры заполнены по всем казино (например 30/08: Dodoma −16 170, Mwanza 411, Mbeya 290). А Statistics → Slots берёт колонку не оттуда, а из поля кассовой смены слотов (`cage_slots_shifts.manual_slots_deposits`), которое почти везде равно 0 — совпадает только в Аруше, где его пишет ACE Collector. Поэтому после заполнения Day Closings колонка остаётся пустой.

Плюс путаница в названиях: в Day Closings колонка называется **Card Balance**, в Statistics → Slots и в окне Close Day — **Client Balance**.

## Что сделаю

1. **Одно имя — «Card Balance»** (канон проекта): переименую колонку в Statistics → Slots и поле в окне Close Business Day; подсказки/хинты приведу к тому же названию.

2. **Источник — Day Closings.** Колонка Card Balance в Statistics → Slots будет читать `fin_day_closing.players_card_balance` за тот же бизнес-день — ровно так же, как уже сделано для Net Win и CashDesk Win в этой же таблице. Отрицательные значения поддерживаются.

3. **Правка по той же логике, что и соседние колонки:** если строка закрытия дня есть и значение не нулевое — ячейка только для чтения (подсказка «From Close Day»); если дня закрытия нет или значение 0 — менеджер/финансы могут ввести значение прямо здесь, и оно запишется в `fin_day_closing` (backfill), а не в смену.

4. Итоговая строка TOTAL и сортировка по колонке считаются от нового источника.

## Технически

- `src/components/reports/SlotsHistoryReport.tsx`: в запрос `slots-report-day-closings` добавить `players_card_balance`; `clientBalance` → `cardBalance` из `closingByDate`; `updateClosingField` расширить полем `players_card_balance`; заголовок и заголовок-хедер переименовать.
- `src/components/pit/CloseBusinessDayButton.tsx`: подпись поля `Client Balance` → `Card Balance`, хинт `→ Slots — Card Balance · Day Closing`.
- Изменения только во фронтенде; схема БД и формулы кошельков/отчётов не трогаются.
- Патч-версия в `package.json` +1.
