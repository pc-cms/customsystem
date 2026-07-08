
## Часть A. Правило Drop (постоянное)

**Per-table Drop = всегда `·` (прочерк).** Никакой per-table drop не считается и не показывается — ни как split NEP, ни как сумма транзакций стола, ни как 0. Прочерк везде, без условий.

**Total Drop = единственный источник — Player Statistics (`player_day_drop_cache`).**
Тот же алгоритм, что уже отображается в блоке Player Statistics: `SUM(drop_amount)` из кэша за business_date смены/диапазона, для казино (и опционально для группы игроков).

Расхождения между «суммой пустой колонки» и Total Drop не существуют — колонка пустая, сумма только внизу.

Все «фантомные» split-распределения (`splitTablesWindow` / `use-drop-split` в per-table контексте) — из UI-отображения убираются.

### Файлы

**1. `src/components/cage/ShiftClosingReport.tsx` — печатный Shift Report**
- В `rowFor(t)` установить `drop: null`.
- Удалить загрузку `inByTable` через `splitTablesWindow` (осталась только для Result — проверить, не сломается ли RPC; если Result использует `inByTable` — оставить расчёт, но НЕ выводить в колонку Drop).
- Колонка Drop в таблице столов: рендерить `·` для всех строк.
- Итог `Total Drop` под таблицей: получить один запрос `player_day_drop_cache` по `casino_id + business_date` смены → сумма.

**2. `src/pages/Reports.tsx` (строки 802, 974, 1016 — три `totals.drop`)**
- В `sorted[]` для строк-столов: колонка Drop = `·`.
- `totals.drop` — заменить на суммы из `player_day_drop_cache` за диапазон.

**3. `src/pages/Tables.tsx` (строка 368) + `src/pages/Dashboard.tsx` (строки 149, 348)**
- Per-table колонка Drop → `·`.
- KPI Total Drop → `player_day_drop_cache` (Dashboard уже близок к этому — верифицировать, чтобы был именно тот же источник).

**4. `src/pages/TableResults.tsx`**
- AR/PK/BJ per-row drop → `·` во всех ячейках столов (`DRCell`, `DRHeadCell` с `hasData=false`).
- Group totals и `totals.totalDrop` внизу → `player_day_drop_cache` за business_date.
- Excel-экспорт: колонки *Drop по столам* — пустое поле; Total Drop — из cache.

**5. `src/pages/Groups.tsx` (строка 144)**
- `totals.drop` для группы игроков → сумма `player_day_drop_cache` по `player_id IN (…)` за period.

**6. Централизация**
Создать `src/lib/drop-source.ts` c одной функцией:
```ts
export async function fetchTotalDrop(params: {
  casinoId: string;
  fromDate: string; toDate?: string;
  playerIds?: string[];
}): Promise<number>
```
+ React Query хук `useTotalDrop(...)`. Все 5 экранов зовут этот хук — единый источник истины.

**7. Memory**
- Новый файл `mem://features/drop-source-of-truth`:
  > Per-table Drop не отображается нигде (везде `·`). Total Drop в любом отчёте, KPI и печати = `SUM(drop_amount)` из `player_day_drop_cache` за business_date. Никаких split/NEP-распределений в UI.
- В `mem://index.md` Core добавить одну строку с сутью правила.

---

## Часть B. Сброс кэша при switchCasino()

**Файл: `src/lib/casino-context.tsx`**

В функцию `switchCasino(nextCasinoId)` добавить перед `setActiveCasinoId(...)`:

```ts
// 1. Отменить активные фетчи и очистить React Query
await queryClient.cancelQueries();
queryClient.clear();

// 2. Очистить IndexedDB-персист (query-persister)
await clearIDBPersistedQueryCache();

// 3. Сбросить in-memory кэши-словарики (blacklist-cache и т.п.)
clearBlacklistCache?.();
```

Импорты:
- `queryClient` — из общего `src/lib/query-client.ts` (или `useQueryClient()` через React, вынести на уровень провайдера).
- `clearIDBPersistedQueryCache` — из `src/lib/query-persister.ts` (уже существует).
- `clearBlacklistCache` — если есть в `src/lib/blacklist-cache.ts`.

**Дополнительно:**
- Добавить `console.info('[Cache] switched casino → cleared RQ + IDB', { from, to })` для отладки.
- После `clear()` вызвать `queryClient.invalidateQueries()` уже не нужно — clear полностью сбрасывает.
- Убедиться, что `casino-context` рендерит children с новым `key={activeCasinoId}` НЕ обязательно, но опционально можно добавить `key` на роутере в `App.tsx` — обсуждать отдельно, чтобы не форсить размонтирование всего дерева. По умолчанию не трогаем.

**Проверка:** войти под юзером с доступом к 2 казино, переключить → в консоли `[Cache] switched...`, все хуки перезапрашивают данные для нового casino_id, старые данные не мелькают.

---

## Что НЕ трогаем

- Server-side расчёт `player_day_drop_cache` — уже источник истины, изменений не требует.
- Player Statistics страница — не меняется.
- Split-логика `splitTablesWindow` в модуле — оставляем в коде на случай если нужна для Result-формулы; удаляем только вызовы в per-table Drop.
- Auth / session — сброс кэша не трогает Supabase-сессию.
