# Drill-down финансовых отчётов: мобильные кошельки, банк, единая шапка

## Что меняем

### 1. Мобильные кошельки в разбивке кассы
Во всех drill-down по кассе (Casino Monthly Balance → Cage Casino / Cage Manager, Office Monthly Balance → Cage) под таблицей валют показываем блок Mobile money: AirTel, Tigo, Halo, Mpesa — по одной строке на провайдера, с нулями, если движения не было, плюс строка Total. Валютная таблица остаётся сводной (CUR | Amount | Rate | TZS), без номиналов.

Источник: кошельки типа mobile_money по казино (в Office — по всем казино, суммарно). В демо-режиме добавим соответствующие значения, чтобы блок был виден.

### 2. Банк в Office — клик открывает TZS/USD
Колонка Bank в Office Monthly Balance становится кликабельной: панель показывает банковские кошельки в разрезе валют — TZS и USD (сумма в валюте, курс, TZS-эквивалент) и итог. Сейчас Bank не кликается.

### 3. Расходы в Office → матрица расходов
Клик по ячейке Expenses в Office Monthly Balance больше не открывает боковую панель, а переходит на страницу Office Expenses Matrix (`/reports/expenses-office`, в демо — `/demo/expenses-office`) с выбранным месяцем и подсветкой/раскрытием выбранного дня.

### 4. Единая шапка всех drill-down панелей
Один общий компонент шапки для всех панелей (обе страницы отчётов):

```text
CAGE · MWANZA            <- источник (крупно, одна строка)
05/08/2026               <- дата
12 450 000 TZS           <- сумма, крупно, моноширинно
```

Правило: одна строка на заголовок (без переноса, с обрезкой длинных названий), сумма всегда присутствует и выделена, дата в формате DD/MM/YYYY. Применяется в том числе к расходам — «Ахилл» и другие длинные подписи не будут ломать шапку на две строки.

## Технические детали

- `src/components/reports/CurrencyCashTable.tsx` — добавить опциональный проп `mobile` (список провайдер → сумма TZS) и рендер блока Mobile money.
- Новый `src/components/reports/DrillHeader.tsx` — источник/дата/сумма; подключить в `DailyBalanceReport.tsx` и `OfficeBalanceReport.tsx` внутри `SheetHeader`.
- `src/hooks/use-office-balance-report.ts` — добавить в строку `mobile_detail` (агрегация по кошелькам `mobile_money`) и `bank_detail` (банковские кошельки в разрезе валют: amount, rate, tzs).
- `src/hooks/use-daily-balance-report.ts` — добавить `mobile_detail` в `cage_detail` для казино.
- `src/lib/demo-report-data.ts` — заполнить новые поля демо-значениями.
- `src/pages/reports/OfficeBalanceReport.tsx` — Bank кликабельный, Expenses → `navigate` на матрицу расходов с `?month=` и `?date=`; `ExpensesMatrix` читает эти параметры.
