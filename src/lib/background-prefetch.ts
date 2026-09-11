/**
 * Фоновая предзагрузка "недели/месяца".
 *
 * Правило: экран за СЕГОДНЯ ничего лишнего не грузит. Более широкие периоды
 * (последние 7 дней, текущий месяц) подтягиваются позже — в простое браузера,
 * по одному запросу, только при активной вкладке и живой сети. Любая ошибка
 * тихо игнорируется: это только прогрев кэша.
 */
import type { QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchBreaklistRows } from "@/hooks/use-dealers";
import { getBusinessDate } from "@/lib/business-day";

const IDLE_STALE = 5 * 60_000;

const idle = (fn: () => void, timeout = 4000) => {
  const ric = (window as any).requestIdleCallback as
    | ((cb: () => void, o?: { timeout: number }) => number)
    | undefined;
  if (ric) ric(fn, { timeout });
  else window.setTimeout(fn, timeout);
};

const canRun = () =>
  typeof document !== "undefined" &&
  document.visibilityState === "visible" &&
  navigator.onLine !== false;

const shiftDate = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

const monthBounds = (iso: string) => {
  const [y, m] = iso.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  const mm = String(m).padStart(2, "0");
  return { from: `${y}-${mm}-01`, to: `${y}-${mm}-${String(last).padStart(2, "0")}` };
};

/** Последовательный прогон задач по одной, каждая — в отдельном idle-окне. */
function runSequentially(tasks: Array<() => Promise<unknown>>) {
  let i = 0;
  const step = () => {
    if (i >= tasks.length) return;
    if (!canRun()) {
      idle(step, 10_000);
      return;
    }
    const task = tasks[i++];
    task().catch(() => {}).finally(() => idle(step, 2000));
  };
  idle(step, 3000);
}

/**
 * Прогревает кэш недели/месяца для Брейк-листа и Офиса.
 * Вызывается один раз после того, как основной экран уже отрисован.
 */
export function prefetchWeekAndMonth(qc: QueryClient, casinoId: string) {
  if (!casinoId) return;
  const today = getBusinessDate();
  const month = monthBounds(today);
  const weekFrom = shiftDate(today, -6);

  const tasks: Array<() => Promise<unknown>> = [];

  // Брейк-лист: последние 6 дней (сегодня уже загружен экраном).
  for (let d = 1; d <= 6; d++) {
    const date = shiftDate(today, -d);
    tasks.push(() =>
      qc.prefetchQuery({
        queryKey: ["breaklist", casinoId, date],
        queryFn: async () =>
          (await fetchBreaklistRows(casinoId, date)).map((b: any) => ({ ...b, dealer_id: b.employee_id })),
        staleTime: IDLE_STALE,
      }),
    );
  }

  // Офис: закрытия дня за текущий месяц.
  tasks.push(() =>
    qc.prefetchQuery({
      queryKey: ["fin-day-closing-list", casinoId, month.from, month.to],
      queryFn: async () => {
        const { data, error } = await supabase
          .from("fin_day_closing")
          .select("*")
          .eq("casino_id", casinoId)
          .gte("business_date", month.from)
          .lte("business_date", month.to)
          .order("business_date", { ascending: false })
          .limit(60);
        if (error) throw error;
        return data;
      },
      staleTime: IDLE_STALE,
    }),
  );

  // Офис: расходы за текущий месяц (тот же запрос, что и на экране).
  tasks.push(() =>
    qc.prefetchQuery({
      queryKey: ["fin-expenses", casinoId, month.from, month.to],
      queryFn: async () => {
        const { data, error } = await supabase
          .from("expenses")
          .select("*, fin_categories(name, group_name), fin_wallets(name, currency)")
          .eq("casino_id", casinoId)
          .gte("business_date", month.from)
          .lte("business_date", month.to)
          .order("business_date", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(500);
        if (error) throw error;
        return data;
      },
      staleTime: IDLE_STALE,
    }),
  );

  // Player Statistics: недельное окно drop-кэша (лёгкая агрегированная таблица).
  tasks.push(() =>
    qc.prefetchQuery({
      queryKey: ["players-drop-cache-range", casinoId, weekFrom, today],
      queryFn: async () => {
        const { data, error } = await supabase
          .from("player_day_drop_cache")
          .select("player_id, business_date, drop_amount")
          .eq("casino_id", casinoId)
          .gte("business_date", weekFrom)
          .lte("business_date", today);
        if (error) throw error;
        return data;
      },
      staleTime: IDLE_STALE,
    }),
  );

  runSequentially(tasks);
}
