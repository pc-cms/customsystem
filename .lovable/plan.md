# Финальный план: быстрый, плавный UX без лишней нагрузки

Выполняется строго последовательно. Каждый шаг — отдельный коммит, проверяемый эффект, можно откатить независимо.

---

## Часть 1 — Загрузка и Realtime по доступам к модулям

### Принцип
- **Игроки** (`players` + `player_cards` + `player_tags` + сегодняшние `casino_visits` + `business_day_closures`) — для всех ролей.
- **Всё остальное** — prefetch и Realtime только если модуль в `useMyModulePermissions()` (`allowedModules`).

### Карта «модуль → данные → Realtime»

| Модуль | Prefetch на логине | Realtime |
|---|---|---|
| core (всегда) | players, player_cards, player_tags, casino_visits today, business_day_closures, player_notes | те же |
| breaklist / rota / attendance / dealers | dealers, breaklist today, pit_rota month, dealer_attendance month, staff_rota, staff_attendance, rota_locks | те же |
| tables / table-tracker | gaming_tables, table_tracker today, chip_baseline, chip_snapshots today | те же |
| cage | current shift, shifts today, chip_snapshots today, cage_transfers today, transactions today, cashless today | те же + player_chip_adjustments |
| bank-checks | bank_checks today | bank_checks |
| expenses | expense_categories, expenses today | expenses |
| finances | fin_wallets, fin_categories, fin_daily_rates, fin_wallet_tx month, fin_day_closing | те же + fin_money_change |
| player-tracker | player_daily_zones today, player_daily_avg_bets today | те же |
| cctv | cctv_observations today | cctv_observations |
| staff / hr | employees, attendance_hours month, staff_warnings | те же |
| payroll | payroll_periods, payroll_settings | payroll_entries |
| monthly-tips | monthly_tips_pools, monthly_tips_entries month | monthly_tips_entries |
| pos | pos_locations, pos_menu_items, pos_modifiers, pos_recipes | pos_orders, pos_tabs, pos_shifts |
| promo / lottery / club-shop | promo_grants, promo_codes, lotteries | promo_grants, promo_redemptions, lottery_tickets |

Pit без финансов: 4 канала вместо 25. Кассир: 5. Reception: 1.

### Файлы
- `src/hooks/use-prefetch.ts` — переписать на матрицу `modulePrefetchTasks(module, casinoId, qc)`, последовательно (anti-429).
- `src/lib/route-prefetch.ts` — `prefetchRouteChunks(allowedModules)`.
- `src/hooks/use-realtime.ts` — разбить на `attachCoreChannel` + `attachPitChannel` + `attachCageChannel` + `attachFinanceChannel` + `attachTrackerChannel` + `attachStaffChannel` + `attachPosChannel` + `attachPromoChannel`. Подключаем по `allowedModules`. Realtime живёт на уровне `App`, не на странице — кеш обновляется в фоне даже при закрытой вкладке.

---

## Часть 2 — Мгновенные вкладки, без мигания «старое → новое»

**2.1. staleTime + дефолты QueryClient.**
Глобально: `refetchOnMount: false`, `refetchOnWindowFocus: false`. Свежесть = Realtime + ручной Resync. staleTime по справочникам:

| Хук | staleTime |
|---|---|
| chip_colors, chip_conservation_mode, expense_categories, fin_categories, tax_brackets, payroll_settings | 24 ч |
| chip_baseline, fin_wallets, casinos | 6 ч |
| fin_daily_rates | 1 ч |
| employees, dealers, staff | 30 мин |
| gaming_tables, pos_locations/menu/modifiers/recipes | 5–30 мин |
| module_permissions | вся сессия |

`staleTime: 0` оставляю только для «горящих» KPI: `current-shift`, `business-day-closure`, `shift_tables_result_total`. Здесь обновление = фича.

**2.2. Дельта-патч `setQueryData` для immutable INSERT.**
Realtime для `transactions`, `bank_checks`, `cashless_transactions`, `player_chip_adjustments`, `cage_transfers` → не invalidate, а `setQueryData([...], old => [...old, payload.new])`. Cash In/Out в Player Statistics обновляется через ~50 мс **без сетевого запроса и без перерисовки списка**.

**2.3. Debounce invalidate 250 мс** (Set-based батч) — только там, где патч невозможен (массовые сейвы breaklist/rota).

**2.4. React.memo** на Sidebar, AppSidebar item, PageHeader, CasinoBadge, ChipToken, DataTable row, BreaklistGrid cell, Logs row.

**2.5. Catch-up после disconnect/sleep.**
`wasDisconnectedRef`: видимая страница → `refetchType: "active"`; остальные ключи модулей юзера → `refetchType: "none"` (stale-while-revalidate). При возврате на вкладку — мгновенный показ из кеша + тихий фоновый refetch.

### Гарантия отсутствия мигания
Открываешь вкладку → видишь **состояние БД на момент перехода**, потому что Realtime поддерживал кеш в фоне. Мигание возможно только при холодном старте PWA после долгого офлайна (лечится Resync-кнопкой) и на 3 «горящих» KPI выше.

---

## Часть 3 — Аудит на сервере

