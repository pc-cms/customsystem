## Проблема

После `Save Snapshot` в Chip Count, переключение на Numbers на **той же вкладке** не показывает только что записанные значения почасового слота — нужен Ctrl+Shift+R. То есть авто-запись в `table_tracker` уходит на сервер, но локальный кэш не обновляется так, чтобы Numbers увидел значение мгновенно.

## Причина

`useBatchSetTableTrackerValue` (см. `src/hooks/use-tables.ts:186–229`) делает оптимистический апдейт ТОЛЬКО так:

```ts
const queries = qc.getQueriesData<any[]>({ queryKey: ["table-tracker"] })
  .filter(([key]) => key[1] === casinoId);
queries.forEach(([key, data]) => {
  if (!data) return;            // ← если кэш пуст — пропускает
  ...
  qc.setQueryData(key, updated);
});
```

Плюс у мутации нет `onSuccess`/`onSettled` → нет финальной инвалидизации/refetch. Если query Numbers ещё не был хоть раз отрендерен (пользователь зашёл прямо в Chips), `data` пуст → ветка `if (!data) return` отбрасывает запись, и серверного перезапроса тоже нет, потому что Numbers не подписан на cancelQueries+invalidate.

Realtime тут не помогает — событие приходит «себе же», но `staleTime` по умолчанию + отсутствие `refetchOnMount: "always"` для `useTableTracker` могут «съесть» обновление при первом монтировании вкладки.

## Решение

1. **`src/hooks/use-tables.ts` — `useBatchSetTableTrackerValue`:**
   - В `onMutate` убрать ранний выход `if (!data) return`. Если кэша нет, создавать массив на месте: `const base = data ?? []`. Тогда оптимистический ряд всегда попадает в кэш `["table-tracker", casinoId, date]`.
   - Добавить `onSettled: () => qc.invalidateQueries({ queryKey: ["table-tracker", casinoId] })` — после ответа сервера принудительный refetch с реальными `id`/`recorded_by`, гарантирует точное совпадение с БД.
   - Тот же фикс применить к одиночному `useSetTableTrackerValue` (та же ветка `if (!data) return` и нет `onSettled`).
   - Аналогично — `useSetTableHeadCount` и `useBatchSetTableHeadCount`: одинаковая болезнь, одинаковый фикс (HeadCount в Numbers тоже мерцает).

2. **`src/hooks/use-tables.ts` — `useTableTracker` и `useTableHeadCount`:**
   - Добавить `staleTime: 15_000`, `refetchOnMount: "always"`, `refetchOnWindowFocus: true`, `refetchOnReconnect: true` — по аналогии с уже исправленным `usePlayerDailyZones` (см. `.lovable/plan.md`). Это страхует случаи, когда персистентный кэш React Query рехидратируется пустым.

3. **`src/components/tables/ChipCountPanel.tsx` — `handleSave`:**
   - После `batchTracker.mutate(...)` вызвать `qc.invalidateQueries({ queryKey: ["table-tracker", casinoId, date] })` сразу же (мгновенный refetch + повторный паблиш в подписки). Это резервный путь на случай, если оптимистика не пройдёт.

## Что НЕ трогаем

- БД, RLS, таблицы, триггеры, публикация Realtime — без изменений.
- Логика `slotForChipCount` и окно :50–:10 — без изменений.
- ChipCountPanel UI/раскладка — без изменений, только один лишний `invalidateQueries` в `handleSave`.

## Проверка

1. На пустой странице открыть Table Check → сразу Chips → ввести числа → Save Snapshot → переключить на Numbers: значения и HC видны мгновенно, без Ctrl+Shift+R.
2. Открыть Numbers заранее → перейти в Chips → Save: вернуться в Numbers — те же значения сразу.
3. В :50–:10 значения попадают в текущий слот (или :HH+1:00 для :50–:59), в :11–:49 — только в пустой слот (поведение не меняем).
4. На втором устройстве через Realtime значения по-прежнему появляются за ≤2 сек (доп. проверка, что не сломали broadcast-путь).
