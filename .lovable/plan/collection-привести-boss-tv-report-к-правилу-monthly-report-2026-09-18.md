# Collection: привести Boss TV Report к правилу Monthly Report

## В чём сейчас разница

Два отчёта считают Collection по-разному.

| | Monthly Report | Boss TV Report |
|---|---|---|
| Расходы группы «collections» | да, но CAPEX вынесен в отдельный блок | да, вместе с CAPEX |
| Записи Office → Collections (сбор денег владельцем) | да, входят в Collection | нет, не учитываются |

Сентябрь 2026 (проверено по базе):

| Казино | Boss TV сейчас | Monthly Report (Collection / CAPEX) |
|---|---|---|
| Arusha | 2 600 000 | 0 / 2 600 000 |
| Dodoma | 11 001 875 | 5 667 300 / 11 001 875 |
| Mbeya | 11 310 000 | 0 / 11 310 000 |
| Mwanza | 41 357 500 | 32 257 500 + 26 661 000 / 9 100 000 |

## Что делаем

Boss TV Report переходит на правило Monthly Report:

1. Collection = расходы группы «collections», **кроме** категории CAPEX, **плюс** записи Office → Collections.
2. CAPEX показывается отдельной строкой под Collection.
3. Balance и Expected Profit по-прежнему вычитают обе суммы, поэтому итоговая прибыль не меняется — меняется только разбивка.
4. Дневная колонка Collection также считается по новому правилу; CAPEX в дневную строку не подмешивается (идёт отдельной строкой сводки).

## Технические детали

Миграция RPC `boss_monthly_report`:
- CTE `coll_exp` разделяется на `collection` (категория `name <> 'CAPEX'`) и `capex`.
- Добавляется CTE по `fin_other_incomes` с `source = 'collection'`, `reversed_by_id is null`, конвертация в TZS по `fx_rate` (fallback — существующая логика `fx`), знак инвертируется (минусовая запись = собранные деньги).
- В `per_casino` добавляется поле `capex`; `collection` теперь без CAPEX и с записями Office.
- `daily_collection` считается по тому же правилу (без CAPEX, с записями Office).

Фронтенд:
- `src/hooks/use-boss-monthly-report.ts` — читает `capex` в `per_casino`, добавляет в тип и в тоталы; `balance`/`expectedProfit` = `... − tCollection − tCapex`.
- `src/components/boss/monthly-report-panel.tsx` — строка «CAPEX» сразу под «Collection».

Не трогаем: формулы Table/Slot Result, cashless, collector, cron, Monthly Report.

## Проверка

- Типы, тесты, сборка.
- Сверка сентября: Boss TV Collection + CAPEX по каждому казино = текущая сумма Monthly Report; Balance не изменился.
