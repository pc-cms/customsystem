# Casino Monthly Balance — привести деньги и результаты к логике Wallets

CMB остаётся независимым контрольным отчётом (Variance может отличаться от Wallets в этом месяце из-за разной точки старта — Start в CMB = вчера/сегодня). Но источники цифр приводим к одной модели.

## Что меняем по деньгам (Money Total)

1. **Cage Casino** — считаем из кошельков `cage_table` + `cage_slot` (не из закрытий смен). Закрытия смен остаются только источником результатов, не источником денег.
2. **Cage Manager и Bank** — берём из записи Record (`fin_day_balance_snapshot`), которая фиксирует состояние всех кошельков на конец бизнес-дня, кроме `cage_table` / `cage_slot`. Если снимка за день нет — ячейка ставится `0`, а не пустая (`·`).
3. **Terminal** — колонку убираем полностью (деньги приходят в банк, двойной счёт).
4. Money Total = Cage Casino (кошельки) + Cage Manager (Record) + Bank TZS + Bank USD.

## Что меняем по результатам и Diff

5. **Miss Chips** — знак приводим к офисной/Wallets-логике (минус в ожидаемом, как в `fin_balance_snapshot`).
6. **Miss Cards** — добавляем отдельную колонку (тот же знак, что Miss Chips).
7. **Card Balance учитывается один раз**: Slots берём gross из Close Day, Card Balance остаётся отдельной колонкой Diff. Двойного вычета в Slots больше нет.
8. **Bar / POS** — оставляем в Result как есть.
9. **JP и Other Incomes** — добавляем колонки: JP отдельно, Other Incomes = все `fin_other_incomes` кроме JP (сейчас берётся только `source = 'fee'`).
10. **Collections** — добавляем колонку; по факту это Office OUT (одно и то же движение), поэтому Collections и Office OUT не суммируются дважды: Collections показывается как справочная колонка, а в Variance участвует Office OUT.

## Расходы

11. Фильтр расходов приводим к Wallets: только `approved = true`, без reversal; кассовые (Live/Slots) учитываются после закрытия бизнес-дня, office — сразу.

## Start и Variance

12. Строка Start остаётся ручной (`fin_month_start`). Автоподтягивание из кошельков не делаем; добавляем предупреждение в UI, если Start пустой.
13. Variance считается по колонкам отчёта:

```text
Variance = Start + Result + Diff (Miss Chips − , Miss Cards − , Card Balance +)
         + JP + Other Incomes + Office IN
         − Expenses − Office OUT
         − Money Total
```

## Технические детали

- `src/hooks/use-daily-balance-report.ts`: `DailyBalanceRow` расширяем полями `jp`, `other_income`, `missed_cards`, `collections`; `cage_casino` переводим на кошельки `cage_table`/`cage_slot`; `cage_manager` / `bank_tzs` / `bank_usd` читаем из `fin_day_balance_snapshot`; удаляем `terminal_*` и `bank_check` агрегацию; расходы фильтруем по `approved` + закрытию дня.
- `src/pages/reports/DailyBalanceReport.tsx`: убрать колонку Terminal, добавить JP, Other Incomes, Miss Cards, Collections; пересобрать формулу Variance и плитки итогов.
- `src/lib/monthly-balance-formulas.ts`: обновить описания источников для всех изменённых колонок.
- Поднять версию в `package.json`.
