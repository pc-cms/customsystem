
# План: SWR-Focus Revalidation — единая модель свежести (финал)

Одна модель для всей системы: кассиры, менеджеры, пит, ресепшн, POS, HR, boss/super_admin, club-приложение игроков. Работает одинаково в Cloud и в local_primary без интернета. Offline-очередь мутаций, sync-engine и Realtime не ломаются.

## Что решаем
1. Смешивание кэша между пользователями на одном ПК.
2. Устаревшие данные при возврате во вкладку / открытии на следующий день.
3. Задержки 10–15 мин по Expenses и другим модулям (Realtime молча умирает).
4. Каша при работе с несколькими казино в разных вкладках.
5. Полная совместимость с offline / local_primary.

## Единый стек — Вариант 2 (SWR classic + изоляция)

### 1. Глобальные дефолты QueryClient (`src/App.tsx`)
```
staleTime: 30_000
gcTime: 24h
refetchOnMount: 'always'
refetchOnWindowFocus: true
refetchOnReconnect: 'always'
networkMode: 'offlineFirst'   // критично для offline
retry: 2
mutations: { networkMode: 'offlineFirst' }  // уже стоит — не трогаем
```

### 2. Депрекация `liveQueryOptions()`
`src/lib/live-query-options.ts` → пустой объект-алиас. Все хуки, которые его использовали, автоматически перейдут на глобальные дефолты. Правки в самих хуках не нужны.

