## Цель
На `/tables/close` (Close Tables wizard) — поведение ввода как в Chip Count: ячейка пустая, серым **плейсхолдером** показывается значение из **последнего ЧЕКА** (chip_snapshot) для этой пары (table, denom). Если чека сегодня не было — fallback на Float (baseline).

## Что меняю (frontend-only)

Файл: `src/components/tables/CloseTableWizard.tsx`

1. **Источник «последней» цифры** — уже есть `latestSnapshotPerTable` (строится из `useChipSnapshots(date)`). Добавляю helper:
   ```ts
   const getLastCheck = (tableId, denom) =>
     latestSnapshotPerTable[tableId]?.[denom] ?? baselineMap[tableId]?.[denom] ?? 0;
   ```

2. **`getInitialCounts`** — больше не префиллим `tableBaseline[d]`. Возвращаем `NaN` для пустой ячейки (как в `ChipCountPanel`). Сохраняем фактический `draft` (closing_chips) если он есть.
   ```ts
   if (draft[d] !== undefined) out[d] = Number(draft[d]);
   else out[d] = NaN;            // пусто → плейсхолдер = last check
   ```

3. **Input** (строки 318–332):
   - `value={Number.isFinite(currentCounts[d]) ? currentCounts[d] : ""}`
   - `placeholder={String(getLastCheck(current.id, d))}`
   - Класс плейсхолдера: `placeholder:text-muted-foreground/60` (серый — уже почти так, но без `/60`; делаю одинаково с Chip Count).
   - `setCount`: пустая строка → `NaN`, иначе число.

4. **`calcResult` и Diff** — если в ячейке `NaN`, считаем «как в last check»: `actual = getLastCheck(table.id, d)`. То есть пустая ячейка = «без изменений с последнего чека», что совпадает с поведением `ChipCountPanel` (там подставляется `lastCheck` в математику).
   - Это меняет и live Result в правом блоке, и колонку Diff в строке.

5. **`handleSave`** — при сохранении в `closing_chips` и `snapshot_rows` так же подставляем `actual = Number.isFinite(currentCounts[d]) ? currentCounts[d] : getLastCheck(current.id, d)`. То есть Pit может сохранить, ничего не введя — это фиксирует «как в последнем чеке».

## Чего НЕ трогаю
- Хук `useChipSnapshots` и DB.
- `ChipCountPanel`, `Cage`, остальные модули.
- Версия `package.json` (чистый UI).
- Логика Fill/Credit/adjustment.

## Проверка
- Открыть `/tables/close`, не вводить ничего → Diff = 0, Result = 0+adj, плейсхолдеры серые = последний чек.
- Сделать чек по столу (Chip Count) → вернуться в Close Tables → плейсхолдеры обновились.
- Ввести цифру → input становится чёрным, Diff пересчитывается от Float (baseline), как и сейчас.
- Save без ввода → в БД уходят значения последнего чека (а не нули).
