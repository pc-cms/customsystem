## Что меняется

Добавить новую колонку **Zone** в таблице Player Statistics — сразу после колонки **Left**. Хранится `(player_id, casino_id, business_date) → zone ∈ {S, LG, CP}`, выбирается вручную (по умолчанию пусто). Колонка имеет сортировку, фильтр в шапке, цветную квадратную заливку по всей ячейке, и автоматически перекрашивает ячейку **Bet** той же строки в тот же цвет.

## Цвета зон (одна палитра для Zone и для Bet)

| Код | Игра | Tailwind (light/dark) |
|---|---|---|
| `S`  | Slots       | `bg-amber-500/20 text-amber-800 dark:bg-amber-500/25 dark:text-amber-200` |
| `LG` | Live Game   | `bg-sky-500/20 text-sky-800 dark:bg-sky-500/25 dark:text-sky-200` |
| `CP` | Club Poker  | `bg-purple-500/20 text-purple-800 dark:bg-purple-500/25 dark:text-purple-200` |

Пустая зона → нейтральный `text-muted-foreground` для обоих столбцов.

## База данных (миграция)

Новая таблица `player_daily_zones`:

```
id          uuid PK
casino_id   uuid NOT NULL
player_id   uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE
business_date  date NOT NULL
zone        text NOT NULL CHECK (zone IN ('S','LG','CP'))
created_by  uuid
created_at, updated_at  timestamptz
UNIQUE (casino_id, player_id, business_date)
```

GRANT'ы → `authenticated` (CRUD) + `service_role` (ALL). RLS:
- SELECT: все аутентифицированные в рамках своего casino_id (как у `player_daily_avg_bets`).
- INSERT/UPDATE/DELETE: роли `pit`, `manager`, `shift_manager`, `reception`, `super_admin` (через `has_role`).

Индексы: `(casino_id, business_date)`, `(player_id)`. Триггер `update_updated_at_column`.

Регистрация в `sync_table_registry` чтобы cms-sync реплицировала запись между casino-нодами.

## Фронтенд

### Новый хук `src/hooks/use-player-daily-zones.ts`
- `usePlayerDailyZones(businessDate)` → `Map<player_id, 'S'|'LG'|'CP'>` для текущего casino.
- `useSetPlayerDailyZone()` — upsert `(player_id, business_date, zone)`, delete при `null`. Инвалидация query-ключа.

### `src/lib/zone-colors.ts` (новый)
- `ZONE_LABELS = { S:'Slots', LG:'Live Game', CP:'Club Poker' }`
- `ZONE_CELL_CLASSES: Record<Zone, string>` — те самые tailwind-комбо выше (полная квадратная заливка td).

### `src/pages/PlayerStatistics.tsx`

1. Импорт `usePlayerDailyZones`, `useSetPlayerDailyZone`, `ZONE_CELL_CLASSES`.
2. Подключить `const { data: zonesByPlayer = new Map() } = usePlayerDailyZones(isSingleDay ? fromDate : undefined);` — поле работает только в режиме одного дня (как `dailyAvgBetByPlayer`); в multi-day показываем зону игрока, если она единственная за период (агрегируем в `displayRows`).
3. Расширить `SortKey` → добавить `'zone'`.
4. Добавить `zoneFilter: Set<Zone | 'none'>` в state, default = все четыре.
5. В `filtered` — фильтр по `zoneFilter`; в sorter — case `'zone'` (`S < LG < CP < none`).
6. **Шапка** (после `<H k="exit">Left</H>`):
   - `<th>` с двумя элементами: иконка-сортировка `Zone` и Popover-фильтр (чекбоксы S/LG/CP/None) — как уже сделано для других колонок в проекте.
7. **Ячейка строки** — новая `<td>` БЕЗ внутренних padding-классов, чтобы заливка была квадратной:
   - класс `${ZONE_CELL_CLASSES[zone] ?? ''} p-0 w-[44px] text-center align-middle`.
   - Внутри `<button>` с popover-выбором (S/LG/CP/Clear). Read-only если `!canEditZone`.
   - `canEditZone = isSingleDay && fromDate === today && roles ∈ {pit, manager, shift_manager, reception, super_admin}`.
8. **Ячейка Bet** — `<td>` получает класс зоны:
   - `className={`px-2 py-1.5 font-mono text-sm text-right ... ${ZONE_CELL_CLASSES[zone] ?? ''}`}`
   - Так весь td заливается тем же цветом — визуально парная связка Zone↔Bet.
9. Total row: пустые `<td>` под Zone (заливка не нужна).
10. `colSpan` в "No players" — увеличить на 1.

### Никаких изменений в:
- `nep-split.ts`, расчётах Drop/Result, типах transactions, других экранах.
- `PlayerProfile`, Dashboard и др. — Zone живёт только в Statistics.

## Версия

Backend изменение (новая таблица + RLS + sync registry) → авто-bump patch в `package.json`.

## Memory

Добавить `mem://features/player-zone-tagging` с описанием новой колонки и палитры; индекс в `Players`.
