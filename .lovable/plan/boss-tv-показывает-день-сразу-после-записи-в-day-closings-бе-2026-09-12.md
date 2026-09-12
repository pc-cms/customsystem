# Boss TV показывает день сразу после записи в Day Closings (без «замочка»)

## Что проверено сейчас (данные, все города)

- В `fin_day_closing` за всю историю по Arusha, Dodoma, Mbeya, Mwanza нет ни одной строки без официального закрытия дня, и нет ни одной строки с пометкой Provisional. То есть прямо сейчас цифры Boss TV и Monthly Report совпадают по всем четырём филиалам.
- Расхождение пока потенциальное: и Dashboard (месяц), и Monthly Report сегодня считают месяц ТОЛЬКО по дням, у которых есть запись официального закрытия (замок). Если завтра цифры дня попадут в Day Closings раньше замка (в том числе автоматической подстановкой после 07:00), день не попадёт в месяц ни на Boss TV, ни в отчёте.

## Что меняем

Правило: **день учитывается, как только в Day Closings появилась строка за этот день** — независимо от того, закрыт ли день официально.

1. Boss TV / Dashboard (месяц): убираем фильтр по официальным закрытиям — месяц считается по всем строкам Day Closings за месяц.
2. Monthly Report по каждому филиалу: тот же источник, чтобы цифры оставались идентичными Boss TV.
3. «Сегодня» на Boss TV уже работает так: как только строка дня есть, Slots Drop/Result показываются. Не меняем.
4. Формулы не меняем: Live ACE = CashDesk Win − Active Credits; день/месяц = CashDesk Win − Card Balance; Tables = tables_result.
5. Ничего нового в интерфейс не добавляем.

## Технические детали

- `src/hooks/use-boss-dashboard.ts`: убрать запрос `business_day_closures` и фильтрацию `officiallyClosed` в MTD-агрегации (Slots Drop/Result, Tables Result, Tables Drop, `mtdSlotsAvailable`). Месяц = все строки `fin_day_closing` в диапазоне + fallback по закрытым слот-сменам.
- `public.boss_monthly_report`: миграция, заменяющая CTE `closed` (join на `business_day_closures`) на набор дат из `fin_day_closing` за период; `closed_days`/`closed_days_count` считаются по дням, у которых есть строка Day Closing. Остальная логика (коллекции, FX, бюджет, extras) не трогается.
- Проверка: сверить по каждому филиалу за сентябрь суммы Tables/Slots из Dashboard-хука и `boss_monthly_report` — должны совпадать; плюс typecheck и сборка.
