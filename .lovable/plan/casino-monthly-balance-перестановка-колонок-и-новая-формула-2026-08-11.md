# Casino Monthly Balance — перестановка колонок и новая формула Variance

## 1. Перестановка колонок

- **JP** переносим в блок **Casino Result**, ставим перед **Tips**. Учитывается со знаком как есть: приход плюсом, выплата минусом.
- **Missed Cards** переносим в блок **Diff** (рядом с Miss Chips и Slots Diff), знак сохраняем прежний.
- **Other Incomes** как отдельная колонка убирается: положительные суммы попадают в **Office +**, отрицательные — в **Office −** (по модулю).

## 2. Office становится автоматическим

- Ручной ввод Office `+` / `−` убираем.
- Office `+` = сумма положительных Other Incomes за день, Office `−` = сумма отрицательных по модулю.
- Ранее введённые вручную значения перестают использоваться в расчёте.

## 3. Формула Variance

```text
Variance = Деньги на вчера (или Start)
         + Result
         ± Diff
         − Expenses
         ± Office
         − Деньги на сегодня
```

Идеальное значение — `0`.

- «Деньги на вчера» = Money Total последнего доступного предыдущего Record; если Record ещё не было — строка **Start**.
- Result уже включает JP.
- Diff включает Miss Chips, Missed Cards и Slots Diff.
- Office = Office + минус Office − (обе части из Other Incomes).
- «Деньги на сегодня» = Money Total этой строки.

## 4. Расходы

- Правило сохраняем: кассовые расходы попадают в день только после закрытия бизнес-дня, офисные — сразу.
- Берутся только утверждённые, невоидированные, без reversal.

## 5. Cage Casino и Money Total (по ранее согласованным ответам)

- Cage Casino = Live Cage + Slots Cage из последнего **Record** бизнес-дня, все деньги кроме фишек; нет Record — `0`.
- Cage Manager / Bank TZS / Bank USD — из последнего Record; USD конвертируется ровно один раз.
- Money Total = Cage Casino + Cage Manager + Bank TZS + Bank USD (в TZS).
- Пустые ячейки отображаются как `0`.

## 6. Технические детали

- `src/hooks/use-daily-balance-report.ts`: перенос `jp` в расчёт Result, `missed_cards` в `diff_total`, `money_in`/`money_out` считаются из `fin_other_incomes` по знаку вместо ручных значений, новая формула Variance с переносом Money Total последнего доступного предыдущего дня.
- `src/pages/reports/DailyBalanceReport.tsx`: порядок колонок (JP перед Tips в Casino Result, Missed Cards в Diff), удаление колонки Other Incomes, отключение инлайн-редактирования Office, обновление плиток итогов и подписи Variance.
- `src/lib/monthly-balance-formulas.ts`: обновить описания источников и формулу Variance.
- Поднять версию в `package.json`.
