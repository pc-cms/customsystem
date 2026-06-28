## 1. Кнопки периода в Player Statistics

**Файл:** `src/components/ui/date-range-presets.tsx`

- Добавить новые опциональные props:
  - `hideWeek?: boolean` — скрывает кнопку «Week».
  - `showAll?: boolean` — показывает кнопку «All» сразу после «Year».
  - `allFrom?: string` — стартовая дата для «All» (по умолчанию `2020-01-01`).
- Расширить тип `DatePreset` значением `"all"` (трактуется как `custom` для shift-логики, чтобы Prev/Next не ломался — при `preset==="all"` стрелки no-op).
- Кнопка «All» при клике вызывает `onChange({ preset: "all", from: "2020-01-01", to: <today EAT> })`.
- Никаких изменений в других экранах: они продолжают использовать компонент без новых пропсов.

**Файл:** `src/pages/PlayerStatistics.tsx`

- Передать `hideWeek showAll` в `<DateRangePresets>`.
- При выборе `preset === "all"` использовать `from = 2020-01-01`, `to = today` (логика нормализации `fromDate/toDate` уже на месте).

## 2. Глобальный аудит DROP и снятие лимитов (фронт)

Единый принцип: **только `player_day_drop_cache` / `table_day_drop_cache` (peak-NEP per business day)**. Все списочные запросы — через `fetchPaged` (страницы по 1000, без `.limit(...)`).

### 2.1 `src/pages/Reports.tsx`
- Заменить `compute_players_drop_split` RPC (в `PlayerReport` и `GroupReport`) на чтение `player_day_drop_cache` за диапазон через `fetchPaged` (sum `peak` по `player_id`).
- Снять `.limit(1000/10000/50000)` в `TotalReport`: `shifts`, `cage_slots_shifts`, `expenses`, `player_day_drop_cache` загружать через `fetchPaged`.
- Подтянуть `usePlayers()` / `useTransactions()` / `useExpenses()` без лимитов (см. пункт 2.4).

### 2.2 `src/hooks/use-transactions.ts`, `use-expenses.ts`, `use-chip-transfers.ts`, `use-player-chip-adjustments.ts`, `use-cashless.ts`, `use-incidents.ts`, `use-daily-expenses.ts`, `use-category-mtd.ts`, `use-fin-monthly-report.ts`, `use-bank-checks.ts`, `use-cctv-observations.ts`
- Хуки, которые читают «весь список за бизнес-день/диапазон», перевести на `fetchPaged`. Точечные «последние N» (`use-last-visit`, `use-shift`, `use-pos-shift` и т.п.) — оставить как есть.
- Вынести `fetchPaged` в общий модуль `src/lib/fetch-paged.ts` и переиспользовать.

### 2.3 `src/hooks/use-player-profile.ts`
- Убрать `.limit(500/1000/5000/2000)` для визитов/транзакций/корректировок — через `fetchPaged`. Tile «Result/Drop/Hold%» уже считается из `player_day_drop_cache` (PlayerProfile.tsx).

### 2.4 `src/hooks/use-players.ts`
- `usePlayerEconomyRange`: убрать оставшиеся лимиты, использовать `fetchPaged`.

### 2.5 `src/components/cage/ShiftClosingReport.tsx`, `src/pages/PlayerVisitsBreakdown.tsx`, `src/components/pit/ActivePlayers.tsx`, `src/components/player/PlayerPreviewHeader.tsx`, `src/pages/Tables.tsx`
- Сверить, что Drop берётся ТОЛЬКО из `player_day_drop_cache` / `table_day_drop_cache`. Где остался NEP-walk на фронте — удалить.

### 2.6 `src/pages/reports/*.tsx` (Promo/Cashback/Lottery/AmBudget)
- Снять `.limit(2000/3000)` — пагинировать через `fetchPaged`.

## 3. Серверная сверка DROP (миграция)

**Цель:** гарантировать `Σ player_day_drop_cache.peak == Σ table_day_drop_cache.drop_r_share` и отсутствие протухших строк после старых багов.

Создать миграцию `recheck_drop_caches`:

1. **Функция `public.rebuild_drop_caches_for_day(_casino_id, _business_date)`**
   - Полный пересчёт двух кэшей для указанного бизнес-дня (использует существующую логику триггеров `tg_player_day_drop_cache_*` / `tg_table_day_drop_cache_*`).
   - Транзакционно: `DELETE ... WHERE casino_id=_ AND business_date=_; INSERT ... SELECT ... FROM transactions ...`.
2. **Функция `public.audit_drop_caches(_from date, _to date)`**
   - Возвращает строки, где `Σ peak(players) != Σ drop_r_share(tables)` или где есть транзакции без cache-row.
3. **Backfill-вызов** в той же миграции:
   ```sql
   SELECT public.rebuild_drop_caches_for_day(casino_id, d)
   FROM (SELECT DISTINCT casino_id, business_date AS d FROM player_day_drop_cache
         UNION
         SELECT DISTINCT casino_id, business_date FROM table_day_drop_cache) x;
   ```
4. **GRANT** на функции: `authenticated, service_role`.
5. После миграции прогнать `audit_drop_caches('2020-01-01', current_date)` через `supabase--read_query` — отчёт о расхождениях прикреплю в чат.

## 4. Verify

- `tsgo` — типы (новый `DatePreset = "all"` обрабатывается).
- Открыть Player Statistics → проверить кнопки `Day · Month · Year · All · Custom`.
- Year/All в Arusha: число игроков и тоталы стабильны, не зависят от перезагрузки.
- Reports / Player tab: суммы Drop совпадают с Player Statistics за тот же диапазон.

## Technical notes

- Где остались лимиты, которые НЕ снимаем: «последний N» запросы (`.order(...).limit(1)`), POS dropdown'ы, network/admin списки.
- «All» = `2020-01-01 → today` (фикс). Стрелки prev/next при `preset==="all"` отключены, чтобы не уехать в будущее.
- `fetchPaged` уже есть в трёх файлах — выношу в `src/lib/fetch-paged.ts`, остальные импортируют оттуда.
- Серверный backfill идемпотентен (через `DELETE+INSERT` на (casino_id, business_date)).
