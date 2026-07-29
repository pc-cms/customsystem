## Модель: роли — отдельные сущности, права — капабилити

`general_manager` перестаёт быть «алиасом» `manager`. Каждая роль — самостоятельный набор прав. GM = набор Manager + допы, но технически это **свой** независимый набор: изменение прав Manager не задевает GM и наоборот.

## Проверенное состояние (перед планом)

| Уровень | Найдено |
|---|---|
| `has_role` | сейчас содержит костыль-алиас `general_manager → manager` |
| Политики с буквальным `has_role(auth.uid(),'manager')` | **115** |
| Политики через `is_manager_op()` (`manager, shift_manager, super_admin`) | **39** |
| DB-функции с `has_role(...,'manager')` | 7 |
| Edge-функции с проверкой `manager` | 7 |
| Клиент `roles.includes("manager")` | 29 мест в 24 файлах (работают из-за синтеза роли в `auth-context.tsx`) |
| Всего политик в `public` | 555 |

## Откат — встроен в план (главное требование)

**1. Снимок политик до изменений.** Постоянная таблица `public._policy_backup` (`batch_id`, `taken_at`, `schemaname`, `tablename`, `policyname`, `cmd`, `roles`, `qual`, `with_check`, `restore_sql`). Заполняется ПЕРЕД любой правкой политик; `restore_sql` — готовая строка `DROP POLICY ... ; CREATE POLICY ...` для точного восстановления.

**2. Функция отката одной командой.** `public.rollback_policy_batch(_batch_id uuid)` — SECURITY DEFINER, только `super_admin`: пробегает снимок и выполняет `restore_sql` в одной транзакции. Возвращает число восстановленных политик. Работает независимо от того, сколько времени прошло.

**3. Обратный тумблер на уровне прав.** Откат прав GM не требует миграции вообще: `DELETE FROM role_capabilities WHERE role='general_manager'` мгновенно возвращает GM к минимуму, а восстановление — обратный INSERT. Никакого DDL.

**4. Аварийный алиас.** Алиас `general_manager → manager` внутри `has_role` снимается **самой последней** миграцией, отдельным шагом. Пока он на месте, GM гарантированно работает даже если что-то в новой цепочке сломалось. Возврат алиаса = одна короткая миграция (текст сохраняем в `docs/`).

**5. Транзакционность.** Каждая миграция — одна транзакция с ассертами внутри: несовпадение → `RAISE EXCEPTION` → автоматический полный откат, БД остаётся в исходном состоянии.

**6. Откат кода.** Все правки клиента и edge-функций идут отдельными сообщениями, чтобы каждый шаг можно было вернуть через историю проекта.

<presentation-actions>
  <presentation-open-history>View History</presentation-open-history>
</presentation-actions>

## Шаг 1. Инфраструктура отката + таблица капабилити

- `public._policy_backup` + `public.rollback_policy_batch(uuid)` (описаны выше).
- `public.role_capabilities (role app_role, capability text, primary key(role, capability))` + RLS + GRANT (`select` → `authenticated`, `all` → `service_role`).
- `public.has_cap(_uid uuid, _cap text)` — STABLE SECURITY DEFINER, `search_path=public`. GRANT EXECUTE → `authenticated`.

Начальные наборы (каждая роль перечислена явно, без наследования):

| Капабилити | manager | general_manager | shift_manager | finance_manager | pit | super_admin |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| `manage.ops` — pit/rota/breaklist/dealers/tables/tracker | ✓ | ✓ | ✓ | | | ✓ |
| `manage.core` — расходы, отчёты, игроки, теги, отмены | ✓ | ✓ | | | | ✓ |
| `manage.finance` — Office, кошельки, day closing | | ✓ | | ✓ | | ✓ |
| `view.all_casinos` — сеть целиком | | ✓ | | ✓ | | ✓ |
| `manage.roles` — назначение ролей | | | | | | ✓ |

**Допы GM относительно Manager: `manage.finance` + `view.all_casinos`.** Любой следующий доп — одна строка INSERT, без миграции политик.

## Шаг 2. Переключение через существующие функции

- `is_manager_op(_uid)` внутри → `has_cap(_uid,'manage.ops')` — автоматически покрывает 39 политик, их текст не трогаем. Откат = вернуть старое тело функции (одна строка).
- Новые `can_manage(_uid)` = `has_cap(_uid,'manage.core')`, `can_finance(_uid)` = `has_cap(_uid,'manage.finance')`.

## Шаг 3. 115 политик — автозамена с самопроверкой (одна транзакция)

