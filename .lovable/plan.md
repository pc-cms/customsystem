# Boss TV Report: CAPEX перед Collection

## Что меняем

В `src/components/boss/monthly-report-panel.tsx` переставляем строки в блоке итогового отчёта: **CAPEX** выводится отдельной строкой **перед** Collection (сейчас — после).

Порядок после правки:
```text
Estimated Expenses
Result (Table + Slot)
Table Result
Slot Result
CAPEX          ← отдельная строка
Collection
```

## Детали

- Только перестановка строк в массиве `rows`; значения, формулы, Balance и Expected Profit не меняются.
- CAPEX остаётся приглушённой (`muted`) строкой и по-прежнему уменьшает Balance и Expected Profit.
- Monthly Report (Office) не трогаем — изменение только в Boss TV Report.

## Проверки

- TypeScript, сборка.
