## Что происходит

Симптомы у Тараса (роль `manager`, casino = Arusha) в инкогнито / после `Ctrl+Shift+R`:

- Breaklist пустой
- Weekly/Monthly Bonus показывает **"No staff found"**
- Очень долгая «загрузка», но данные в БД есть (29 dealers в Arusha, проверил)

## Корневая причина

Не one bug — а связка трёх вещей при холодном старте:

### 1. UI рисует «empty state» во время загрузки, а не лоадер

В `WeeklyBonus.tsx` и `MonthlyTips.tsx`:

```tsx
const { data: dealers = [] } = useDealers();
...
{rows.length === 0 && <td>No staff found</td>}
```

`useDealers` имеет `enabled: !!casinoId`. Пока `casinoId` ещё не разрешён (см. п.2), React Query возвращает `data: undefined, isLoading: false` (т.к. query disabled). Из-за `= []` дефолта `dealers` = `[]` → UI сразу пишет **"No staff found"** вместо «Loading…». Тот же шаблон в `BreaklistGrid` и других местах, где есть `dealers = []` без проверки `isLoading`/`isFetching`/`auth.loading`.

### 2. Окно, в котором `casinoId` ещё `null`, но компоненты уже монтируются

Цепочка инициализации:

```text
getSession → processSession → loadProfileForUser (async fetch profile+roles)
                                       ↓
                                  setProfileCasinoId(arusha)
                                       ↓
CasinoProvider: subdomain "arusha" lookup → setActiveCasinoId(arusha)
                                       ↓
                                  overrideCasinoId(arusha) → auth.casinoId = arusha
                                       ↓
                                  useDealers/useStaffMembers фактически фаерят
```

`AuthProvider.loading` уже считает `profileLoading`, но **CasinoProvider.loading никак не пробрасывается в auth-context'овский `loading`**, и страницы не ждут «готов ли реально активный casino». Между «authReady=true» и «overrideCasinoId дошёл» — есть кадры, когда `casinoId === null`. Хук `usePrefetchCriticalData` тоже видит `casinoId === null` и не префетчит, пока не подтянется override.

### 3. Тяжёлый первый прогрев в инкогнито

Кэшей IndexedDB нет → одновременно стреляют:
- `players` (full select + `player_cards` + `player_tags`, p_mean 76ms, max 1.47s)
- `casino_visits`
- `dealers`
- `gaming-tables`
- `current-shift`
- кучка realtime подписок
- роутерный `prefetchRouteChunks()`

На 3G/слабом канале это субъективно «долго-долго». Это **усиливает** п.1/п.2: окно пустого состояния держится несколько секунд.

Дополнительно фон: `breaklist` запрос — топ по `total_ms` (1.1M ms / 62k вызовов). Это говорит о слишком частом перезапросе, который добивает быстродействие на холодном старте.

## Что меняем

Точечно во фронтенде, без бэка:

### A. Различаем «грузится» и «реально пусто»

`src/lib/auth-context.tsx` — экспортируем `authReady` отдельно от `loading`, и `loading` в контексте оставляем «session + profile». Цель: иметь явный флаг `isAuthSettled = authReady && !profileLoading && !!casinoId`.

`src/lib/casino-context.tsx` — экспортируем `casinoReady` (subdomain lookup закончен и `activeCasinoId` выставлен либо явно null для summary mode).

Создаём `src/hooks/use-data-scope.ts`:

```ts
export function useDataScope() {
  const { casinoId, loading: authLoading } = useAuth();
  const { isSummaryMode, loading: casinoLoading } = useCasino();
  const isReady = !authLoading && !casinoLoading && (isSummaryMode || !!casinoId);
  return { casinoId, isReady };
}
```

### B. Поправляем «No staff found» / пустые гриды

В `WeeklyBonus.tsx`, `MonthlyTips.tsx`, `BreaklistGrid.tsx` (и аналогичных «персонал»-страницах) использовать `useDealers()`/`useStaffMembers()` с полным состоянием, а не `data = []`:

```tsx
const { data: dealers, isPending, isFetching } = useDealers();
const { isReady } = useDataScope();
const showSkeleton = !isReady || isPending || (isFetching && !dealers);
```

Заменить блок `rows.length === 0` на: если `showSkeleton` — skeleton-строки/спиннер, иначе — текущий «No staff found».

### C. Прогрев тяжёлых запросов делаем дружелюбнее

`src/hooks/use-prefetch.ts`:
- стартовать ТОЛЬКО когда `useDataScope().isReady === true` (а не просто `casinoId && user`) — чтобы не делать «пустой проход» с устаревшим `casinoId`
- `players` префетч развязать на 2 шага: сначала лёгкий `players` без join'ов player_cards/player_tags (для списков/поиска), потом «жирный» вариант — низким приоритетом (`requestIdleCallback`/`setTimeout(…, 0)`), чтобы не блокировал dealers/visits/tables.

### D. Снизить «breaklist storm»

`src/hooks/use-dealers.ts` / `use-casino-data.ts` — для `breaklist` запросов: увеличить `staleTime` (минимум 30–60 сек для текущего слота, дольше для прошлых дней), убрать дубль-подписки. 62k вызовов / `mean 17ms` — это активный поллинг + лишние подписчики. План: пройтись по всем `useBreaklist*` хукам, выставить единый `staleTime` и переиспользовать один источник в `BreaklistGrid` вместо нескольких параллельных консьюмеров.

### E. Авто-восстановление, если `getSession` всё-таки завис

`auth-context.tsx`: в текущем safety-timeout'е (5s) при принудительной готовности — если сессии нет, но в `localStorage` под ключом `sb-…-auth-token` лежит токен, повторно дёрнуть `supabase.auth.refreshSession()`. Это закрывает кейс «authReady стал true без сессии → casinoId навсегда null → все хуки навсегда disabled → UI навсегда "пусто"».

## Файлы

```text
src/lib/auth-context.tsx           — экспорт authReady, fallback refreshSession после таймаута
src/lib/casino-context.tsx         — экспорт casinoReady/loading
src/hooks/use-data-scope.ts        — новый хук isReady
src/hooks/use-prefetch.ts          — стартовать по isReady, разнести players prefetch
src/hooks/use-dealers.ts           — staleTime/dedup для breaklist хуков
src/hooks/use-casino-data.ts       — реэкспорт useDataScope
src/components/pit/BreaklistGrid.tsx
src/pages/WeeklyBonus.tsx
src/pages/MonthlyTips.tsx
src/pages/TipsAndBonuses.tsx       — если использует ту же логику
```

Версию package.json НЕ бампим — изменения чисто фронтовые.

## Что НЕ трогаем

- RLS, БД-функции, edge-функции, миграции
- Логику расчётов бонусов / breaklist
- Внешний вид страниц (только loader vs empty)
- `src/integrations/supabase/client.ts`

## Проверка

1. Залогиниться Тарасом в инкогнито на `arusha.casinosystem.app` → Breaklist показывает skeleton, потом 29 дилеров. Без «No staff found» мгновенно.
2. `Ctrl+Shift+R` на `/bonuses/weekly` → видим лоадер, потом список, не пустой стейт.
3. В DevTools Network: `players?...select=*,player_cards,player_tags` приходит вторым волной, не блокируя dealers/visits.
4. Тест-кейс «getSession завис»: эмулировать throttling Slow 3G + блок `/auth/v1/token` → через 5с авто-refresh, casinoId всё равно подтягивается.
