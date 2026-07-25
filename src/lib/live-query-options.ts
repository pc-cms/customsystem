/**
 * liveQueryOptions — историческое имя.
 *
 * Ранее переопределял staleTime/refetchOn* на "Realtime-first" (staleTime
 * Infinity, никаких focus-refetch). После перехода на SWR-Focus модель
 * (см. QueryClient defaults в src/App.tsx) единый источник поведения —
 * глобальные дефолты + Realtime-инвалидация. Этот файл оставлен как
 * no-op-алиас для обратной совместимости, чтобы не переписывать десятки
 * `...liveQueryOptions()` в хуках.
 *
 * Индивидуальные хуки могут по-прежнему явно ставить свои опции
 * (staleTime: 0, refetchInterval: ...) — они возьмут верх над no-op.
 */

export const liveQueryOptions = () => ({} as const);

/**
 * liveQueryOptionsWithFallback — теперь просто задаёт staleTime.
 * refetchOn* берутся из глобальных дефолтов.
 */
export const liveQueryOptionsWithFallback = (fallbackMs: number) => ({
  staleTime: fallbackMs,
} as const);
