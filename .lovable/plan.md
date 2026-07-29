## Что делаем

Новая страница **Reports → Daily Balance Sheet** (`/reports/daily-balance`), повторяющая каркас листа «Баланс 02.14»: одна строка = один business_date месяца, шапка с двумя уровнями групп колонок, строки итогов и строки «на начало / на конец месяца». Все названия — на английском, все суммы — в TZS (расходы конвертируются по валюте расхода и курсу дня).

## Маппинг колонок Excel → данные системы

| Excel (RU) | Колонка в отчёте (EN) | Источник |
|---|---|---|
| ДАТА / день недели | Date / Day | business_date |
| Курс | USD Rate | `fin_daily_rates` (USD), fallback — курс кассы (2600) |
| Результат по кассе / Результат кассы | Cash Desk Result | `shifts.cash_desk_result` + `cage_slots_shifts.cash_desk_result` |
| Результат столов | Tables Result | `fin_day_closing.tables_result` (fallback `table_daily_results`) |
| Slots | Slots Result | `fin_day_closing.slots_result` − `players_card_balance` (правило системы) |
| Бар | Bar / POS | `pos_orders` за день |
| Casino | Casino Result | Tables + Slots(net) + Bar |
| КАССА КАЗИНО | Cage Cash | баланс кошельков `cage_table` / `main_cash` на дату |
| инкасс-банк | Collection to Bank | `fin_wallet_tx` kind = `collection` |
| ЧИП ДИФЕРЕНС | Chip Difference | `chip_snapshots.miss` (сумма по денминалам) |
| ЧАЙ СТОЛЫ / СЛОТ | Tips Tables / Tips Slots | `transactions` (tips_live/tips_floor) и `cage_slots_tips_cd` |
| фин. Менеджер: касса / вн.трансфер / Ввод / Вывод | Office Safe: Balance / Internal Transfer / In / Out | `fin_wallets` (office_safe) + `fin_wallet_tx` |
| №2 | Cage #2 | второй кассовый кошелёк (если заведён) |
| Банк: терминал / Потеря% / счёт / расх-ы Банк | Terminal / Fee % / Bank Account / Bank Expenses | `bank_checks`, кошельки `bank_account`, расходы с bank-кошелька |
| кредит/депозит | Credit / Deposit | `players_card_balance` + cashless-баланс |
| Расходы | Expenses | `expenses.amount_tzs` за день (по валюте расхода) |
| Фишки | Chips Float | `chip_inventory` / `chip_baseline` итого |

Колонка **Stadt** в системе аналога не имеет — не выводим (при необходимости позже добавим как отдельный тип столов).

## Страница

- Хук `src/hooks/use-daily-balance-report.ts` — один параллельный набор запросов на месяц, сборка карты по датам, кэш через react-query.
- Страница `src/pages/reports/DailyBalanceReport.tsx` на `SmartTable` (правило проекта), моно-шрифт, `·` для пустых, форматирование числа с пробелами, отрицательные — `cms-amount-negative`.
- Универсальный `FilterBar`: казино (по доступу), месяц/период, переключатель групп колонок (Cash desk / Bank / Office / Chips / Tips), поиск по дате, сортировка по любой колонке.
- Строки: `Opening balance` (на начало месяца), дни, `Total` (сумма), `Closing balance` (на конец месяца).
- Экспорт в XLSX через существующий `downloadXlsx` + печать.

## Импорт легаси-файла

- Edge-функция `fin-balance-import`: принимает `.xls/.xlsx`, парсит **только лист «Баланс»** (заголовки на строках 8–9, данные с строки 10, распознавание по позициям колонок и по русским подписям), возвращает предпросмотр строк с уже приведёнными к TZS суммами.
- Новая таблица `fin_legacy_balance` (casino_id, business_date, набор числовых полей, `source='import'`, уникальность по casino+date) + GRANT + RLS (чтение/запись — finance_manager, general_manager, boss, super_admin).
- На странице кнопка **Import**: файл → предпросмотр с подсветкой конфликтов → сохранение. В таблице системные данные приоритетны, импортированные значения подставляются только там, где системных нет (для старых месяцев), с меткой источника.

## Доступ

Finance Manager, General Manager, Boss, Super Admin — через `RoleGuard` + модуль `reports`; ссылка в меню Reports.

## Технические детали

- Все чтения — через `fetchPaged` (месяц транзакций > 1000 строк).
- Курс: `fin_daily_rates` на дату, иначе последний известный, иначе 2600.
- Версия приложения поднимается до 1.3.465.
