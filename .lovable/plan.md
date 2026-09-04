# Office: явные бакеты категорий и вкладка CAPEX

## Что сейчас (проверено)

- В `fin_categories` группа `collections` содержит 4 категории: `Collection`, `CAPEX`, `Money Change`, `Inter-Casino Transfer Out` (неактивна).
- Классификация делается текстовым сравнением в двух местах:
  - в БД-функции `fin_balance_snapshot` — через `ILIKE '%collection%'`, `ILIKE '%transfer%'`, `ILIKE '%money change%'`;
  - на фронте в `CollectionsTab.tsx` — через `isCapex(name) === 'CAPEX'`.
- Из-за этого CAPEX вычитается внутри `collections_total` в Expected, но не виден ни в Collections, ни в Expenses.
- Вкладки Office сейчас: Day Closings, Bank, Cashless, JP, Transactions, Wallets, Report, Collections, Other Incomes, Rates, Inter-Casino, Import Statement.

## Что сделаем

### 1. Одно явное поле классификации в БД

Добавить в `fin_categories` колонку `bucket text` со значениями `expense | collection | capex | transfer` (по умолчанию `expense`).

Проставить: `Collection → collection`, `CAPEX → capex`, `Money Change → transfer`, `Inter-Casino Transfer Out → transfer`, всё остальное → `expense`.

`fin_balance_snapshot` переписать на чтение `bucket` вместо `ILIKE`, и вернуть отдельно:
- `expenses_total` (bucket = expense)
- `collections_total` (bucket = collection, минус Other Income с source `collection`)
- `capex_total` (bucket = capex) — отдельной строкой
- `transfers_total` (bucket = transfer + принятые межфилиальные переводы)

Итоговое Expected по сумме не меняется — только разложение по строкам становится явным.

### 2. Вкладки (новых не создаём)

- **Collections** — показывает `bucket = collection` И `bucket = capex` в одном списке. У каждой строки бейдж (`Collection` / `CAPEX`), сверху отдельная плитка-итог CAPEX рядом с плиткой Collections, плюс фильтр по бейджу. Other Income с source `collection` показывается строкой со знаком «+», а не скрытым вычетом.
- **Expenses** — добавляем кнопку/вкладку `Expenses` в строке вкладок Office сразу после `Day Closings`; она открывает уже существующий экран `FinancesExpensesPage` (новый интерфейс не рисуем, ничего не дублируем). Из выбора категории при создании/редактировании расхода убираем `CAPEX`, `Collection` и `Inter-Casino Transfer` (всё, где `bucket <> 'expense'`), с валидацией на сохранении.
- **Transactions** (`?tab=other-incomes`, `OtherIncomesTab`) — это Other Incomes: комиссии/fees, Movements (investment / owner top-up / office), Add Float, Collection-приходы и прочие ручные приходы/списания по `fin_other_incomes`. Состав не меняем.
- **Transfers / Inter-Casino** — `bucket = transfer` (Money Change, Inter-Casino Transfer Out) плюс межфилиальные переводы.

### 3. Monthly Report

Expected показывает отдельными строками: `− Expenses`, `− Collections`, `− CAPEX`, `± Transfers`. Строки раскрываемые — по клику список записей, из которых сложилась сумма (дата, категория, описание, сумма).

### 4. Проверка

Сверить Arusha за август: сумма строк Expected должна дать прежнее значение, а Collections и CAPEX на вкладке Collections — совпасть с соответствующими строками отчёта.


## Про период (проверено, менять не нужно)

В `fin_balance_snapshot` физический пересчёт кошелька (`cash_count_snapshots`) уже отбирается строго внутри окна периода (`business_date BETWEEN p_period_start AND p_period_end`), без переноса между месяцами, а стартовый флоат берётся на первый день окна. То есть правка кошелька 15 сентября с датой в августе меняет Actual только в августе и не влияет на сентябрь, и наоборот. Это поведение сохраняем как есть.

## Технические детали

- Миграция: `ALTER TABLE public.fin_categories ADD COLUMN bucket text NOT NULL DEFAULT 'expense'` + CHECK на список значений + UPDATE существующих строк.
- `CREATE OR REPLACE FUNCTION public.fin_balance_snapshot(...)` — замена трёх `FILTER (... ILIKE ...)` на `FILTER (WHERE fc.bucket = ...)`, добавление `capex_total` в возвращаемый JSON и в дневную разбивку `daily`.
- Фронт: `CollectionsTab.tsx` — убрать хардкод `isCapex`, показывать оба бакета с бейджами и отдельной плиткой CAPEX; в форме расходов фильтровать список категорий по `bucket = 'expense'`; раскрываемые строки в Monthly Report. Новых вкладок и файлов-копий не создаём.
- Область: только Office/Finance; формула Expected по сумме не меняется; история Money In/Out не переклассифицируется.