1. Снимок всех затрагиваемых политик в `_policy_backup` с новым `batch_id` (запоминаем его в `docs/`).
2. DO-блок: `DROP` + `CREATE` с заменой **только** выражения `has_role(auth.uid(),'manager'::app_role)` на `can_manage(auth.uid())`. Casino-скоуп, владелец и прочие роли не меняются.
3. Ассерты в той же транзакции: число политик по-прежнему 555; не осталось буквального `'manager'::app_role`; обратная подстановка даёт текст, идентичный снимку «до».
4. Проверка отката «вхолостую» на копии: `rollback_policy_batch` восстанавливает 115 политик 1:1.

## Шаг 4. Финансовый скоуп GM (единственное расширение поведения)

Отдельная миграция после зелёных тестов шага 3, со своим `batch_id`:
- `expenses`, `fin_wallet_tx`, `fin_wallets`, `fin_day_closing`, `fin_other_incomes`, `fin_budget`, `fin_daily_rates`, `fin_month_closures`: к текущему условию добавляется ветка `can_finance(auth.uid())`.
- `view.all_casinos` реализуется тем же механизмом, что уже работает для `boss`: существующие boss-ветки расширяются на `has_cap(...,'view.all_casinos')`.
- Manager ничего не получает: у него нет `manage.finance`.

## Шаг 5. Функции БД и edge-функции

- 6 DB-функций: `has_role(...,'manager')` → `can_manage(...)`.
- `update_user_roles` → `has_cap(...,'manage.roles')` (остаётся у `super_admin`) — заодно закрывает эскалацию привилегий.
- 7 edge-функций (`verify-manager`, `create-user`, `admin-update-user`, `admin-list-users`, `disable-user`, `reset-user-password`, `fin-excel-import`): общий хелпер через RPC `has_cap` вместо списков строк.

## Шаг 6. Клиент — убрать синтез роли

- В `auth-context.tsx` убрать дописывание `"manager"` для `boss`/`general_manager`; грузить капабилити вместе с профилем: `caps: Set<string>` + `can(cap)`.
- 29 мест `roles.includes("manager")` → `can("manage.ops")` (Pit, Cage, Breaklist, Tables, Blacklist, Tracker) или `can("manage.core")` (Reports, Expenses, MergePlayers, ChipConservation).
- Office-вкладки и селектор казино → `can("manage.finance")` / `can("view.all_casinos")`.
- `role-access.ts`, `use-readonly-mode.ts`, `AppSidebar`, `RoleGuard` — на те же капабилити; `getFinancialScope` становится производной от капабилити.
- Офлайн: капабилити кэшируются с профилем и не обнуляются при отсутствии сети.

## Минимизация рисков

| Риск | Мера |
|---|---|
| Искажение политики при пересоздании | Транзакция + ассерт на количество + diff-ассерт по тексту + снимок в `_policy_backup` |
| Нужно срочно вернуть как было | `rollback_policy_batch(batch_id)` — одна команда |
| `shift_manager` получит лишнее | `manage.core` его не содержит; негативный тест |
| Manager получит финансы | `manage.finance` ему не выдаётся; тест на отказ |
| `boss` получит запись | `boss` не входит ни в одну write-капабилити |
| GM потеряет доступ в промежутке | Алиас в `has_role` снимается последним, после зелёных тестов |
| Регресс у остальных ролей | Прогон по `expenses`, `pit_rota`, `breaklist`, `dealer_attendance`, `gaming_tables`, `transactions`, `chip_baseline`, `player_groups`, `player_tags`, `cctv_observations` |
| Расхождение клиента и сервера | Клиент, edge-функции и RLS читают одну таблицу `role_capabilities` |

## Проверка после каждого шага

1. `run_rls_multicasino_tests()` — существующий SQL-автотест.
2. Новый `run_role_capability_tests()`: под каждой ролью (`manager`, `general_manager`, `shift_manager`, `finance_manager`, `pit`, `cashier`, `boss`) — INSERT/UPDATE/SELECT по 10 ключевым таблицам, с проверкой и разрешённых, и **запрещённых** случаев.
3. `supabase--linter` после каждой миграции.
4. vitest: `access-matrix` (добавляется матрица роль × капабилити), `business-logic`, регрессы по expenses.
5. Браузерная проверка под GM: сайдбар, Pit, Cage, Reports, Office, Admin — сохранение проходит; под Manager — Office недоступен.
6. Финальный контроль: у GM `has_role(uid,'manager') = false`, `can_manage = true`, `can_finance = true`; у Manager `can_finance = false`.

## Технические детали

- Enum `app_role` не меняется; роли остаются независимыми сущностями.
- Ни одна политика не удаляется без пересоздания в той же транзакции.
- Процедура отката (batch_id, команды, текст аварийного алиаса) фиксируется в `docs/ACCESS-MATRIX.md`.
- В конце поднять версию в `package.json`.
