## Цель
Расширить уже существующий `useSessionState` на страницы игроков/трекинга/статистики и сделать пресеты приватными по пользователю (без чистки на signOut).

## 1. Изменения в `useSessionState`

`src/hooks/use-session-state.ts`:
- Текущий ключ: `cms.session::${pathname}::${key}`.
- Новый ключ: `cms.session::${userId || "anon"}::${pathname}::${key}` — берём `userId` из `auth-context` (lazy через `getStoredUserId()`, чтобы не тянуть React-контекст в хук). Это даст разделение по юзерам в одной вкладке.
- При смене `userId` (другой логин) хук читает из своего namespace — фильтры предыдущего юзера не видны.

`src/lib/auth-context.tsx`:
- Убрать вызов `clearSessionState()` в `signOut`. Данные остаются в sessionStorage, но другой юзер их не увидит (другой namespace).
- `sessionStorage` всё равно умирает при закрытии вкладки — приватность сохраняется.

## 2. Страницы под подключение (Players / Tracking / Stats)

Пройтись по всем экранам, связанным с игроками и трекингом, и заменить `useState` → `useSessionState` для фильтров/сортировок/поиска/табов/периодов:

| Файл | Что персистим |
|---|---|
| `src/pages/crm/CrmPlayers.tsx` | search, category/status/tag фильтры, sortKey/sortDir, активный таб |
| `src/pages/Guests.tsx` | (уже подключено — проверить полноту: posFilter, date range) |
| `src/pages/Blacklist.tsx` | (уже) — добавить sort и фильтры по casino |
| `src/pages/PlayerProfile.tsx` | активный таб (Overview / Visits / Tracker / Notes / Cashless / Bank Checks …), period preset |
| `src/pages/Reception.tsx` | (уже sortBy) — добавить search, фильтры status/category |
| `src/pages/Groups.tsx` | search, sort |
| `src/pages/MarketingCampaigns.tsx`, `MarketingCampaignDetail.tsx` | search, status filter, активный таб |
| Player Tracker / Active Players (внутри Dashboard, Pit, или отдельные блоки) — найти grep'ом `useState` для filter/sort и заменить |
| `src/pages/BankChecks.tsx` | (уже preset) — добавить search, statusFilter, sortKey/sortDir |
| `src/pages/Cashless.tsx` | search, providerFilter, dateRange, sort |
| `src/pages/Transfers.tsx` | period, sort |
| `src/pages/Logs.tsx` | filter по типу события, period, search |
| Stats-страницы под `src/pages/reports/*` относящиеся к игрокам (per-player reports) | period preset, sort |

Точный список финализирую при имплементации — пройдусь grep'ом `useState<` по `pages/` и `components/players/`, `components/crm/`, `components/tracker/`. Любой `useState` для строки поиска, селекта фильтра, `sortKey`, `sortDir`, `activeTab`, `preset`, `dateFrom`/`dateTo`, `page`/`pageSize` → заменяю на `useSessionState`.

**Исключения** (как и раньше — не персистим):
- Открытие модалок, выбранная строка, hover/focus.
- Поля форм ввода (создание/редактирование).
- Оперативные гриды Pit Rota / Breaklist / Table Tracker — там нет фильтров, только структурная сетка.

## 3. Проверка

1. Открыть `/crm/players`, поставить фильтр + сортировку → перейти на `/cage` → вернуться → состояние на месте.
2. Открыть `/players/:id`, переключить таб на Tracker → перейти на другого игрока → вернуться к первому → таб Tracker сохранён.
3. signOut → login тем же юзером → фильтры на месте.
4. signOut → login другим юзером → видит чистое состояние (свой namespace).
5. Закрыть вкладку → открыть заново → чистое состояние (sessionStorage умер).

## 4. Версия

Чисто фронтовое изменение — bump patch в `package.json` всё равно сделаю (по нашему правилу авто-бамп; здесь скорее косметика, но затрагивает много страниц).

## Что НЕ делаем
- Никакой БД, никаких миграций, никаких RLS — пресеты остаются клиентскими.
- Не вводим именованные пресеты с UI выбора (по предыдущему решению — только «последнее состояние»).
- Не трогаем localStorage и не делаем синхронизацию между устройствами.
