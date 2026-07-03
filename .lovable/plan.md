## Итоговая структура

```text
Admin
├── Casino Settings         (super_admin, manager)
├── Branding                (super_admin, manager — своё казино)
├── Users & Roles           (super_admin: все; manager: своё казино, без роли super_admin)
└── Cloud Management        (super_admin ONLY)
```

`HR Schedules` не создаём (это была моя лишняя вкладка). Убираем: Casinos, Casino Access, Peers, Working Hours, Tables, Float Management, Chip Colors, Finance Categories, Expense Categories, Role Defaults, Branding — как отдельные вкладки. Всё перегруппируется внутрь.

## Вкладки — состав

### 1. Casino Settings (sub-tabs)
- **Time Settings** — новый объединённый блок:
  - Tables Open, Shift Start, Shift End, Breaklist Lock (текущие поля)
  - **N shift start / D shift start** (новые, customizable, используются в rota и live)
  - **Cage close deadline, Manager override window** (новые)
- **Tables** — TableManagement
- **Float Management** — текущий FloatManagement
- **Chip Colors** — ChipColorSettings (переносим сюда — операционная настройка)
- **Chip Conservation Mode** — текущий ChipConservationModeCard

### 2. Branding (полностью per-casino, dynamic)
Одна страница с секциями:
- **Identity**: display_name, short_name (для меню), tagline, meta_title, meta_description
- **Logos**: main logo (light/dark), favicon, apple-touch-icon, PWA icons (192/512), OG image — все через Lovable Assets в storage bucket `casino-branding`
- **Colors**: primary / accent / background / palette
- **PWA**: manifest name, theme_color, background_color, display mode

Runtime-загрузка: `public/branding.js` перерабатываем в тонкий loader, который читает конфиг per-casino из БД (endpoint edge function `casino-branding` без auth, кешируется CDN). Favicon/manifest/apple-touch-icon подставляются динамически по hostname → casino → branding row.

### 3. Users & Roles (sub-tabs)
- **Users** — SmartTable: Name, Email, Casino, Roles (badges), Status, Last login, Created. Фильтры: casino, role, status, search. На казино-сабдомене видны только пользователи этого казино (убираем дубли). Клик по строке → редактор.
- **Role Defaults** — существующий RoleDefaultsEditor
- **Casino Access** — существующий CasinoAccessManagement (только super_admin видит этот sub-tab)

**Редактор пользователя (максимум):**
- Все модули из `src/lib/modules.ts`, сгруппированные по разделам сайдбара (Overview / Pit / Cashier / Reception / Finance / HR / Analytics / System)
- Кнопка **Apply role defaults** — заливает permissions из `role_module_defaults` по выбранным ролям
- **Per-user history horizon**: today / 7d / 30d / all (ось A из ACCESS-MATRIX)
- Manager не может назначить/снять роль `super_admin`

### 4. Cloud Management (super_admin only, sub-tabs)
- **Casinos** — существующий CasinoManagement (CRUD казино сети)
- **Servers & Peers** — переработанная страница управления серверами (см. ниже)
- **Snapshots** — существующий CloudSnapshotsPage

**Servers & Peers (максимум):**
- Таблица серверов: name / URL / casino / node_id (fingerprint) / status (Healthy | Syncing | Unreachable | Error | Duplicate | Paused | Snapshot required) / last contact / push+pull cursors / outbox / apply errors
- **Автодетект дублей**: одинаковый peer_url ИЛИ одинаковый peer_node_id ИЛИ несколько активных для одного casino → баннер "N duplicate records" + бейдж `Duplicate` в строках
- Actions per row: **Pause / Resume / Probe / Delete / Open**
- Кнопка **Cleanup duplicates** — авто-удаление старых без контакта (сохраняет самый свежий по last_seen)
- Индикатор **Replica Confidence**: Full copy likely / Catching up / Not verified / Broken (по outbox=0, cursor догнан, нет apply errors, свежий heartbeat, schema match)
- Ниже — существующие панели (Sync Exchange Log, Mirror Health, Apply Errors) как collapsible

