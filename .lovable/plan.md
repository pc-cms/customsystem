# Casino Monthly Balance — перестановка колонок и новая формула Variance

## 1. Перестановка колонок

- **JP** переносим в блок **Casino Result**, ставим перед **Tips**. Отдельной колонки JP в блоке доходов больше нет.
- **Missed Cards** переносим в блок **Diff** (рядом с Miss Chips и Slots Diff), знак сохраняем прежний.
- **Other Incomes** как отдельная колонка убирается: положительные суммы попадают в **Office +**, отрицательные — в **Office −** (по модулю).

## 2. Формула Variance

```text
Variance = Деньги на вчера (или Start)
         + Result
         ± Diff
         − Expenses
         ± Office
         − Деньги на сегодня
```

Идеальное значение — `0`.

- «Деньги на вчера» = Money Total предыдущей строки; для первой строки месяца — строка **Start**.
- Result уже включает JP.
- Diff включает Miss Chips, Missed Cards и Slots Diff.
- Office = Office + минус Office −, включая перенесённые Other Incomes.
- «Деньги на сегодня» = Money Total этой строки.

## 3. Cage Casino и Money Total (по ранее согласованным ответам)

- Cage Casino = Live Cage + Slots Cage из последнего **Record** бизнес-дня, все деньги кроме фишек; нет Record — `0`.
- Cage Manager / Bank TZS / Bank USD — из последнего Record; USD конвертируется ровно один раз.
- Money Total = Cage Casino + Cage Manager + Bank TZS + Bank USD (в TZS).
- Пустые ячейки отображаются как `0`.

## 4. Технические детали

- `src/hooks/use-daily-balance-report.ts`: перенос `jp` в расчёт Result, `missed_cards` в `diff_total`, распределение `fin_other_incomes` по знаку в manual Office `+`/`−` (как справочная добавка к ручному вводу), новая формула Variance с переносом Money Total предыдущего дня.
- `src/pages/reports/DailyBalanceReport.tsx`: порядок колонок (JP перед Tips в Casino Result, Missed Cards в Diff), удаление колонки Other Incomes, обновление плиток итогов и подписи Variance.
- `src/lib/monthly-balance-formulas.ts`: обновить описания источников и формулу Variance.
- Поднять версию в `package.json`.
