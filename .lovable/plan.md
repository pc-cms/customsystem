## Что нашёл

Правило проекта: `Total Drop = SUM(peak) из player_day_drop_cache по business_date`. Прошёлся по всем отчётам в `src/pages/Reports.tsx` и связанным RPC. Итог:

| Отчёт | Источник Drop | Соответствие правилу |
|---|---|---|
| Reports → **Tables (Live)** | `player_day_drop_cache` по `business_date` | OK |
| Reports → **Player** | `player_day_drop_cache` по `business_date` | OK по Drop |
| Reports → **Groups** | `player_day_drop_cache` по `business_date` | OK по Drop |
| Reports → **Daily Diff** | RPC `compute_daily_diff` → `compute_tables_drop_split(win_from, win_to)` по `transactions.created_at` в окне **13:00–05:00** | **НЕ OK** — это по факту «cash in по окну», а не Drop по бизнес-дню |
| TableResults, Dashboard, ShiftClosingReport | `player_day_drop_cache` | OK |

Дополнительные несоответствия по бизнес-дню (не Drop, но связаны):
- Reports → Player / Groups: **Cashout и Expenses** фильтруются по `created_at.split("T")[0]` (календарный день), а не по `business_date`. Ночные транзакции 00:00–07:00 попадают не в тот день.
- Reports → Daily Diff: `Player Result = cashout − cash_in` считается по тому же окну 13:00–05:00, а не по `business_date`.

## Основная проблема

`compute_daily_diff` строит Drop не из кэша, а из транзакций по искусственному окну 13:00–05:00 EAT. Это:
- игнорирует транзакции 07:00–13:00 бизнес-дня;
- по сути равно `cash_in` за окно, а не пик NEP (Drop R) из кэша;
- расходится с числами на Dashboard, Player Statistics, Table Results и в печатных отчётах смены.

## План правок

### 1. Переписать `public.compute_daily_diff` (миграция)

```text
для каждого бизнес-дня d в диапазоне:
  drop_r        := SUM(peak)  FROM player_day_drop_cache  WHERE casino_id=_c AND business_date=d
  cash_in       := SUM(amount) FROM transactions WHERE type IN('buy','in')     AND business_date=d AND cancelled_at IS NULL
  cashout       := SUM(amount) FROM transactions WHERE type IN('cashout','out') AND business_date=d AND cancelled_at IS NULL
  player_result := cashout - cash_in
  result, miss  := как сейчас (по shifts с business_date_of(opened_at)=d)
  tips          := как сейчас (уже по business_date)
```

Убрать переменные `win_from`, `win_to` и вызов `compute_tables_drop_split` из этой функции. Это выравнивает Daily Diff с единственным источником Drop и с Dashboard.

### 2. Reports → Player / Groups (`src/pages/Reports.tsx`)

Фильтр транзакций и расходов заменить с календарного дня на `business_date`:

```ts
const filteredTx  = transactions.filter(t => t.business_date >= from && t.business_date <= to);
const filteredExp = expenses.filter(e => e.business_date >= from && e.business_date <= to && e.approved);
```

Поле `business_date` уже есть в `transactions` и `expenses` (используется в RLS/триггерах и в других отчётах).

### 3. Проверка после правок

- Открыть Dashboard и Reports → Daily Diff за один и тот же день/период — Total Drop должен совпадать до копейки.
- Открыть Reports → Player и Player Statistics за тот же диапазон — Drop по игроку совпадает; Cashout больше не «сползает» на соседний день для ночных выплат.
- Запустить `bunx vitest run` (юнит-тесты бизнес-логики).

### Что не трогаем

- `src/lib/drop-source.ts`, `useTotalDrop`, TableResults, Dashboard, ShiftClosingReport, Cage, POS — там источник уже правильный.
- `compute_tables_drop_split` / `compute_players_drop_split` оставляем: они используются на страницах игрока/визитов с настоящим временным окном (визиты, посещения), не в дневных отчётах.
