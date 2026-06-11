## Цель

Убрать подвисание Chip Count за счёт того, чтобы грузить и держать в памяти только данные текущего бизнес-дня, и не всю простыню снимков (на загруженном дне 2000+ строк), а только последний снимок по каждой паре (локация × номинал).

## Что сейчас происходит

- `useChipSnapshots(date)` тянет ВСЕ строки `chip_snapshots` за дату (на 2026-06-09 их 2321, ~1 МБ JSON).
- Для UI достаточно «последнего значения по каждой локации/номиналу» — это ~300 строк.
- React-Query уже персистится в IndexedDB (`PersistQueryClientProvider` в `App.tsx`), но: на первом заходе после reload всё равно тянет полный список, а `staleTime: 30s` — короткий, что на медленных ПК ощущается как freeze.

## План

### 1. RPC `chip_snapshots_latest` (DB)

Новая SQL-функция: `chip_snapshots_latest(_casino_id uuid, _date date) returns setof chip_snapshots`. Внутри — `DISTINCT ON (location_type, location_id, denomination) … ORDER BY …, created_at DESC, id DESC`. SECURITY INVOKER, опирается на существующие RLS-политики. Возвращает только последние значения за бизнес-день (≈300 строк вместо 2300).

### 2. `useChipSnapshots(date)` → лёгкий режим по умолчанию

`src/hooks/use-chips.ts`:
- Заменить `fetchChipSnapshots` на вызов RPC `chip_snapshots_latest` (через `supabase.rpc`).
- Для текущего бизнес-дня поднять `staleTime` до `Infinity` + `gcTime: 24h`. Realtime (`use-realtime.ts`) сам инвалидирует на новые строки, а на старых днях ничего не меняется → пересчёт не нужен.
- Для прошлых дат — `staleTime: 5 * 60_000`.
- Persist в IndexedDB уже работает: повторный заход на Chip Count будет мгновенным.

### 3. Полная история — отдельным хуком только там, где она реально нужна

`useChipSnapshotsFull(date)` (старый код `fetchChipSnapshots`) — оставить ТОЛЬКО для `TableAnalyticsChart` (страница `/tables/analytics`), где нужна вся история часовых точек. `Dashboard`, `Tables`, `ChipCountPanel`, `CloseTableWizard` переключаем на лёгкий `useChipSnapshots`.

### 4. Инвалидация в realtime

`src/hooks/use-realtime.ts`: проверить, что invalidate идёт по ключу `["chip-snapshots"]` — оставить как есть, новый облегчённый запрос подцепит то же. Полная история инвалидируется тем же ключом → отдельный prefix `["chip-snapshots-full"]` для нового хука.

### 5. Bump версии

Любое изменение в backend → patch-bump `package.json`.

## Файлы

- `supabase/migrations/<ts>_chip_snapshots_latest.sql` — новая RPC + GRANT EXECUTE для authenticated.
- `src/hooks/use-chips.ts` — переписать `useChipSnapshots` на RPC, добавить `useChipSnapshotsFull`, поднять staleTime для сегодняшнего дня.
- `src/lib/chip-snapshots.ts` — оставить `fetchChipSnapshots` (используется `useChipSnapshotsFull`).
- `src/components/tables/TableAnalyticsChart.tsx` — переключить на `useChipSnapshotsFull`.
- `src/hooks/use-realtime.ts` — добавить invalidate для `chip-snapshots-full` рядом с существующим.
- `package.json` — bump patch.

## Ожидаемый эффект

- Payload Chip Count: ~1 МБ → ~150 КБ.
- Первая отрисовка после клика: с ~2-4 сек freeze → мгновенно на загруженных днях.
- Повторные заходы внутри сессии: 0 запросов (cache + Infinity staleTime), полностью локально.
- На разных ПК отказ от тяжёлого sort/reduce на 2300 объектов в `useMemo`.

Подтвердить — начну миграцию и правки.
