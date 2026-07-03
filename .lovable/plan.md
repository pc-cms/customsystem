
# План: чистка админки после Phase 2

Разделю на 5 блоков. Каждый — самостоятельный, можно катить отдельно.

---

## 1. Casino Settings → Working Hours: единая матрица

Проблема: «End shift starts 06:00» — сейчас в `TimeSettingsPanel` есть только N-shift / D-shift (2 позиции), и cage-дедлайны. Пользователь хочет матрицу «позиция × время», применимую к ротам, а не только к cage.

Что делаю:
- В `TimeSettingsPanel` разбиваю верстку на **2 колонки** (grid md:grid-cols-2) — сейчас всё в один `max-w-lg`.
- Заменяю «Shift & Cage Times» на **Shift Matrix**: список смен с полями `key | label | start | end | applies_to (rota/cage/breaklist/all)`. Три смены по умолчанию: `Day (D)`, `Night (N)`, `Middle (M)`. Хранение — новая jsonb-колонка `casinos.shift_matrix` (массив), с дефолтом из текущих `n_shift_start`/`d_shift_start`.
- Матрица читается ротой/брейклистом/cage через новый хелпер `getShiftMatrix(casino)` — старые поля `n_shift_start`/`d_shift_start` остаются как fallback чтобы ничего не сломать.
- Cage-дедлайны и Manager Override — отдельная маленькая карточка справа (только для cage-close окна, это отдельный концепт).

Файлы: `TimeSettingsPanel.tsx`, миграция (`casinos.shift_matrix jsonb`), `src/lib/business-day.ts` — хелпер `getShiftMatrix`.

---

## 2. Casino Settings ↔ Branding: убрать дубли

Проблема: **Chip Colors** и **Chip Mode** есть и в Settings, и в Branding (Colors & Chips). **Theme Colors** ушли в Branding, а Chip Colors там же — путаница.

Решение — чёткое разделение по домену:

| Раздел | Что содержит |
|---|---|
| **Casino Settings** | Time · Tables · Float · **Chip Colors** · **Chip Mode** |
| **Branding** | Identity (logo+тексты+meta) · **Theme Colors** (theme/background) · PWA (иконки, manifest) |

Изменения:
- В `BrandingPage` таб **«Colors & Chips»** переименовать в **«Theme»** и убрать из него `<ChipColorSettings />` (остаются только theme/background).
- Meta title/description **уже** в Identity — оставляем, но добавляю OG image URL там же (маленький блок «Social preview»).
- Единая кнопка **Save All** внизу Branding — сохраняет identity + theme одним запросом (сейчас две отдельные кнопки в двух панелях). Технически: поднять state с двух панелей в `BrandingPage`, одна мутация.

Файлы: `BrandingPage.tsx`, `CasinoColorsPanel.tsx` → `CasinoThemePanel.tsx` (убрать ChipColorSettings), `CasinoIdentityPanel.tsx` (+ og_image_url поле), общий save.

---

## 3. Users & Roles

Проблемы:
1. При открытии permissions **левого меню модулей нет** — непонятно как найти, например, Office.
2. **Module permissions** — модалка, хочется страницу.
3. **Role Defaults** vs **Casino Access** — назначение неочевидно.

Изменения:
- `UserPermissionsDialog` → превращаю в **страницу** `/admin/users/:userId/permissions` (новый роут). В `UsersTab` кнопка «Permissions» ведёт на неё через `navigate()`.
- На странице — **2-колоночный layout**: слева sticky-навигация по группам модулей (Operations / Players / Finance / Reports / Club / System) с якорями и поиском (input сверху). Справа — сама матрица, сгруппированная по этим же секциям с `id="group-..."`.
- То же самое применяю к `RoleDefaultsEditor` (страница + левый навигатор).
- **Casino Access** — оставляю как есть (это межказино-доступ super_admin, отдельная сущность), но добавляю однострочный tooltip-help в заголовке.
- Синхронизация с сайдбаром: список модулей в матрице сортирую в том же порядке, в котором пункты в главном меню (`route-module-map.ts`), чтобы «где Office → там и в матрице».

Файлы: новый `src/pages/admin/UserPermissionsPage.tsx` + роут в `App.tsx`; правки в `UsersTab.tsx`, `PermissionMatrix.tsx` (секции с id + поиск), `RoleDefaultsEditor.tsx` (страница вместо inline), `modules.ts` (сортировка/группировка выравнивается с меню).

---

## 4. Cloud Management: чистка меню + фикс Snapshots

Проблема: длинное меню, дубли `Local Server`, «Server Peers» — ахинея, старые записи, Snapshot падает `Build failed: failed to send request to edge function`.

Изменения структуры `CloudManagementPage`:

Оставляю **3 таба** (сейчас 3, но внутри Peers каша из 9 панелей):
- **Casinos** — как есть.
- **Servers** — рефактор `ServersAndPeersPanel`:
  - Один блок «This server» (ServerIdentity + SyncStatus + MirrorHealth) — как есть.
  - Один блок «Peers» — таблица peer_links с колонкой «Duplicate?» (флаг) + фильтр «Hide stale (>7d)». Убираю дубли: если `peer_url` совпадает — оставляю только свежайший, старые сворачиваю в expandable «3 stale».
  - Advanced (accordion, свёрнут): Data Inventory, Cutover, Mirror Cutover, Apply Errors, Local Updater. Не удаляю — прячу под «Advanced».
- **Snapshots** — как есть, но чиню edge function.

Фикс Snapshot ошибки:
- Проверяю логи `cloud-snapshot-build` (через `supabase--edge_function_logs`).
- Скорее всего одно из: (а) функция не задеплоена, (б) `verify_jwt` требует authorization, а клиент шлёт anon — `supabase.functions.invoke` уже подставляет токен, но edge может ждать service role, (в) внутри падает при попытке писать в bucket `installer-snapshots` (нет bucket).
- Диагностирую и правлю (создаю bucket если нет + возвращаю осмысленный error).

Файлы: `CloudManagementPage.tsx`, `ServersAndPeersPanel.tsx` (реорганизация в accordion), `supabase/functions/cloud-snapshot-build/index.ts` (фикс).

---

## 5. Порядок катки

1. Time matrix (миграция + UI).
2. Branding дедупликация + single Save.
3. Users → страница permissions с левым навигатором.
4. Cloud чистка + snapshot fix.

После каждого блока — визуальная проверка через Playwright скриншот админки.

---

## Технические заметки

- Всё UI-только там, где возможно; миграций две: `casinos.shift_matrix jsonb`, `casinos.og_image_url text`.
- `manifest-*.json` в /public не трогаю (уже обсуждали — сломает установленные PWA).
- Никакой бизнес-логики в существующих ротах не меняю: matrix читается через хелпер с fallback на `n_shift_start`/`d_shift_start`.

Погнали?
