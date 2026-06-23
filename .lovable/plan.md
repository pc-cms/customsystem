
# Архитектурная оптимизация: единая таблица + логи в БД + масштабирование

Цель — чтобы добавление новой роли или модуля **не добавляло работы UI** и не замедляло систему. Все таблицы — один компонент-функция, все логи — триггерами в БД, все агрегации — RPC.

---

## Часть 0. Зафиксировать 4 отложенные задачи в memory

Сохранить в `mem://tasks/` четыре отдельные карточки со статусом DEFERRED, чтобы не потерять:
- `tasks/virtualization-long-lists` (шаг 7) — Players/BankChecks/Expenses/CancelledTransactions
- `tasks/webp-thumbnails` (шаг 12) — миграция + бэкфилл фото
- `tasks/db-audit-triggers` (шаг 14) — 12 таблиц + чистка ~56 `logAction` в коде
- `tasks/aggregation-rpcs` (шаг 16) — 5 RPC для отчётов

Каждая карточка содержит риски, последовательность шагов и оценку. В `mem://index.md` добавить ссылки в раздел Pending Tasks.

---

## Часть 1. Единый шаблон таблиц — `<SmartTable>` (config-driven)

### Проблема
Сейчас в коде сосуществуют:
- `DataTable + DTHead/DTBody/DTRow/DTCell` (унифицированный шаблон) — используется частично,
- кастомные `<table>` в `Guests.tsx`, `BankChecks.tsx`, `Expenses.tsx`, `CancelledTransactions.tsx`, `Logs.tsx`, во всех POS-страницах,
- разные реализации сортировки, фильтра, sticky-колонок, inline-edit, пустого состояния.

Каждая новая страница = ещё одна копия логики → растёт bundle, тормозит ререндер, виртуализацию приходится прикручивать 4 раза.

### Решение: один компонент `SmartTable<T>`

`src/components/ui/smart-table.tsx` — обёртка над существующим `DataTable`, принимающая декларативный конфиг колонок и данные. Никаких HOC, только props.

```ts
type ColumnDef<T> = {
  key: string;
  header: string;
  type: ColType;                          // переиспользуем из data-table.tsx
  accessor: (row: T) => React.ReactNode;
  sortValue?: (row: T) => string | number;
  width?: number;
  sticky?: boolean;
  hidden?: (ctx: TableCtx) => boolean;    // role/permission-aware
};

type SmartTableProps<T> = {
  data: T[];
  columns: ColumnDef<T>[];
  rowKey: (row: T) => string;
  sort?: { key: string; dir: "asc" | "desc" };
  onSortChange?: (s) => void;
  empty?: React.ReactNode;
  virtual?: boolean;                      // вкл. @tanstack/react-virtual автоматически если data.length > 200
  density?: "comfort" | "compact" | "grid";
  stickyFirstColumn?: boolean;
};
```

Внутри:
- header клик → сортировка (один общий механизм, мемоизированный),
- виртуализация включается **автоматически** при `data.length > 200` → решает шаг 7 одним движением для всех 4 страниц одновременно,
- `React.memo` на строках + стабильный `rowKey` → нулевой ререндер невидимых строк,
- `hidden(ctx)` использует `useMyEffectivePerms()` → колонки, недоступные роли, не маунтятся вовсе (Cashier не парсит финансовые ячейки),
- пустое состояние, скелетон, sticky-колонка, печать — встроены.

### Миграция страниц (постепенно, без визуальных регрессий)
1. Players (`Guests.tsx`)
2. `BankChecks.tsx`
3. `Expenses.tsx` (через `ExpensesRouter`)
4. `CancelledTransactions.tsx`
5. `Logs.tsx`
6. POS-отчёты (после стабилизации)

Каждая страница → ~30-50 строк конфига вместо 200-400 строк JSX. Виртуализация и sticky достаются бесплатно. Новая страница = 1 конфиг.

---

## Часть 2. Логи action — перенос с UI в БД (шаг 14, расширенный план)

### Проблема
Сейчас `src/lib/logging.ts::logAction()` вызывается из ~56 мест клиента. Каждый вызов — лишний round-trip, лишний рендер, лишняя точка отказа (offline → лог потерян). Когда добавляем роль/модуль — нужно помнить везде проставить `logAction(...)`.

### Решение: триггеры в БД + retention

