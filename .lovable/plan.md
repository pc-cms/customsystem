## Диагноз

После проверки кодовой базы и БД:

- **Realtime включён** в `supabase_realtime` для всех ключевых таблиц (transactions, breaklist, shifts, casino_visits, bank_checks, cashless_transactions, table_tracker, expenses, players, pit_rota, dealer_attendance, gaming_tables, business_day_closures, и т.д. — 40 таблиц в публикации).
- **REPLICA IDENTITY = FULL** у всех таблиц, к которым подписка ходит с фильтром `casino_id=eq.X` — фильтр работает корректно для INSERT/UPDATE/DELETE.
- **Канал монтируется один раз** в `ProtectedRoutes` (`useRealtimeSubscriptions`) — на навигацию по страницам не пересоздаётся. ОК.
- **React Query настройки** (`src/App.tsx:154`):
  - `staleTime: 2 мин` — кэш свежий 2 минуты
  - `refetchOnWindowFocus: false` — фокус вкладки НЕ триггерит refetch
  - `refetchOnReconnect: false` — реконнект сети НЕ триггерит refetch
  - Значит, после `staleTime` обновление возможно ТОЛЬКО через `invalidateQueries` от Realtime, либо при ремоунте компонента (переход между страницами → новый mount → если данные «stale», refetch).

**Это объясняет симптом:** если событие Realtime по какой-то причине не приходит или не инвалидирует нужный ключ — данные «висят» до перехода на другую страницу. С `refetchOnWindowFocus: false` смена окна вообще не должна обновлять; «обновление при переключении вкладок» = переход между разделами навигации, не реальная подписка.

Причина «молчания» Realtime, которую можно подтвердить только в проде:
- `.subscribe()` вызывается **без status-callback** — мы не видим, успешно ли установлена подписка, не было ли `CHANNEL_ERROR`/`TIMED_OUT`/`CLOSED`.
- Один канал держит ~22 биндинга `.on('postgres_changes', ...)` — это много, у Supabase есть рекомендация дробить, при флапающей сети такой канал может «упасть» и не подписаться заново корректно.

## Что делаю

### 1. Диагностика канала (`src/hooks/use-realtime.ts`)

Добавляю status-callback в `.subscribe()`:

```ts
.subscribe((status, err) => {
  if (status === "SUBSCRIBED") {
    console.info(`[Realtime] ✓ subscribed (casino=${casinoId})`);
    // Если это не первый SUBSCRIBED — это РЕКОННЕКТ, нужно догнать пропущенное
    if (wasDisconnectedRef.current) {
      wasDisconnectedRef.current = false;
      qc.invalidateQueries({ refetchType: "active" });
    }
  } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
    console.warn(`[Realtime] ✗ ${status}`, err);
    wasDisconnectedRef.current = true;
  }
});
```

Это даёт две вещи:
- видимость в консоли (можно прямо в проде открыть DevTools и увидеть, жив ли канал);
- автоматический догон данных при реконнекте — без UI-индикатора, прозрачно.

### 2. Страховочный refetch на смене вкладки

Включаю в `src/App.tsx` QueryClient default:

```ts
refetchOnWindowFocus: true,  // было false
```

Логика: с `staleTime: 2 мин` это НЕ создаёт «storm» — refetch уходит только для запросов старше 2 минут, и только тех, что сейчас отображаются. Это страховочный механизм: даже если Realtime пропустит событие (CHANNEL_ERROR в момент INSERT), при возврате во вкладку данные обновятся. Сейчас именно это работает (юзер описал — «обновляется при переключении»), но через mount-cycle, что медленнее.

### 3. Снижение staleTime для оперативных хуков

Точечно снижаю `staleTime` до **15 секунд** для самых «живых» данных, где задержка в 2 мин раздражает даже при работающем Realtime:

| Хук | Сейчас | Станет |
|---|---|---|
| `use-transactions.ts` | 30s | 15s |
| `use-bank-checks.ts` | default 2m | 15s |
| `use-cashless.ts` | default 2m | 15s |
| `use-cage-transfers.ts` | default 2m | 15s |
| `use-incidents.ts` | default 2m | 15s |
| `use-shift.ts` / `use-shift-tables-result.ts` | default 2m | 15s |
| `use-visits.ts` (Active Players) | default 2m | 15s |

Точные значения проверю при правке. Это страховка на случай если Realtime пропустит конкретное событие — компонент при следующем рендере подтянет свежие данные.

**Не трогаю** словари (employees, chips, casinos, categories) — они меняются редко, `staleTime: 2m` для них правильный.

### 4. Window-level debug helper

В `useRealtimeSubscriptions` экспонирую в `window.__realtimeStatus` объект `{ subscribed: boolean, lastEventAt: number, channelName: string }`. Открыл DevTools — увидел `subscribed: true`, `lastEventAt: 5 сек назад` → канал жив. Это альтернатива удалённому UI-индикатору, доступная только разработчику.

### 5. Версия

Auto-bump patch в `package.json` (1.3.385 → 1.3.386). Backend не трогаем — миграции не нужны (публикация и REPLICA IDENTITY уже корректны).

## Проверка

1. Логин → DevTools Console → ожидаем `[Realtime] ✓ subscribed (casino=...)`.
2. Открыть две вкладки одного казино, в одной поставить транзакцию — во второй данные появляются в пределах 1 сек, без перехода между страницами.
3. В DevTools → Network → throttle Offline 10 сек → Online → в консоли видим `[Realtime] ✗ CLOSED` затем `[Realtime] ✓ subscribed` и автоматический refetch.
4. Свернуть вкладку, изменить данные в другом устройстве, вернуться → данные обновлены сразу (refetchOnWindowFocus сработает по любым stale запросам как страховка).

## Что НЕ делаем

- Не возвращаем UI-индикатор (по решению юзера ранее).
- Не дробим главный канал на несколько (если после диагностики выяснится, что канал стабильно падает — отдельной задачей).
- Не трогаем RLS, миграции, edge-функции.