1. **БД-миграция:** `public.log_change()` SECURITY DEFINER + AFTER INSERT/UPDATE/DELETE триггеры на: `breaklist`, `shifts`, `expenses`, `cage_transfers`, `gaming_tables`, `chip_baseline`, `chip_emissions`, `players`, `transactions`, `bank_checks`, `cashless_transactions`, `player_chip_adjustments`. Пишут `auth.uid()` + `to_jsonb(OLD)` / `to_jsonb(NEW)` в `activity_logs`.
2. Удалить ~56 клиентских `logAction()`, покрытых триггерами. Оставить login, manager override, открытие чувствительных экранов (~10).
3. Архивировать `activity_logs` > 60 дней (22 МБ → ~3 МБ).
4. Debounce invalidate `activity-logs` 500 мс.

Эффект: Save кассира 2 RTT → 1 RTT, «тормоз после сохранения» <200 мс.

---

## Часть 4 — Блок A: ускорения для восприятия (A1–A8)

**A1. Виртуализация длинных таблиц** через `@tanstack/react-virtual` на: Players, Logs, Activity Logs, Bank Checks, Cash Checks, Expenses. Рендер ~30 строк вместо тысяч → открытие <50 мс.

**A2. Skeleton вместо спиннера** на всех страницах с табличными данными. Те же 200 мс ощущаются как «уже почти готово».

**A3. Hover-prefetch данных** — при наведении на пункт Sidebar и на первую строку списка вызвать `qc.prefetchQuery(...)` с staleTime 30 с. Клик ощущается мгновенным.

**A4. `startTransition`** на переключение табов, смену фильтров, поиск. Старый контент остаётся видимым пока готовится новый — нет белого экрана между вкладками.

**A5. Optimistic UI** для Cash In, Cash Out, breaklist drag, attendance клик, player tag toggle, blacklist toggle. `onMutate` патчит кеш сразу, `onError` откатывает. 0 мс ощущаемый отклик.

**A6. Thumbnail WebP 80×80** для player_photo/employee_photo. Генерация при загрузке через существующий `image-compress`, кешируется в storage как `thumb_*`. В списках отдаётся thumb, в профиле — оригинал. Списки на мобильном открываются на 1–2 сек быстрее.

**A7. Подсветка обновлённой строки** — при `setQueryData` через Realtime на 1 сек подсветить строку светло-зелёным (CSS animation). Юзер видит **что изменилось**, без перерисовки экрана.

**A8. Vite-плагин `vite-plugin-remove-console`** — срезать ~600 `console.log/info` из прод-бандла. −30 КБ, чище DevTools.

---

## Часть 5 — Resync для нового ПК

Settings → Diagnostics → кнопка **Resync all data**: дёргает `prefetchAllForRole(allowedModules)` вручную. Сценарий «новый ПК → одна кнопка → всё подтянулось».

---

## Часть 6 — Серверные агрегации (RPC)

| Страница | RPC |
|---|---|
| Finances → Monthly Report | `fin_monthly_report` |
| Dashboard → Table Results | `dashboard_table_results` |
| Player Profile → Economy | `player_economy` |
| Finances Dashboard KPIs | `fin_dashboard_kpis` |
| Attendance Monthly | `attendance_monthly` |
| CRM list | существующий `crm_players_list` |

1 запрос вместо 5–8, 100 мс на сервере вместо 500–2000 мс JS-цикла.

---

## Что НЕ трогаем
Бизнес-логика, структура таблиц, RLS, PWA-манифесты, оффлайн-очередь, Sidebar hover-prefetch чанков (уже фильтруется).

---

## Порядок выполнения (строго последовательно)

| # | Шаг | Время | Риск | Эффект |
|---|---|---|---|---|
| 1 | staleTime + дефолты QueryClient | 30 мин | 0 | возврат на вкладку мгновенный |
| 2 | Модульный prefetch (`use-prefetch.ts`) | 1 ч | низкий | трафик логина −50% у Pit/Cashier |
| 3 | Модульный route-prefetch | 30 мин | 0 | −85% прогретых JS-чанков |
| 4 | Realtime каналы по модулям + catch-up на reconnect | 1.5 ч | средний | −60% событий у Pit |
| 5 | `setQueryData` дельты + подсветка строки (A7) | 1.5 ч | низкий | Player Stats обновляется без рефетча |
| 6 | React.memo + debounce 250 мс | 1.5 ч | низкий | Save <200 мс, плавность |
| 7 | A1 — виртуализация 6 длинных таблиц | 2 ч | низкий | открытие Players/Logs <50 мс |
| 8 | A2 — Skeleton везде | 1 ч | 0 | восприятие скорости |
| 9 | A3 — Hover-prefetch данных | 45 мин | 0 | клик ощущается мгновенным |
| 10 | A4 — `startTransition` на табы/фильтры | 45 мин | низкий | нет белого экрана между вкладками |
| 11 | A5 — Optimistic UI для 6 частых мутаций | 2 ч | средний | 0 мс отклик |
| 12 | A6 — Thumbnail WebP для фото | 1.5 ч | низкий | списки на мобильном −1–2 сек |
| 13 | A8 — `vite-plugin-remove-console` | 10 мин | 0 | −30 КБ бандл |
| 14 | БД-триггеры аудита + удалить клиентские `logAction` + архив | 3 ч | средний | Save −1 RTT |
| 15 | Кнопка Resync в Settings | 30 мин | 0 | сценарий «новый ПК» |
| 16 | RPC для тяжёлых отчётов | 3 ч | средний | отчёты в 3–10× быстрее |

Итого ~20 часов работы, разбито на 16 атомарных шагов.

**После апрува переключаюсь в build mode и иду 1 → 16 последовательно, с коммитом и проверкой после каждого шага.**