#### 2.1 Триггерная функция
Одна универсальная функция `public.tg_activity_log()`:
```sql
CREATE FUNCTION public.tg_activity_log() RETURNS trigger ...
  -- читает casino_id из NEW/OLD (TG_ARGV[0] = имя колонки)
  -- category/action = TG_ARGV[1], TG_ARGV[2]
  -- details = jsonb_diff(OLD, NEW) — только реально изменённые поля
  -- operator_id = current_setting('request.jwt.claim.sub', true)
```

#### 2.2 Целевые таблицы (12 шт.)
`transactions`, `cage_transfers`, `cage_slots_transfers`, `chip_snapshots`, `chip_emissions`, `expenses`, `bank_checks`, `player_chip_adjustments`, `shifts`, `cage_slots_shifts`, `players` (status/blacklist), `player_tags`.

Каждая получает 1-2 строки:
```sql
CREATE TRIGGER trg_log AFTER INSERT OR UPDATE OR DELETE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.tg_activity_log('casino_id','transaction','tx');
```

#### 2.3 Чистка клиента
- Убрать ~56 вызовов `logAction(...)` после того как соответствующий триггер заработал (по одной таблице за раз, проверяя что нет дублей в `activity_logs`).
- `src/lib/logging.ts` оставить только для категорий, которые **не имеют** транзакционного эквивалента (UI-события типа "пользователь открыл модалку" — но мы такое и не логируем).

#### 2.4 Retention (масштабирование)
- Партицирование `activity_logs` по месяцам (или cron `move-to-archive` для строк старше 60 дней → `activity_logs_archive`, который уже есть).
- BRIN-индекс по `created_at`.
- Cron `purge-archive` для записей старше 365 дней.

#### 2.5 Эффект
- UI больше **никогда** не блокируется на лог.
- Новая таблица в системе = 1 строка `CREATE TRIGGER`, никаких правок в React.
- Логи не теряются при offline — пишутся при applied транзакции синка.
- Bundle минус ~3 KB и минус 56 точек ошибок.

---

## Часть 3. Архитектурные правила для масштабирования

Закрепить в `mem://core` (Core rules) как обязательные при создании любой новой страницы/роли:

1. **Таблицы** — только `<SmartTable>` с конфигом колонок. Запрещены ручные `<table>`/`DataTable+DTBody` в новом коде.
2. **Логирование** — только триггерами БД. `logAction()` в новом коде запрещён.
3. **Агрегации** (дашборды, отчёты) — только через RPC (`fin_dashboard_kpis`, `dashboard_table_results`, `fin_monthly_report`, `player_economy`, `attendance_monthly`) — это шаг 16, остаётся в отложенных, но правило вводим сейчас, чтобы новые отчёты сразу шли правильным путём.
4. **Permission-gated колонки/секции** — через `hidden(ctx)` в конфиге, а не условные импорты компонентов. Роль не платит за чужой код.
5. **Префетч** — только через `pathLoaders` + `modulePrefetchTasks`, фильтруемые по `allowedModules`. Уже сделано (шаги 3/15).
6. **Виртуализация** — автоматическая в `SmartTable` при > 200 строк. Ручная не нужна.

---

## Что делать прямо сейчас (после approve)

1. **Часть 0** — записать 4 задачи и обновить `mem://index.md` (5 мин).
2. **Часть 1, фаза 1** — создать `src/components/ui/smart-table.tsx` + типы + автовиртуализация (через `@tanstack/react-virtual`, добавить зависимость). Не трогать страницы.
3. **Часть 1, фаза 2** — мигрировать `Guests.tsx` как первый эталон (страница с самой большой жалобой на скорость). Сравнить визуально с текущей.
4. **Часть 3** — записать 6 правил в `mem://core`.
5. **Часть 2 откладываем** в одну атомарную сессию (миграция + чистка клиента + версионный бамп) — это шаг 14, требует отдельного approve, потому что миграция большая.

После фазы 4 возвращаемся: либо доводим миграцию страниц на `SmartTable` (Bank/Expenses/Cancelled/Logs), либо запускаем «Часть 2».

---

## Технические детали

- **Зависимость:** `@tanstack/react-virtual` (~3 KB gz) — нужна только для авто-виртуализации внутри `SmartTable`.
- **Backward compat:** старый `DataTable`/`DTBody` остаётся для уже мигрированных страниц; `SmartTable` строится поверх него и переиспользует тот же CSS и `ColType` — визуально 1-в-1.
- **Тесты:** для `SmartTable` — один vitest c snapshot+sort+virtual-threshold; миграция страниц проверяется ручным smoke на `/guests` и `/bank-checks`.
- **Версия:** Часть 2 (триггеры) — backend change → авто-бамп patch версии. Часть 1/3 — фронт + memory, без бампа.
