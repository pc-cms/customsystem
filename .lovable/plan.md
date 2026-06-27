## Drop integrity: backfill + защита триггера + материализация

### Подтверждение формулы (важно)

Drop считается **walk по каждой транзакции в хронологическом порядке** (window function в PostgreSQL), а не суммой за день:

```
NEP = 0, peak = 0
для каждой tx (ORDER BY created_at, id):
   NEP += in_amt − out_amt
   peak = max(peak, NEP)     -- peak только растёт
Drop_day = peak
Recycled_day = total_in − peak
```

Проверено на примере `OUT 500 → IN 500 → IN 500 → OUT 500 → IN 50 → IN 50 → OUT 500 → OUT 500 → IN 1M → OUT 550`: Cash In = 1 001 100, **Drop = 999 100**. Sum-формула дала бы 0 — это было бы неверно.

Текущие RPC `compute_player_drop_split` / `compute_players_drop_split` / `compute_tables_drop_split` уже работают именно так. Формулу не трогаем.

### 9 случаев Drop=0

Уже показал тебе таблицей в чате. Все 9 — реальный carryover фишек с прошлого дня: NEP за весь день ни разу не вышел в плюс. Математически корректно. Backfill их не изменит.

### Шаг 1. Backfill 145 NULL business_date

```sql
UPDATE public.transactions
SET business_date = public.business_date_of(created_at)
WHERE business_date IS NULL;
```

→ 145 транзакций (~20.7M TZS) попадают в свои бизнес-дни и появляются в Drop отчётах.

### Шаг 2. Защита триггера

`tg_set_business_date BEFORE INSERT OR UPDATE OF created_at`: безусловно перезаписывать `NEW.business_date := business_date_of(NEW.created_at)` если NULL, независимо от источника (sync, офлайн, edge function).

### Шаг 3. Материализация Drop кэша (мгновенное отображение везде)

Сейчас 3 RPC при каждом запросе бегут window function по транзакциям — даёт задержку 200-800 мс на больших объёмах. Отсюда ощущение «Drop не появляется сразу».

Новая таблица:
```
public.player_day_drop_cache (
  player_id     uuid,
  business_date date,
  casino_id     uuid,
  total_in      numeric,
  peak          numeric,   -- Drop R за день (walk-формула)
  recycled      numeric,
  updated_at    timestamptz,
  PRIMARY KEY (player_id, business_date)
)
```

`AFTER INSERT/UPDATE/DELETE ON transactions FOR EACH ROW` триггер пересчитывает **только затронутый (player_id, business_date)** через ту же walk-формулу и upsert'ит. Цена записи — ≤50 строк одного дня одного игрока, микросекунды.

Аналогично `table_player_day_drop_cache(table_id, player_id, business_date, drop_r_share, recycled_share)` — пропорциональное разделение peak по IN на стол в день. Тот же триггер пересчитывает обе таблицы.

RPC переписываются на `SELECT SUM(peak), SUM(recycled) FROM player_day_drop_cache WHERE ...` — чтение с индекса, без window functions. Все 5 мест UI (Dashboard, Player Statistics, Tables, Player Card, TableTracker) читают **один и тот же кэш** — рассинхронов не будет.

Бэкфилл кэша один раз: `INSERT ... SELECT GROUP BY player_id, business_date`. ~10 сек на проде.

Дополнительно в `use-realtime.ts` подписаться на `player_day_drop_cache` — push-обновление UI при пересчёте.

### Что НЕ делаем

- Не меняем walk-формулу (уже корректна).
- Не делаем отдельную Drop Audit страницу (проблема решается системно).
- Не удаляем и не «корректируем» старые tx — только проставляем технический `business_date`.

### Технические шаги

1. **Миграция 1** — backfill 145 строк + обновлённый `tg_set_business_date`.
2. **Миграция 2** — таблицы кэша с GRANT/RLS/индексами, триггеры пересчёта, бэкфилл из существующих tx.
3. **Миграция 3** — переписать 3 RPC на чтение из кэша (API frontend'а не меняется).
4. **Frontend** — добавить realtime подписку на `player_day_drop_cache` в `use-realtime.ts`. Bump `1.3.422`.

### Ожидаемый эффект

- 20.7M TZS «пропавшего» Cash In появится в Drop отчётах прошлых дней.
- Показ Drop в любом UI — мгновенный (read с индекса вместо on-demand walk).
- Невозможно создать tx без `business_date` — триггер форсирует.
- Единый источник истины для Drop во всём приложении.

Подтверди — реализую.
