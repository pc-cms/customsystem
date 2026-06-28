## Унификация Drop по всему приложению на peak-NEP per business day

Все 5 оставшихся мест переводим на одну формулу: **Drop = сумма дневных peak-NEP за бизнес-день** (то же, что считают триггеры в `player_day_drop_cache`). Никакого lifetime-NEP, никакого "Σ buy/in", никакого 200-row окна.

---

### 1. ActivePlayers (Pit Floor Map)
**Файл:** `src/components/pit/ActivePlayers.tsx`

- Убрать локальный NEP-walk `playerSplits` (строки 193-217).
- Подключить `usePlayersDropCacheToday(today)` из `use-drop-split.ts`.
- Для `result` нужен ещё cashout сегодня → добавить мемо `playerCashoutToday` (Σ `out`/`cashout` из уже загруженного `transactions` за бизнес-день — это локально и корректно, потому что cashout не зависит от формулы).
- `sp.dropR = cache[pid]?.dropR ?? 0`, `sp.result = dropR − cashoutToday`.

Результат: цифры на Floor Map = Player Statistics = Dashboard, мгновенно через realtime + 20s polling.

---

### 2. Reports → Players / Groups / Total tabs
**Файл:** `src/pages/Reports.tsx` (строки ~524, 658, 751)

- Players tab: заменить `Σ transactions.amount where type∈(buy,in)` на `compute_players_drop_split(casino_id, from, to)` (RPC уже существует, использует те же бизнес-дни).
- Groups tab: агрегировать те же RPC-результаты по `group_id`.
- Total tab: Σ по результатам RPC.
- Tables tab уже корректен — не трогаем.

Результат: Period Drop в Reports = сумма по Tables tab = Player Statistics.

---

### 3. PlayerProfile + PlayerVisitsBreakdown (per-visit Drop)
**Файлы:** `src/pages/PlayerProfile.tsx` (131-200), `src/components/player/PlayerVisitsBreakdown.tsx` (88-130)

Требование пользователя: **в профайле берём СУММУ БИЗНЕС-ДНЕЙ, а не lifetime-NEP**.

- Удалить локальный lifetime NEP-walk.
- Для каждого визита (= один бизнес-день) брать запись из `player_day_drop_cache` по `(player_id, business_date)`: `dropR = peak`, `recycled = total_in − peak`.
- Lifetime totals = Σ всех `peak` из кэша по игроку (один SELECT с агрегатом).
- Добавить hook `usePlayerDropCacheByDays(playerId)` в `use-drop-split.ts`: возвращает Map<business_date, {peak, recycled, total_in}>.

Результат: цифры в карточке игрока = Player Statistics за тот же период, и можно открывать любой бизнес-день.

---

### 4. ShiftClosingReport (печатная форма)
**Файл:** `src/components/cage/ShiftClosingReport.tsx` (230, 348)

- Текущая логика: `DROP (NEP) = Σ Cash Desk IN per shift` — это raw Σ in, неправильно.
- Меняем на **peak-NEP per shift**: внутри окна смены walk транзакций по столам, считаем peak. (Смена ≠ бизнес-день, поэтому кэш не подходит — нужен walk на лету, но по той же формуле что и в `nep-split.ts`.)
- Использовать `splitTablesWindow(txs, shiftStart, shiftEnd)` из `src/lib/nep-split.ts` — она уже реализует ту же peak-NEP логику.
- Miss Chips sign — уже починен ранее, не трогаем.

Результат: печатные смены показывают тот же Drop, что и live-вьюхи (только разрезанный по сменам, не по бизнес-дню).

---

### Технические детали

- Новый hook `usePlayerDropCacheByDays(playerId)` — SELECT из `player_day_drop_cache` по `player_id`, без `business_date` фильтра. Polling 20s + realtime подписка на `player_day_drop_cache` (уже добавлена в `use-realtime.ts`).
- RPC `compute_players_drop_split` — уже существует и используется в `usePlayersDropSplit`; для Reports просто переиспользуем его (как fallback / источник для исторических периодов, где кэш может быть неполный).
- Кэш `player_day_drop_cache` поддерживается триггерами при INSERT/UPDATE/DELETE/CANCEL транзакций — данные не разъедутся.
- Для исторических дней до момента когда кэш появился — добавить backfill в migration: `INSERT INTO player_day_drop_cache SELECT ... FROM compute_players_drop_split` по всем казино/датам где есть транзакции, но строки в кэше нет.

### Файлы, которые будут изменены
- `src/components/pit/ActivePlayers.tsx`
- `src/pages/Reports.tsx`
- `src/pages/PlayerProfile.tsx`
- `src/components/player/PlayerVisitsBreakdown.tsx`
- `src/components/cage/ShiftClosingReport.tsx`
- `src/hooks/use-drop-split.ts` (новый hook `usePlayerDropCacheByDays`)
- Migration: backfill `player_day_drop_cache` для исторических бизнес-дней.
