/**
 * instant-query — единая политика "сегодня мгновенно, история в фоне".
 *
 * Правило:
 *  - Диапазон, который включает текущий бизнес-день = живые данные:
 *    короткий staleTime, refetch при монтировании и возврате во вкладку.
 *  - Прошлые дни / недели / месяцы = практически неизменные данные:
 *    длинный staleTime, без refetch на каждый заход — рендер идёт из кэша
 *    мгновенно, обновление происходит только по инвалидации/realtime.
 *
 * Во всех случаях используем keepPreviousData: при смене дня/месяца экран
 * не мигает пустотой, старые цифры остаются на месте, новые подгружаются
 * фоном.
 */
import { keepPreviousData } from "@tanstack/react-query";
import { getBusinessDate } from "@/lib/business-day";

/** True, когда выбранный диапазон захватывает текущий бизнес-день. */
export function rangeIncludesToday(from?: string | null, to?: string | null): boolean {
  const today = getBusinessDate();
  if (!from && !to) return true;
  return (!from || from <= today) && (!to || to >= today);
}

export function instantRangeOptions(from?: string | null, to?: string | null) {
  const live = rangeIncludesToday(from, to);
  return {
    placeholderData: keepPreviousData,
    staleTime: live ? 15_000 : 10 * 60_000,
    refetchOnMount: (live ? "always" : false) as "always" | false,
    refetchOnWindowFocus: live,
  } as const;
}

/** То же самое для запросов, привязанных к году/месяцу. */
export function instantMonthOptions(year: number, month?: number) {
  if (month == null) return instantRangeOptions(`${year}-01-01`, `${year}-12-31`);
  const last = new Date(year, month, 0).getDate();
  const mm = String(month).padStart(2, "0");
  return instantRangeOptions(`${year}-${mm}-01`, `${year}-${mm}-${String(last).padStart(2, "0")}`);
}
