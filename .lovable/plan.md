# Dashboard TV: live-результат столов как на дашборде казино

## Проблема

Live-результат столов за сегодня на Dashboard TV считается упрощённо: берутся только последние пересчёты фишек (`chip_snapshots_latest`), суммируется `(actual − expected) × номинал`.

Дашборд казино считает по-другому (`src/lib/table-live-result.ts`):

1. Если стол закрыт и у него есть `closing_result` — берётся именно он (авторитетный источник), а не снимок фишек.
2. Иначе — последний пересчёт фишек по столу.
3. Плюс по каждому столу применяется корректировка смены Fill/Credit (`Σcredit − Σfill`), как в RPC `compute_shift_table_results`.

Пунктов 1 и 3 на Dashboard TV сейчас нет — поэтому цифра за сегодня расходится с дашбордом казино и с закрытием смены.

## Что сделать

Привести live-результат столов на Dashboard TV к той же формуле:

- Для каждого казино дополнительно тянуть закрытия столов текущего бизнес-дня (`closing_result`) и корректировки Fill/Credit активной смены.
- Считать результат по столу через общую логику `liveTableResult`: `closing_result` → иначе снимок фишек → плюс Fill/Credit.
- Суммировать по столам казино; закрытый день (`fin_day_closing`) по-прежнему имеет приоритет над live.

Ту же формулу применить в двух местах, чтобы вкладки не расходились:
- `src/hooks/use-boss-dashboard.ts` (live-плитки Total / Live / Slots / MTD)
- `src/hooks/use-boss-monthly-report.ts` (строка сегодняшнего дня в Monthly Report)

## Технические детали

- Переиспользовать `buildLatestTableSnapshot` + `liveTableResult` из `src/lib/table-live-result.ts` вместо ручного `reduce` по снимкам.
- Fill/Credit брать тем же источником, что и `useShiftTableAdjustments`, но по конкретному `casino_id` (хук завязан на активное казино, для мульти-казино нужна функция-загрузчик по id).
- Слоты за сегодня остаются из `cage_slots_shifts.system_shift_result`; Drop не трогаем.
- Поднять версию в `package.json`.
