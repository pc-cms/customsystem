# Statistics: переименование, вкладка Graphics, фикс Other Incomes

## 1. Reports → Statistics

- Пункт меню `/reports` переименовать в **Statistics** (иконка остаётся), заголовок страницы тоже **Statistics**.
- Маршрут `/reports` не меняем, чтобы не ломать закладки и права доступа.

## 2. Новая вкладка Graphics (последняя в списке)

Годовой график: 1 января – 31 декабря выбранного года, переключатель года стрелками (‹ 2026 ›), по умолчанию текущий год. Данные — по текущему казино.

Гранулярность: **по месяцам, 12 точек** (Jan…Dec), линии сглаженные (`type="monotone"`), точки с подсветкой при наведении, единый тултип со всеми 5 значениями, легенда с возможностью скрыть/показать линию кликом.

Пять линий:

| Линия | Источник данных |
|---|---|
| Drop Table | `player_day_drop_cache` (единый источник Drop, как в остальных отчётах) |
| Result Table | `fin_day_closing.tables_result` |
| Drop Slots | `cage_slots_shifts.manual_drop_slots` |
| Result Slots | `fin_day_closing.slots_result` |
| HeadCount | количество визитов в `casino_visits` за день |

Оформление: деньги на левой оси (компактный формат 1.2M), HeadCount — на правой оси (другой масштаб), сетка пунктиром, цвета из дизайн-токенов. Под графиком — компактная строка итогов за год по каждой линии.

## 3. Other Incomes в Office → Monthly Report показывает 0

Причина подтверждена: отчёт читает таблицу `fin_incomes`, в которой **0 записей**. Все реальные поступления пишутся в `fin_other_incomes` (за август 2026 там 51 запись: Mbeya 38 000 000, Arusha 10 796 824, Mwanza −16 638 269).

Исправление: в расчёте строки «Other Incomes» переключиться на `fin_other_incomes` — суммировать `amount * fx_rate` за выбранный период (месяц или YTD), исключая сторнирующие записи (`reverses_id` не пуст), с фильтром по казино (или по всей сети в network-режиме). Отрицательные записи (возвраты) уменьшают сумму — это корректно.

## Технические детали

- `src/components/layout/AppSidebar.tsx` — label пункта меню.
- `src/pages/Reports.tsx` — заголовок, новая вкладка `graphics`.
- Новый `src/components/reports/YearlyGraphicsReport.tsx` — запросы за год + Recharts `ComposedChart`/`LineChart` с двумя осями.
- `src/hooks/use-fin-monthly-report.ts` — замена источника `other` c `fin_incomes` на `fin_other_incomes` (фильтр по `business_date`, а не по `year/month`).
