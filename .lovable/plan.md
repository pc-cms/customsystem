
## Что не так

На скриншотах, Arusha, 11/07/2026:
- Dashboard → **Total Drop = 1 655 000**
- Player Tracking (Player Statistics) → **TOTAL DROP = 4 325 000**

Проверил БД напрямую:

```
select sum(peak) from player_day_drop_cache
where casino_id='…Arusha' and business_date='2026-07-11';
-- 4 325 000
```

То есть **правильная цифра — 4 325 000**. Dashboard показывает устаревшее значение.

## Почему так

Оба экрана читают из одного источника (`player_day_drop_cache` через `useTotalDrop` в `src/lib/drop-source.ts`). Хук помечен `staleTime: 30_000` и **обновляется только когда его queryKey (`total-drop-cache`) инвалидирует Realtime-подписка**.

В `src/lib/module-live-spec.ts` таблица `player_day_drop_cache` подписана **только** внутри модуля `pit_active_players` (строка 52). Модуля `dashboard` в списке нет вообще, поэтому на Dashboard подписка на `player_day_drop_cache` не монтируется. Новые `IN`-транзакции обновляют кэш в БД, Player Statistics их видит (модуль подписан), а Dashboard продолжает отдавать значение с момента первого фетча — отсюда 1 655 000 vs 4 325 000.

Это точно тот же класс бага, что раньше был на Reports/Dashboard: «Dashboard drift-ует от Player Statistics», и лечится не в `drop-source.ts`, а в реестре подписок.

## Правка

Единственный файл: `src/lib/module-live-spec.ts`.

Добавить в `MODULE_LIVE_SPEC` запись для модуля `dashboard` (ключ модуля Dashboard в `src/lib/modules.ts` — оставлю тот же, что зарегистрирован у роута `/dashboard`; проверю точное имя перед правкой):

```ts
dashboard: [
  { table: "player_day_drop_cache", queryKeyPrefixes: [
      "total-drop-cache",
      "table-results-drop-cache",
      "players-drop-cache-today",
      "players-drop-cache-range",
  ]},
  { table: "transactions",        queryKeyPrefixes: ["transactions"] },
  { table: "table_daily_results", queryKeyPrefixes: ["table-daily-results", "dashboard-table-results"] },
  { table: "expenses",            queryKeyPrefixes: ["expenses", "expenses-approvals-count"] },
  { table: "casino_visits",       queryKeyPrefixes: ["casino-visits", "casino-visits-live"] },
],
```

Ничего кроме реестра подписок не трогаю: сам `useTotalDrop`, Dashboard.tsx, drop-source.ts, БД, триггеры — остаются как есть. Правила "Drop rule" из core memory не меняются.

## Проверка после правки

1. Открыть Dashboard на Arusha, зафиксировать Total Drop.
2. В другой вкладке провести ещё один IN в Cage.
3. Dashboard должен подхватить новое значение автоматически (без F5), и совпасть с `Player Tracking → TOTAL DROP` и с `SELECT sum(peak) FROM player_day_drop_cache …`.
