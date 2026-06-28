# Единый источник Drop: `player_day_drop_cache` для Players, Tables и Dashboard

## Проблема (подтверждена ночью)
Drop в **Player Statistics** оказался ниже, чем суммарный Drop по столам на **Dashboard (Manager)**. Страницы считают Drop из разных источников и формул, поэтому за ночь накапливаются видимые расхождения.

Формула одна и та же — **peak-NEP за бизнес-день** (Africa/Dar_es_Salaam, rollover 07:00 EAT):
```
NEP = 0
buy/in    → NEP += amount; peak = max(peak, NEP)
cashout/out → NEP -= amount
Drop R = peak дня;  Drop V (Recycled) = total_in − peak
Период = Σ дневных peak
```
Авторитетная реализация — в БД: триггеры на `transactions` пишут готовые агрегаты в `player_day_drop_cache` и `table_day_drop_cache`. Но фронт сейчас читает их непоследовательно:

| Место | Источник | Проблема |
|---|---|---|
| Dashboard / Tables (per-table) | `table_day_drop_cache` + RPC fallback | OK |
| **Tables.tsx — игроки за столом** | локальный NEP-walk по последним **200** транзакциям | срезает на больших объёмах, не учитывает бизнес-день |
| PlayerStatistics | RPC `compute_players_drop_split` + локальный пересчёт через визиты (`playerInDropSum`) | фронтовая «уточняющая» арифметика |
| PlayerPreviewHeader | RPC `compute_player_drop_split` | OK, но не realtime |

## Решение
Сделать **`player_day_drop_cache` единственным источником правды** для Drop за бизнес-день. Фронт перестаёт делать любую арифметику Drop — только читает строки из кэша. Это гарантирует инвариант:
```
Σ player_day_drop_cache.peak (по игрокам за день, casino) ==
Σ table_day_drop_cache.drop_r_share (по столам за день, casino)
```
То есть Players и Dashboard физически не смогут разойтись.

## Что меняется

1. **Хуки** (`src/hooks/use-drop-split.ts`)
   - `usePlayersDropCacheToday(businessDate)` — `SELECT player_id, peak, recycled FROM player_day_drop_cache WHERE casino_id=? AND business_date=?`. `staleTime: 5s`, `refetchInterval: 20s` (страховка от потерянных realtime-событий).
   - `usePlayersDropCacheRange(fromDate, toDate)` — то же с `BETWEEN`, суммируется на клиенте (sum-of-daily-peaks).
   - Существующие RPC-хуки остаются как fallback для исторических периодов.

2. **Realtime** (`src/hooks/use-realtime.ts`)
   - Подписка на `player_day_drop_cache` с фильтром `casino_id=eq.${casinoId}`, инвалидация `["players-drop-cache-today"]` и `["players-drop-cache-range"]`.
   - Миграция: `REPLICA IDENTITY FULL` + `ALTER PUBLICATION supabase_realtime ADD TABLE` (уже выполнена).

3. **`src/pages/Tables.tsx`**
   - Удалить локальный `playerSplitsForSeated` (NEP-walk по 200 транзакциям).
   - Брать `dropR`/`cashout` игрока из `usePlayersDropCacheToday(effectiveDate)` + сумма `out` из текущего списка транзакций для `result`.

4. **`src/pages/PlayerStatistics.tsx`**
   - Заменить `usePlayersDropSplit` на `usePlayersDropCacheRange(fromDate, toDate)`.
   - Убрать «уточнение» Drop через `playerInDropSum` поверх RPC — итог по игроку = ровно значение из кэша.
   - Per-visit отображение оставить как пропорциональную разбивку дневного peak; итог по игроку гарантированно совпадает с Dashboard.

5. **`src/components/player/PlayerPreviewHeader.tsx`**
   - Для одного бизнес-дня — `usePlayersDropCacheToday`. Для произвольного окна — текущий RPC.

## Эффект
- Players, Tables и Dashboard читают одни и те же строки → ночные расхождения исключены по построению.
- Никакой фронтовой арифметики Drop, никаких лимитов 200 транзакций.
- Обновления мгновенные через realtime + 20s polling fallback.
- RPC остаются для исторических периодов.

## Файлы
- `src/hooks/use-drop-split.ts`
- `src/hooks/use-realtime.ts`
- `src/pages/Tables.tsx`
- `src/pages/PlayerStatistics.tsx`
- `src/components/player/PlayerPreviewHeader.tsx`
- Миграция: publication + `REPLICA IDENTITY FULL` для `player_day_drop_cache` (готово)