## Что удаляем из UI
- Вкладки `Finance Categories`, `Expense Categories` — из TabsList в `Admin.tsx`, компоненты остаются на диске, данные в БД нетронуты.

## Технические детали

**Файлы:**
- `src/pages/Admin.tsx` — ужимаем до оболочки с 4 TabsTrigger + роль-гейтингом
- `src/pages/admin/CasinoSettingsPage.tsx` — новый, sub-tabs
- `src/pages/admin/BrandingPage.tsx` — новый, sub-tabs
- `src/pages/admin/UsersAndRolesPage.tsx` — новый, sub-tabs (Users через SmartTable + расширенный редактор)
- `src/pages/admin/CloudManagementPage.tsx` — новый, sub-tabs
- `src/components/admin/ServersAndPeersPanel.tsx` — новый (замена главного контента Peers)
- `src/components/admin/TimeSettingsPanel.tsx` — новый (расширяет текущий ScheduleSettings)
- Существующие панели (`RoleDefaultsEditor`, `PeerLinksPanel`, `SyncStatusPanel`, `MirrorHealthPanel`, `ChipColorSettings`, `BrandingSettings`, `FloatManagement`, `TableManagement`, `ChipConservationModeCard`, `CasinoManagement`, `CasinoAccessManagement`, `CloudSnapshotsPage`, `UsersTab`) — переиспользуем как строительные блоки.

**Миграции БД (одна миграция, с GRANT):**
- `casinos`: добавить `short_name`, `tagline`, `meta_title`, `meta_description`, `theme_color`, `background_color`, `pwa_display`, `n_shift_start`, `d_shift_start`, `cage_close_deadline`, `manager_override_window`
- `user_module_permissions`: добавить `history_horizon` enum (`today`/`7d`/`30d`/`all`), nullable — override role default
- Storage bucket `casino-branding` (public) для логотипов/иконок
- Edge function `casino-branding` (без auth) для runtime branding loader

**Роль-гейтинг:**
- Cloud Management + `Casino Access` sub-tab — `super_admin` only
- В редакторе пользователя: `manager` не может назначить/снять `super_admin` (проверка на клиенте + RLS на `user_roles`)
- На казино-сабдомене `useProfiles` фильтрует по `casino_id` для всех ролей, включая super_admin (убирает дубли)

## Фазы

**Phase 1 (этот заход):**
- Новая структура 4 вкладок + удаление 2 категорий из UI
- Casino Settings со всеми sub-tabs включая расширенный Time Settings (N/D shift, cage deadline, override window)
- Users & Roles: SmartTable + расширенный редактор с полной матрицей модулей и history_horizon и Apply role defaults
- Cloud Management с Servers & Peers (автодетект дублей, Cleanup, Replica Confidence)
- Миграция БД (поля в casinos + user_module_permissions.history_horizon)
- Bucket `casino-branding` создан
- Branding-страница: **UI + сохранение в БД + загрузка ассетов**. Runtime-подхват favicon/manifest/palette на сабдомене работает.

**Phase 2 (отдельный заход, если понадобится):**
- Полный аудит матрицы модулей на реальные страницы vs. `src/lib/modules.ts`
- Тонкая настройка `casino-branding` edge fn под кеш/CDN
- Миграция существующих статических манифестов из `public/manifest-*.json` в БД

## Как поймём, что стало хорошо
- 4 вкладки в админке вместо 13; каждая имеет осмысленные sub-tabs
- Finance/Expense Categories убраны
- Casino Settings содержит Time Settings с N/D shift, cage deadline, override window
- Branding — полноценный редактор per-casino: name, logo, favicon, PWA, palette. Меняешь favicon в UI → он реально меняется на сабдомене
- Users — таблица с фильтрами, без дублей, редактор со всеми модулями + horizon + Apply role defaults
- Cloud Management только у super_admin, Servers & Peers показывает дубли явно, кнопки Delete и Cleanup работают, Replica Confidence честно показывает состояние