
# Drop R / Drop V — переход на per-day peak NEP

## Новая формула (единая для всех экранов)

Для каждой пары `(player, business_day)`:

1. Стартуем `NEP_day = 0`, `peak_day = 0`, `total_in_day = 0`.
2. Идём по транзакциям дня по времени (cancelled игнорируем):
   - `in` / `buy`: `NEP_day += amount`; `peak_day = max(peak_day, NEP_day)`; `total_in_day += amount`.
   - `out` / `cashout`: `NEP_day -= amount`.
3. По итогам дня:
   - `Drop R (External) = peak_day`
   - `Drop V (Recycled) = total_in_day − peak_day`
4. **Lifetime / period** = сумма дневных `Drop R` и `Drop V` по всем дням внутри окна. История за пределами окна НЕ влияет.

**Per-table split (один peak на игрока в день, разбивка пропорциональна IN по столам):**
- Считаем `in_by_table[t]` за день.
- `dropR_table[t] = peak_day × in_by_table[t] / total_in_day`
- `dropV_table[t] = (total_in_day − peak_day) × in_by_table[t] / total_in_day`
- Остаток от округления добивается в стол с максимальным IN.

Проверка на Леме (Arusha, 13.06.2026): `peak_day = 875 000`, `total_in_day = 1 245 000` → Drop R = 875k, Drop V = 370k. ✅

## Затрагиваемые поверхности

**DB (миграция):**
- `compute_player_drop_split(player_id, from, to)` — переписать на per-day peak, суммировать по дням внутри `[from, to]`.
- `compute_players_drop_split(casino_id, from, to)` — то же, итог по каждому игроку.
- `compute_tables_drop_split(casino_id, from, to)` — пропорциональная разбивка peak-day по столам.
- `player_drop_split_lifetime(player_id)` (если используется в `player_economy`-вью) — переписать как сумма всех `peak_day` игрока. Обновить вьюшку `player_economy`.
- Бизнес-день определяем через существующую `business_date_of(created_at)` (07:00 EAT rollover) — уже есть в БД.
- День попадает в окно `[from, to]`, если граница дня (07:00 EAT начала) лежит в окне; границы — как сейчас в RPC.

**Frontend:**
- `src/lib/nep-split.ts` — переписать `splitPlayerWindow` / `splitPlayersWindow` / `splitTablesWindow` по новому правилу. Сигнатуры и возвращаемые типы сохраняем.
- `src/hooks/use-drop-split.ts` — без изменений (только дергает RPC).
- Все потребители (`PlayerProfile`, `PlayerStatistics`, `Tables`, `Dashboard`, `Reports`, `ActivePlayers`, `TableSeatingDialog`, `SeatedPlayerChip`, `PlayerPreviewHeader`, `PlayerVisitsBreakdown`, `PlayerNameAutocomplete`, `PlayerSearch`) — без правок, они уже читают из RPC/хелперов.

**Memory:**
- Обновить `mem://features/nep-split` — новая формула, per-day reset, peak-NEP.

**Версия:** auto-bump patch в `package.json` (backend change).

## Что НЕ меняется

- `NepTx` тип, имена RPC, имена полей результата (`drop_r` / `drop_recycled`).
- Cancelled (`cancelled_at IS NOT NULL`) полностью игнорируются (как сейчас).
- Tracker / Chip Count / shifts.tables_result — не трогаем.

## Sanity-чеки после миграции

- Лема Arusha сегодня → Drop R = 875 000, Drop V = 370 000.
- Любой игрок без cashout-ов → Drop R = total IN, Drop V = 0.
- Игрок с одним buy-in 100k и без выдач → Drop R = 100k.
- Игрок, который зашёл 100k, выдали 50k, зашёл ещё 30k → peak = 100k, total_in = 130k → Drop R = 100k, Drop V = 30k.

Готов к реализации.
