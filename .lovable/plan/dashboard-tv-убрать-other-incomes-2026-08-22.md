# Dashboard TV — убрать Other Incomes

## Что меняем

1. Строка «Other incomes» полностью исчезает из отчёта Dashboard TV (Company Report) — и в mobile-, и в desktop-режиме таблицы.
2. Other Incomes перестают участвовать в формулах отчёта:

```text
Expected Profit = Forecast Result − Estimated Expenses − Extra Expenses − Collection
Balance         = Result − Estimated Expenses − Extra Expenses − Collection
```

3. Подсказки (tooltip) у Expected Profit и Balance обновляются под новые формулы — упоминание Other Incomes убирается.
4. Сами Other Incomes в модуле Finance остаются без изменений — правка только на Dashboard TV.

## Технические детали

- `src/hooks/use-boss-monthly-report.ts`: убрать `tOther` из расчёта `balance` и `expectedProfit`. Поле `other` в summary/totals можно оставить (данные приходят из RPC), но оно больше не влияет на итоги; в UI не используется.
- `src/components/boss/monthly-report-panel.tsx`: удалить строку `label: "Other incomes"` из массива строк отчёта; поправить `expectedHint` и `balanceHint`.
- RPC `boss_monthly_report` не трогаем — изменений в базе нет.
