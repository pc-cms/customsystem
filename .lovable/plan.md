## Goal

1. Snapshot history снова per-save vs baseline + Fill/Credit (откат недавнего «cumulative»).
2. Полностью убрать колонку **HC** из грида Chip Count и запись в `table_head_count` при Save Snapshot. HC в Number Count tracker и так считается из активных игроков в казино — наш ручной HC дублировал/конфликтовал и не нужен.
3. Убрать `touched` state из инпутов. Поле — просто всегда белая цифра последнего счёта, оператор редактирует прямо.

## Changes (one file: `src/components/tables/ChipCountPanel.tsx`)

### 1. Snapshot history → per-save vs baseline + F/C

В `const history = useMemo(...)`:
- группировать строго по `created_at` (как раньше);
- результат стола = `Σ (actual − expected) × denom` ТОЛЬКО по сохранённым в этом save (denom);
- к итогу добавлять `adjustmentFor(table.id)` (shift Fill/Credit), чтобы последняя строка совпадала с Result в гриде;
- подпись справа: `N saves · result vs baseline (incl. Fill/Credit)`.

`<tfoot>` со строками «Fill/Credit (shift)» и «Current (latest + Fill/Credit)» удалить — F/C уже в каждой строке.

### 2. Удалить колонку HC

- `<col>` для HC в `<colgroup>`, `<th>` HC в `<thead>`, `<td>` с HC-инпутом в каждой `<tr>`, HC-ячейка в строке Total — удалить. `colSpan` пересчитать.
- Удалить state `hcDraft`/`setHcDraft`, hooks `useTableHeadCount`, `useBatchSetTableHeadCount`, `batchHeadCount`, `hcTarget`, `hcSlot`, `hcSlotValue`.
- Удалить ветку записи HC в `handleSave` (от `if (hcSlot && !readOnly)` до конца блока).
- Удалить `setHcDraft({})` из `useEffect`.
- Убрать импорт `Users` (становится unused).

### 3. Inputs без touched state

Откатить недавно добавленный `touched`/`onFocus`-clear/`onBlur`-revert. Логика:
- `counts[loc.key][d]` инициализируется в `useEffect` значением `getLastCheck(loc.id, d)` (а не `NaN`).
- Тот же `useEffect` запускается при изменении `tableSetKey` и при появлении новых snapshot'ов (`latestSnapshotPerTable`) — но только для ячеек, которые равны прежнему `lastCheck` (чтобы не затирать вводимое оператором). Простой вариант: при изменении `tableSetKey` инициализировать все ячейки `lastCheck`; при поступлении нового snapshot — пере-инициализировать только если ячейка совпадает с прошлым `lastCheck` (т.е. оператор её не правил после).
- `displayValue` = `String(counts[loc.key][d] ?? lastCheck)`, реальный белый текст, без placeholder.
- `onChange`: пишет число (или 0 при пустом).
- `onFocus`: `e.target.select()` чтобы было удобно перепечатать.
- `rowResults`: `actual = counts[loc.key][d] ?? lastCheck` — без NaN-веток.
- `handleSave`: пишет snapshot по всем (table, denom) с текущим `counts` (полный snapshot стола каждый раз) — это ровно то, что хочет пользователь: «каждый snapshot = текущая разница с baseline».

## Acceptance

- В гриде Chip Count нет колонки HC. Save Snapshot пишет только в `chip_snapshots`, не трогает `table_head_count`.
- Все ячейки — белые цифры (последний счёт или baseline). Клик → текст выделяется, можно сразу ввести новое.
- Save Snapshot создаёт полный snapshot по всем денoм всех открытых столов с текущими цифрами.
- В Snapshot history каждая строка = baseline-дельта этого save + shift F/C; последняя строка совпадает с Result в гриде. Лишних footer-строк нет.
- Number Count tracker и его HC не трогаем — он сам считается из активных игроков.
