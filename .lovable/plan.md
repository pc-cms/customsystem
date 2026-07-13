# План: роль Boss + Multi-Casino TV Dashboard + Игорь

## 1. Роль `boss`

- Добавить `boss` в enum `app_role`.
- Скопировать модули от `manager` в `role_module_defaults` для `boss`, плюс включить `finance_summary` (Monthly Report) и `finance_budget` (Budget).
- `src/lib/role-access.ts`: `boss` → `financial_scope = "all"`, label «Boss», приоритет сразу под `super_admin`.
- Добавить `boss` во все места, где сейчас перечисляются `manager` / `finance_manager` для доступа к финансам и админ-областям.
- Пользователь потом сам отключит лишнее через Permission Matrix.

## 2. Multi-Casino TV Dashboard (главное)

Отдельная страница `/boss-dashboard`, видима только `boss` и `super_admin`. Обычный `/` не трогаем.

### Визуальный уровень — «million dollar»
- Полностью тёмная сцена под 75" ТВ: глубокий near-black фон, тонкий градиент, мягкое свечение вокруг ключевых цифр.
- Огромные цифры моношрифтом (tabular-nums), фиксированная сетка — цифры не «прыгают» при обновлении.
- Каждое казино — своим цветом-акцентом (существующая палитра казино), тонкая цветная полоса слева/сверху блока.
- Плавные переходы значений (count-up при изменении), мягкий «pulse» на обновлении.
- Пробел как разделитель тысяч, `cms-amount-positive` / `cms-amount-negative` для знака.

### Переключатель разрешения (в шапке)
- Кнопка **FHD (1920×1080)** / **4K (3840×2160)** — просто масштабирует базовый font-size корневого контейнера (CSS-переменная `--tv-scale`), чтобы одна и та же вёрстка одинаково хорошо читалась на обоих разрешениях 75".
- Выбор сохраняется в `localStorage`.

### Переключатель раскладки (в шапке)
- **Rows** (горизонтальные полосы, по казино на строку) — дефолт, лучше для 75" ТВ.
- **Columns** (казино = колонка) — альтернатива.

### Селектор казино
- Мультивыбор из `accessibleCasinos` (у Игоря — все 4). Порядок и набор сохраняются в `localStorage`.

### Данные по каждому выбранному казино (текущий business day, 07:00 EAT rollover)

Три группы метрик на казино:

**TOTAL** (сумма Live + Slots)
- Total Drop
- Total Result
- Hold %  ← «пол процента на текущий момент» = Result / Drop × 100
- Head Count (всего активных игроков в казино сейчас)

**LIVE GAME**
- Drop · Result · Hold % · Head Count (столы)

**SLOTS**
- Drop · Result · Hold % · Head Count (слоты)

Источники: `player_day_drop_cache` (Total Drop — по правилу из core memory), `chip_snapshots_latest` RPC (Result по столам), существующие хуки для slots и head count.

### Раскладка «Rows» — пример на 1 казино
```text
┌─ ARUSHA ─────────────────────────────────────────────────────────┐
│ TOTAL   Drop  12 500 000    Result  +1 200 000    Hold 9.6%   HC 42 │
│ LIVE    Drop   8 000 000    Result    +900 000    Hold 11%    HC 28 │
│ SLOTS   Drop   4 500 000    Result    +300 000    Hold 7%     HC 14 │
└──────────────────────────────────────────────────────────────────┘
```

### Раскладка «Columns» — казино в колонках, метрики построчно
```text
┌──────────┬──────────┬──────────┬──────────┐
│ ARUSHA   │ MWANZA   │ DODOMA   │ MBEYA    │
│ TOTAL …  │ TOTAL …  │ TOTAL …  │ TOTAL …  │
│ LIVE …   │ LIVE …   │ LIVE …   │ LIVE …   │
│ SLOTS …  │ SLOTS …  │ SLOTS …  │ SLOTS …  │
└──────────┴──────────┴──────────┴──────────┘
```

### Нижние секции

**Top 5 Players by Drop today — по каждому казино отдельно**
- Для каждого выбранного казино своя мини-таблица: Rank · Имя · Drop.
- Данные из `player_day_drop_cache` (peak за день) join `players`, top 5 в рамках `casino_id`.
- Компоновка: горизонтальный ряд карточек «топ‑5 по казино N» — по одной на каждое выбранное казино.

**New Players today — общий блок по всем выбранным казино**
- Игроки с `visits_count ≤ 3`, у которых есть визит сегодня.
- Показываем: имя, казино (цветной чип), число визитов.
- Одна общая карточка, широкая, во всю ширину экрана.

**MTD — Total месяц (внизу страницы)**
- По каждому выбранному казино: Total Drop / Total Result / Hold % с 1-го числа месяца по сегодня.
- Плюс сводная строка «All selected» — сумма по выбранным казино.
- Тот же визуальный стиль: крупные цифры, моно, цветной акцент казино.

### Автообновление
- Раз в 10 сек, тихое (без спиннеров), с count-up на изменившихся значениях.

## 3. Пользователь Игорь

- Login: `igor`, password: `Igor26!`, display_name: `Igor`, role: `boss`.
- Доступ ко всем 4 казино через `user_casino_access`.
- Создание через существующий edge function `create-user` после применения миграции роли.

## 4. Технические детали

- Миграция: `ALTER TYPE app_role ADD VALUE 'boss'`; insert в `role_module_defaults` копией `manager` + `finance_summary`, `finance_budget`, новый `boss_dashboard`.
- Роут `/boss-dashboard` в `src/App.tsx`, гейт по роли.
- Новые файлы:
  - `src/pages/BossDashboard.tsx` — контейнер, шапка (FHD/4K, Rows/Columns, выбор казино).
  - `src/components/boss/BossCasinoRow.tsx`, `BossCasinoColumn.tsx` — блок казино в двух раскладках.
  - `src/components/boss/BossTopPlayers.tsx` — топ-5 на казино.
  - `src/components/boss/BossNewPlayers.tsx` — общий блок new players.
  - `src/components/boss/BossMtdSummary.tsx` — MTD-сводка.
  - `src/components/boss/CountUpNumber.tsx` — крупные цифры с плавной анимацией.
- Новый хук `use-boss-dashboard.ts` — параллельные запросы по `casinoId[]`, объединение.
- CSS: секция `.tv-scene` в `index.css` с переменной `--tv-scale` (1 для FHD, 2 для 4K), глубокий фон, glow-акценты — всё через семантические токены, никаких хардкод-цветов.
- Ссылка в сайдбаре только для `boss`/`super_admin` («Boss TV»).

Готов реализовать — подтвердите план, и приступаю.
