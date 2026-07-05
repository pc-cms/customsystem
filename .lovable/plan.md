
# Player Merge Duplicates — финальный план

## Стратегия (согласовано)
- **Survivor**: один существующий игрок остаётся, остальные → `status='merged'`.
- **Права**: super_admin, manager, shift_manager.
- **Поля/карты/id_number**: мастер выбирает вручную в Wizard.
- **Undo**: обратимо в течение 30 дней через snapshot.
- **UX**: отдельная страница `/admin/merge-players` с поиском и корзиной. Корзина личная (sessionStorage).
- **Помощь**: автоматические группы "possible duplicates".

## Страница `/admin/merge-players`

Layout — двухколоночный, desktop-first (менеджеры сидят за ПК):

```text
┌────────────────────────────────────┬──────────────────────────┐
│  Search & suggestions              │  Merge basket (sticky)   │
│  ─────────────────────             │  ─────────────────       │
│  [Tab: Suggested duplicates]       │  ○ John Doe   #A123      │
│  [Tab: Manual search]              │  ○ Jon Doe    #A124      │
│                                    │  ○ J. Doe     #A125      │
│  Suggested tab:                    │                          │
│    Group #1  [+ Add all 3]         │  [Clear] [Merge 3]       │
│      • John Doe   photo phone last │                          │
│      • Jon Doe    photo phone last │                          │
│      • J. Doe     photo phone last │                          │
│    Group #2  [+ Add all 2]  ...    │                          │
│                                    │                          │
│  Manual search tab:                │                          │
│    [🔍 name / id_number / phone /  │                          │
│     card #] debounced 250ms        │                          │
│    Table rows with [+ Add] button  │                          │
│    Filter chips: casino, category, │                          │
│    registered date range           │                          │
└────────────────────────────────────┴──────────────────────────┘
```

- Кнопка "+ Add" в каждой строке кладёт игрока в корзину; повторный клик → "✓ In basket" / удаляет.
- Корзина — sticky карточка справа, показывает avatar+имя+id_number+casino каждого выбранного, счётчик "3 / 5" (максимум 5). Клик по строке — убирает.
- Пока в корзине <2 или >5 — кнопка Merge disabled с подсказкой.
- Корзина сохраняется в `sessionStorage` под ключом `merge-basket-v1` (массив player_id) — переживает переходы по страницам, теряется с закрытием вкладки.
- Кнопка **Merge N players** открывает Wizard-диалог.

### Tab: Suggested duplicates
- RPC `find_duplicate_groups(_casino_id uuid, _limit int)` возвращает массив групп размером 2–8, соединённых хотя бы одним из критериев:
  - совпадение `id_number` (точное, cross-casino),
  - совпадение `phone` (нормализованное),
  - Dice similarity полного имени ≥0.85,
  - `dob` совпадает + Dice имени ≥0.7.
- В группе показываем avatar, полное имя (highlight отличий), id_number, phone, casino, дату регистрации, кол-во визитов, статус (BL badge).
- Кнопка "+ Add all N" одним кликом кладёт всю группу (но не больше 5, лишние подсвечиваются).
- Кнопка "Dismiss group" (только super_admin) — прячет группу на 30 дней (таблица `merge_group_dismissed`, ключ = отсортированный массив player_id).

### Tab: Manual search
- Инпут ищет по first_name/last_name/nickname (ilike), `id_number`, `phone`, `player_cards.card_number` — debounced 250ms, лимит 50 результатов.
- Показывает те же колонки + кнопка [+ Add].
- Filter chips: casino, category (N/S/G/P/D), диапазон даты регистрации.

## Merge Wizard (3 шага)

1. **Compare** — таблица N колонок (по игроку), N строк (photo, first_name, last_name, nickname, id_number, phone, email, dob, category, player_type, tags). Каждая строка = радиокнопки, по умолчанию выделено значение самого раннего по `created_at` профиля (или самое заполненное, если у раннего пусто). Photo и id_number/карты явно выделены (это ключевые поля).
2. **Preview** — сводка: `12 visits, 34 transactions, 5 expenses, 3 cards, 2 notes, 4 tags → survivor`. Предупреждения: конфликты (club_account у нескольких, blacklist у одного → survivor будет BL).
3. **Confirm** — обязательное поле `reason` (текст ≥10 символов) + чекбокс "I understand this action can be undone within 30 days" + повторный ввод фамилии survivor'а для защиты от опечаток. Кнопка Merge.

После — toast "Merged 3 players into John Doe" со ссылками "Open profile" и "Undo".

## База данных

Миграция `<ts>_player_merge.sql`:

