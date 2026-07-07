/**
 * liveQueryOptions — стандартный набор React Query опций для "живых"
 * запросов, чьи данные удерживаются в актуальном состоянии подписками
 * Realtime (см. `MODULE_LIVE_SPEC` и `useModuleLiveSync`).
 *
 * Идея (Фаза A "Realtime-first"):
 *   - `staleTime: Infinity`  — React Query никогда не считает данные
 *     устаревшими сам по себе. Единственный источник инвалидации —
 *     событие Realtime на соответствующей таблице.
 *   - `refetchOnMount/Focus/Reconnect: false` — переключение вкладок,
 *     возврат в окно, реконнект не вызывают лавины запросов ("тройной F5").
 *   - `gcTime: 24h` — данные остаются в памяти сессии для мгновенного
 *     отображения.
 *
 * Использование:
 *   useQuery({
 *     queryKey: ["dealers", casinoId],
 *     queryFn: fetchDealers,
 *     ...liveQueryOptions(),
 *   })
 *
 * Миграция:
 *   Заменяем `staleTime: 30_000` (или любое короткое) на
 *   `...liveQueryOptions()`. Гарантия свежести — Realtime, а не таймер.
 *
 * Когда НЕ использовать:
 *   - Аналитические/агрегированные RPC, которые нельзя пересчитать по
 *     точечному событию Realtime — оставляем короткий staleTime.
 *   - Данные, где допустимо небольшое отставание, но нет Realtime-канала.
 */

export const liveQueryOptions = () => ({
  staleTime: Infinity as const,
  gcTime: 1000 * 60 * 60 * 24,
  refetchOnMount: false as const,
  refetchOnWindowFocus: false as const,
  refetchOnReconnect: false as const,
});

/**
 * liveQueryOptionsWithFallback — то же, но с fallback-staleTime.
 * Используется, когда таблица подписана на Realtime, но мы хотим
 * страховочный refetch раз в N мс на случай пропущенных событий
 * (например, при длительном разрыве соединения).
 */
export const liveQueryOptionsWithFallback = (fallbackMs: number) => ({
  staleTime: fallbackMs,
  gcTime: 1000 * 60 * 60 * 24,
  refetchOnMount: false as const,
  refetchOnWindowFocus: false as const,
  refetchOnReconnect: false as const,
});