**Исключения оставляем как есть** (осознанные override'ы):
- `use-business-day-closure.ts` — `networkMode: 'always'` (нужен даже offline для правильного расчёта бизнес-дня).
- Хуки с уже коротким `staleTime` (current-shift, shift_tables_result_total) — их поведение не ухудшается.

### 3. Изоляция кэша по пользователю (`src/lib/query-persister.ts`)
- IDB-ключ: `` `cms-query-cache:${userId}:${casinoId}` ``.
- Фабрика `createIDBPersister({ userId, casinoId })`.
- `clearAllUserCaches()` — удаляет все `cms-query-cache:*`.

### 4. Очистка при logout / смене юзера (`src/lib/auth-context.tsx`)
- В `signOut`: `queryClient.clear()` → `clearAllUserCaches()` → `blacklist-cache.clear()` → `supabase.auth.signOut()`.
- В `onAuthStateChange` при смене `userId`: та же очистка.
- **Club-приложение игрока** (`/club/*`) и менеджерский Cloud используют один `supabase.auth`, но разные userId → изоляция срабатывает автоматически.

### 5. Мультиказино во вкладках (`src/lib/casino-context.tsx`)
- Активное казино вкладки — в `sessionStorage` (per-tab).
- BroadcastChannel `casino-changed` отключается для мульти-казино юзеров.
- Первое открытие: fallback на `localStorage` для UX «как раньше», далее вкладка живёт независимо.

### 6. Watchdog Realtime (`src/hooks/use-module-live-sync.ts` + `src/hooks/use-realtime.ts`)
- На `visibilitychange → visible` после `hidden > 60s`: `.unsubscribe() + .subscribe()` всех каналов + одноразовый invalidate.
- Страхует sleep ноутбука и «молчаливую смерть» WS. Тот же паттерн — и для кастомных каналов в `use-realtime.ts` и `FleetActionsPage`.

## Что дополнительно проверили и учли

### 7. Offline-очередь мутаций и sync-engine
- `src/lib/offline-mutation.ts`, `src/lib/offline-queue.ts`, `src/lib/sync-engine.ts` **не трогаем**. Мутации уже `networkMode: 'offlineFirst'` — они ставятся в очередь при offline и синхронизируются при reconnect.
- Focus-refetch **queries** и offline-mutations живут независимо.

### 8. Auth refresh storm при focus-refetch
- Focus на всех вкладках → лавина `/auth/token`. Уже защищено `src/lib/auth-leader.ts` (Web Locks leader election) и `src/lib/auth-throttle.ts` (coalescing). **Дополнительно ничего не нужно** — существующая защита покрывает новый сценарий.

### 9. Boss TV / Kiosk fullscreen без focus-событий
- В kiosk-режиме нет `visibilitychange`. Свежесть обеспечивает: Realtime + fallback `staleTime: 30s` (запросы, отрендеренные повторно, всё равно перезапрашиваются). Плюс существующий `useBusinessDayWatcher` (polling каждые 30s).

### 10. Prefetch (`use-prefetch.ts`, `route-prefetch.ts`, `pit-prefetch.ts`)
- С `refetchOnMount: 'always'` prefetch даёт мгновенный первый рендер из кэша + фоновый refetch. UX улучшается, не ухудшается.

### 11. Signed URLs (`use-signed-url.ts`)
- Focus-refetch = автоматическое обновление истекающих подписанных URL. Плюс, не минус.

### 12. `useBusinessDayWatcher` — уже инвалидирует всё на rollover бизнес-дня. С новыми дефолтами конфликта нет; убираем дублирующий `visibility` listener из watcher'а (его роль теперь выполняет глобальный focus-refetch), оставляем только 30s polling для rollover.

### 13. `blacklist-cache.ts` — кастомный кэш, чистим в `signOut` вместе с IDB.

### 14. Multi-tab race в одном браузере одного юзера
- Разные вкладки пишут в один IDB-namespace (userId+casinoId одинаковые). React Query дедуплицирует внутри одной вкладки, но не между. Приемлемо: последний writer выигрывает, данные всё равно свежие благодаря 30s staleTime. Broadcast между вкладками — опция на будущее, не в этот PR.

### 15. Cashier-flow (высокая частота записи)
- `use-transactions.ts`, `use-tables.ts`, `use-cage-transfers.ts`, `use-cage-slots.ts`, `use-chips.ts` — работают через мутации + Realtime. Новый focus-refetch не мешает: мутация уже инвалидирует локально, Realtime — во всех вкладках.

### 16. POS / Bar (waiter, bartender, POS-manager)
- `use-pos-*` хуки (>15 файлов) сейчас на дефолтах QueryClient. С новыми дефолтами POS начнёт освежаться при переключении вкладки — это ожидаемое улучшение (сейчас бармен видит устаревший тап-open список).

### 17. Роли, которых часто забывают
- **Reception** (KYC, регистрация): свежесть при возврате во вкладку — плюс.
- **HR** (Warnings, Payroll): `use-payroll`, `use-staff-warnings` — редко открываются, +нагрузка минимальна.
- **Surveillance / CCTV** (`use-cctv-observations`): улучшение, они как раз ждут свежих инцидентов.
- **Account Manager** (`am_*`, `use-promo-campaigns`): свежесть grants/redemptions при возврате — критично.
- **Boss / Super Admin** (Boss TV, Dashboard) — уже разобрано выше.

### 18. Club-приложение игрока (`/club/*`)
- Отдельный поддомен `club.casinosystem.app`, отдельный userId. Изоляция кэша защищает и здесь.
- Игроки часто держат приложение свёрнутым на телефоне → focus-refetch при возврате = свежие балансы/промо. Улучшение UX.

### 19. Local-primary без интернета
| Ситуация | Поведение |
|---|---|
| Cloud, есть интернет | Realtime + focus refetch → мгновенная свежесть. |
| Local-primary, local Realtime доступен | То же через local. |
| Local-primary, интернета нет | `navigator.onLine=false` + `offlineFirst` → refetch тихо не бьёт, отдаётся IDB-кэш, ошибок нет. |
| Восстановление сети | `refetchOnReconnect: 'always'` → одна волна refetch, sync-engine дожимает мутации. |
| Cashier с offline-queue | Мутации ставятся в `offline-queue`, sync-engine отправит при онлайне; queries отдают stale-but-serve. |

### 20. Runtime-config и box-license
- `use-license.ts`, `use-box-license.ts`, `use-runtime-config` — редко меняются; +30s refetch несущественно.

## Оценка нагрузки
- Ожидаемый прирост RPS на Supabase: +30–50% пиково.
- Дедупликация React Query + `staleTime: 30s` гасят большинство лишних запросов.
- Auth-throttle гасит `/auth/token` storm.
- Утренняя выкатка, наблюдение 30–60 мин по dashboard.

## Файлы к правке
1. `src/App.tsx` — новые дефолты QueryClient + фабрика персистера с userId/casinoId.
2. `src/lib/query-persister.ts` — параметризованный ключ + `clearAllUserCaches()`.
3. `src/lib/auth-context.tsx` — очистка кэша при signOut и смене userId (+ blacklist-cache).
4. `src/lib/casino-context.tsx` — sessionStorage + отключение BroadcastChannel для смены казино.
5. `src/lib/live-query-options.ts` — no-op алиас (обратно совместимо).
6. `src/hooks/use-module-live-sync.ts` — visibility-watchdog после sleep > 60s.
7. `src/hooks/use-realtime.ts` — тот же watchdog для кастомных каналов.
8. `src/hooks/use-business-day-watcher.ts` — убрать дублирующий visibility listener.
9. `package.json` — bump до 1.3.454.

## Проверка после выкатки
- Login юзер A → logout → login юзер B на том же ПК: у B нет данных A.
- Открыть Arusha, Mwanza, Dodoma, Mbeya в 4 вкладках — данные не пересекаются, все живут независимо.
- Alt-tab на 2 мин → возврат: данные Wallets/Expenses/POS/Cage/Boss TV обновились.
- Выключить Wi-Fi → навигация работает, ошибок нет; включить Wi-Fi → одна волна refetch + sync-engine дожимает мутации.
- Cashier: транзакции продолжают идти в offline-queue корректно.
- Boss TV kiosk: rollover бизнес-дня по-прежнему триггерит invalidate.
- Realtime по-прежнему даёт мгновенное обновление при событии.

Готов реализовать после подтверждения (утренняя выкатка).