```sql
-- players
ALTER TABLE players ADD COLUMN merged_into_id uuid REFERENCES players(id);
ALTER TABLE players ADD COLUMN merged_at timestamptz;
ALTER TABLE players ADD COLUMN merged_by uuid;
-- расширяем допустимые status на 'merged' (валидация через триггер/CHECK)

-- history
CREATE TABLE public.player_merges (
  id uuid PK default gen_random_uuid(),
  survivor_id uuid NOT NULL REFERENCES players(id),
  loser_ids uuid[] NOT NULL,
  casino_id uuid,
  reason text NOT NULL,
  field_choices jsonb NOT NULL,        -- {first_name: <player_id>, id_number: <player_id>, ...}
  survivor_snapshot jsonb NOT NULL,    -- полное состояние survivor ДО
  loser_snapshots jsonb NOT NULL,      -- [{player_id, row}, ...]
  migrations jsonb NOT NULL,           -- [{table, id, from_player_id}, ...] — для undo
  affected_counts jsonb NOT NULL,
  performed_by uuid,
  performed_at timestamptz default now(),
  undone_at timestamptz,
  undone_by uuid
);
GRANT SELECT, INSERT, UPDATE ON public.player_merges TO authenticated;
GRANT ALL ON public.player_merges TO service_role;
ALTER TABLE public.player_merges ENABLE ROW LEVEL SECURITY;
-- policy: read/write только has_role(super_admin|manager|shift_manager)

-- suggested dismissals
CREATE TABLE public.merge_group_dismissed (
  id uuid PK,
  player_ids uuid[] NOT NULL,          -- отсортированный
  dismissed_by uuid,
  dismissed_at timestamptz default now(),
  expires_at timestamptz NOT NULL
);
-- GRANT/RLS аналогично
```

RPC:
- `find_duplicate_groups(_casino_id uuid) returns setof jsonb` — SECURITY DEFINER, отдаёт список групп с уже склеенными критериями (исключает merged и dismissed).
- `merge_players(_survivor_id uuid, _loser_ids uuid[], _field_choices jsonb, _reason text) returns uuid` — как описано ранее: проверка ролей → snapshots → апдейт survivor'а по `field_choices` → миграция строк из 36 таблиц с `player_id` (список из information_schema) с записью `(table, id, from_player_id)` в `migrations` → пометка losers как `merged` → activity_logs через триггер.
  - `player_tags`: insert on conflict do nothing.
  - `player_cards`: перевешиваются все.
  - `club_accounts`: при конфликте → raise.
  - blacklist "заразен": если хоть один loser=blacklist, survivor.status ← blacklist.
- `undo_player_merge(_merge_id uuid) returns void` — проверка 30 дней и роли → пробегает `migrations` в обратном порядке и возвращает каждую строку исходному владельцу → восстанавливает losers из snapshot → отмечает undone.

## Клиентские файлы

### Новые
- `src/pages/admin/MergePlayersPage.tsx` — двухколоночный экран, табы, корзина.
- `src/components/merge/DuplicateSuggestions.tsx` — RPC + группы.
- `src/components/merge/ManualSearch.tsx` — поиск + фильтры.
- `src/components/merge/MergeBasket.tsx` — sticky корзина, sessionStorage-хук.
- `src/components/merge/MergeWizard.tsx` + `MergeCompareStep.tsx` + `MergePreviewStep.tsx` + `MergeConfirmStep.tsx`.
- `src/components/merge/MergedBanner.tsx` — баннер на профиле loser'а ("Merged into …") и survivor'а ("Merged from N accounts").
- `src/hooks/use-merge-basket.ts` — sessionStorage-based store (без Zustand, простой event bus).
- `src/hooks/use-merge-players.ts` — обёртки над RPC + инвалидации (`players`, `casino-visits-live`, `player-economy*`, `transactions`, `player-groups`).
- `src/hooks/use-duplicate-groups.ts` — обёртка над `find_duplicate_groups`.

### Правки
- `src/pages/Admin.tsx` (или роутер) — добавить пункт меню "Merge duplicates" (gate по роли) и route `/admin/merge-players`.
- `src/hooks/use-players.ts` — везде фильтровать `.neq("status", "merged")`.
- `src/hooks/use-duplicate-check.ts` — исключить merged.
- `src/pages/PlayerProfile.tsx` — `<MergedBanner />` + история merge + кнопка Undo (доступна ≤30 дней).
- `package.json` — bump `1.3.434 → 1.3.435`.

## Ограничения
- Merge не более 5 losers за операцию.
- Undo только пока `undone_at IS NULL` и ≤30 дней.
- Club account конфликт → merge отклоняется явной ошибкой.
- Все действия пишутся в `activity_logs` через DB триггер (per core rule — никаких `logAction()` из UI).
- SmartTable для всех новых списков (per core rule).
