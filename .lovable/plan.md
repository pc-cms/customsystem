
## 1. Sticky columns Card / Name (LEVEL) — opaque on scroll

**File:** `src/pages/PlayerStatistics.tsx` (~line 747-773)

Today the "Name" sticky column uses translucent tints (e.g. `bg-blue-100/70`, `bg-yellow-500/15`, `bg-muted/40`). When the user scrolls horizontally, the columns underneath show through.

Fix:
- Replace tints in `CATEGORY_NAME_TINT` with **solid** colors (no `/70`, `/15`):
  - diamond → `bg-blue-50 dark:bg-blue-950`
  - platinum → `bg-purple-50 dark:bg-purple-950`
  - gold → `bg-yellow-50 dark:bg-yellow-950`
  - normal → `bg-card`
- Same for the selected-row variant (`bg-primary/10` → keep, but add `backdrop-filter: none` and a solid fallback: wrap in a layer like `bg-card` then overlay `bg-primary/10` is fine because base is solid).
- Card cell (left:0) already uses `bg-card` — keep, but ensure no parent applies opacity.
- Apply the same treatment to any other table that uses translucent sticky cells (search `sticky left-` + `/70|/15|/20|/30|/40`).

## 2. Real-time updates everywhere — fix churn after force-update

**File:** `src/hooks/use-realtime.ts`

Symptoms after a forced page reload: data lags until manual refresh. Causes:
- Channel name uses `Date.now()` → every effect re-run creates a brand-new channel and tears down the prior one (race with WebSocket reconnect leaves a window without listeners).
- Effect deps include `roles` (array) and `allowedModules` (Set). New identity each render triggers full unsubscribe/resubscribe cycles, eating Realtime quota.

Fix:
- Drop `Date.now()` from channel name: `casino:${casinoId}:cms-realtime`.
- Memoize the dependency signature: compute `const modulesKey = useMemo(() => [...allowedModules ?? []].sort().join(","), [allowedModules]);` and `const rolesKey = roles.join(",")`. Use those scalar keys in the effect deps instead of the array/Set references.
- On `SUBSCRIBED` after a reconnect, in addition to `refetchType: "active"`, also call `qc.refetchQueries({ queryKey: ["casino-visits-live"] })` etc. for the small set of *Pit-Boss / Manager dashboards* that must be fresh immediately (table-tracker, breaklist, dealer-attendance, chip-snapshots, pit-rota, players).
- Add a `visibilitychange` + `online` listener at the top of `App.tsx` (or in `useRealtimeSubscriptions`) that triggers `qc.invalidateQueries({ refetchType: "active" })` when the tab becomes visible or network returns. This guarantees the open page is fresh after a wake/reload without user action.

## 3. Pitboss / Manager pages — force fresh data on focus

**Files:** `src/pages/Pit.tsx`, `src/pages/TableTracker.tsx`, `src/pages/Dashboard.tsx`, `src/pages/PlayerStatistics.tsx`

- Set `refetchOnWindowFocus: true` and `refetchOnReconnect: true` for the heavy queries used here (currently they default to false in `queryClient`). Apply per-query (not global) so we don't thrash less critical lists.
- Lower `staleTime` for: `["table-tracker", casinoId]`, `["breaklist", casinoId]`, `["casino-visits-live"]`, `["pit-rota-range"]`, `["dealer-attendance-range"]` to `10_000` ms so realtime gaps are imperceptible.
- Add a single `useEffect` in `AppLayout` listening to `casinoId` change → `qc.invalidateQueries({ refetchType: "active" })` so subdomain switches refresh visibly-mounted data.

## 4. Version + verification

- Bump `package.json` version to `1.3.418`.
- Manual check:
  1. Open Player Statistics, scroll right — Name column stays fully opaque over scrolling columns.
  2. Open Pit / Table Tracker on a second device, edit data on first — second device updates within ~1s without refresh.
  3. Force-reload (Ctrl+Shift+R) and confirm initial data loads in < 2s and updates flow in without further reload.

## Out of scope

- No backend / RPC changes.
- No data-model changes.
- No POS or Cage UI changes beyond the realtime hook.
