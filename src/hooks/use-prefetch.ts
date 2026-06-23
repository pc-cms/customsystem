/**
 * Module-based critical-data prefetch.
 *
 * Runs once per session after login. The matrix is keyed by ModuleKey from
 * the permission system (`useMyModulePermissions`), so users only download
 * data for surfaces they can actually open. A Pit Boss without finance
 * access never prefetches wallets, day-closings, or expenses.
 *
 * Tasks run SEQUENTIALLY on purpose: when multiple tabs/devices share an
 * account, parallel auth-bearing requests can each trigger /token refresh
 * and hit Supabase's 429 ceiling. Sequential = slightly slower warm-up,
 * but no auth blackouts.
 *
 * Always-on tasks: players + visits + business-day-closure. These are the
 * universal "Player" lookup data that every operator needs.
 */
import { useEffect } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useDataScope } from "@/hooks/use-data-scope";
import { useMyModulePermissions } from "@/hooks/use-module-permissions";
import { getBusinessDate } from "@/lib/business-day";
import { disambiguateNames, mapEmployeeToDealer } from "@/hooks/use-dealers";
import { prefetchRouteChunks } from "@/lib/route-prefetch";
import type { ModuleKey } from "@/lib/modules";

const FIVE_MIN = 1000 * 60 * 5;
const TEN_MIN = 1000 * 60 * 10;
const ONE_HOUR = 1000 * 60 * 60;
const ONE_DAY = 1000 * 60 * 60 * 24;

const monthBounds = (today: string) => {
  const [y, m] = today.split("-").map(Number);
  const monthStart = `${y}-${String(m).padStart(2, "0")}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const monthEnd = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { monthStart, monthEnd };
};

type Task = () => Promise<unknown>;

/** Tasks that EVERY authenticated user needs, regardless of module access. */
function alwaysTasks(qc: QueryClient, casinoId: string, today: string): Task[] {
  return [
    () => qc.prefetchQuery({
      queryKey: ["players", casinoId],
      queryFn: async () => {
        const { data } = await supabase
          .from("players")
          .select("*, player_cards(*), player_tags(*)")
          .eq("casino_id", casinoId)
          .order("last_name");
        return data ?? [];
      },
      staleTime: FIVE_MIN,
    }),
    () => qc.prefetchQuery({
      queryKey: ["casino-visits-live", casinoId, today],
      queryFn: async () => {
        const { data } = await supabase
          .from("casino_visits")
          .select("*, players(first_name, last_name, nickname, photo_url, status, player_tags(tag), id_number)")
          .eq("casino_id", casinoId)
          .eq("date", today);
        return data ?? [];
      },
      staleTime: 1000 * 60 * 2,
    }),
    () => qc.prefetchQuery({
      queryKey: ["business-day-closure", casinoId],
      queryFn: async () => {
        const { data } = await supabase
          .from("business_day_closures")
          .select("*")
          .eq("casino_id", casinoId)
          .order("business_date", { ascending: false })
          .limit(1)
          .maybeSingle();
        return data ?? null;
      },
      staleTime: 60_000,
    }),
  ];
}

/**
 * Module → tasks matrix. Each task is a lazy thunk; only enqueued when the
 * module is in the user's `allowedModules` set.
 */
function modulePrefetchTasks(
  module: ModuleKey,
  qc: QueryClient,
  casinoId: string,
  today: string,
): Task[] {
  const { monthStart, monthEnd } = monthBounds(today);

  switch (module) {
    // ──────────── PIT ────────────
    case "pit_dealers":
    case "pit_breaklist":
    case "pit_rota":
    case "pit_attendance":
      return [
        () => qc.prefetchQuery({
          queryKey: ["dealers", casinoId],
          queryFn: async () => {
            const { data, error } = await supabase
              .from("employees").select("*")
              .eq("casino_id", casinoId).eq("department", "Pit").order("full_name");
            if (error) throw error;
            const raw = data ?? [];
            return disambiguateNames(raw.map(mapEmployeeToDealer), raw);
          },
          staleTime: 1000 * 60 * 30,
        }),
        () => qc.prefetchQuery({
          queryKey: ["breaklist", casinoId, today],
          queryFn: async () => {
            const { data, error } = await supabase
              .from("breaklist").select("*")
              .eq("casino_id", casinoId).eq("date", today);
            if (error) throw error;
            return data ?? [];
          },
          staleTime: 60_000,
        }),
        () => qc.prefetchQuery({
          queryKey: ["pit-rota-range", casinoId, monthStart, monthEnd],
          queryFn: async () => {
            const { data, error } = await supabase
              .from("pit_rota").select("*")
              .eq("casino_id", casinoId)
              .gte("date", monthStart).lte("date", monthEnd);
            if (error) throw error;
            return data ?? [];
          },
          staleTime: FIVE_MIN,
        }),
        () => qc.prefetchQuery({
          queryKey: ["dealer-attendance-range", casinoId, monthStart, monthEnd],
          queryFn: async () => {
            const { data, error } = await supabase
              .from("dealer_attendance").select("*")
              .eq("casino_id", casinoId)
              .gte("date", monthStart).lte("date", monthEnd);
            if (error) throw error;
            return data ?? [];
          },
          staleTime: FIVE_MIN,
        }),
      ];

    // ──────────── TABLES ────────────
    case "tables":
    case "table_tracker":
    case "table_results":
      return [
        () => qc.prefetchQuery({
          queryKey: ["gaming-tables", casinoId],
          queryFn: async () => {
            const { data, error } = await supabase
              .from("gaming_tables").select("*")
              .eq("casino_id", casinoId).order("name");
            if (error) throw error;
            return data ?? [];
          },
          staleTime: FIVE_MIN,
        }),
        () => qc.prefetchQuery({
          queryKey: ["chip-baseline", casinoId],
          queryFn: async () => {
            const { data, error } = await supabase
              .from("chip_baseline").select("*").eq("casino_id", casinoId);
            if (error) throw error;
            return data ?? [];
          },
          staleTime: ONE_HOUR * 6,
        }),
        () => qc.prefetchQuery({
          queryKey: ["table-tracker", casinoId, today],
          queryFn: async () => {
            const { data, error } = await supabase
              .from("table_tracker").select("*, gaming_tables(name)")
              .eq("casino_id", casinoId).eq("date", today);
            if (error) throw error;
            return data ?? [];
          },
          staleTime: 60_000,
        }),
      ];

    // ──────────── CAGE ────────────
    case "cage":
    case "cage_view":
    case "closings":
      return [
        () => qc.prefetchQuery({
          queryKey: ["active-shift", casinoId],
          queryFn: async () => {
            const { data } = await supabase
              .from("shifts").select("*")
              .eq("casino_id", casinoId).eq("status", "open").maybeSingle();
            return data ?? null;
          },
          staleTime: 0,
        }),
      ];

    // ──────────── BANK CHECKS ────────────
    case "bank_checks":
      return [
        () => qc.prefetchQuery({
          queryKey: ["bank-checks", casinoId, today, today],
          queryFn: async () => {
            const { data, error } = await supabase
              .from("bank_checks").select("*")
              .eq("casino_id", casinoId).eq("check_date", today);
            if (error) throw error;
            return data ?? [];
          },
          staleTime: 60_000,
        }),
      ];

    // ──────────── EXPENSES ────────────
    case "expenses":
    case "daily_expenses":
      return [
        () => qc.prefetchQuery({
          queryKey: ["expense-categories", casinoId, "all"],
          queryFn: async () => {
            const { data, error } = await supabase
              .from("expense_categories")
              .select("id, casino_id, code, label, scope, active, sort_order")
              .eq("casino_id", casinoId).eq("active", true);
            if (error) throw error;
            return data ?? [];
          },
          staleTime: ONE_DAY,
        }),
        () => qc.prefetchQuery({
          queryKey: ["expenses", casinoId, today],
          queryFn: async () => {
            const { data, error } = await supabase
              .from("expenses").select("*")
              .eq("casino_id", casinoId).eq("business_date", today);
            if (error) throw error;
            return data ?? [];
          },
          staleTime: 60_000,
        }),
      ];

    // ──────────── FINANCE ────────────
    case "finance_dashboard":
    case "finance_wallets":
    case "finance_review":
    case "finance_budget":
    case "finance_cash_count":
      return [
        () => qc.prefetchQuery({
          queryKey: ["fin-wallets", casinoId],
          queryFn: async () => {
            const { data, error } = await supabase
              .from("fin_wallets").select("*, casinos(name, slug)")
              .eq("casino_id", casinoId).order("sort_order");
            if (error) throw error;
            return data ?? [];
          },
          staleTime: ONE_HOUR * 6,
        }),
        () => qc.prefetchQuery({
          queryKey: ["fin-categories"],
          queryFn: async () => {
            const { data, error } = await supabase
              .from("fin_categories").select("*").order("sort_order");
            if (error) throw error;
            return data ?? [];
          },
          staleTime: ONE_DAY,
        }),
      ];

    // ──────────── PLAYER TRACKER ────────────
    case "pit_active_players":
      return [
        () => qc.prefetchQuery({
          queryKey: ["player_daily_zones", casinoId, today],
          queryFn: async () => {
            const { data, error } = await supabase
              .from("player_daily_zones").select("player_id, zone")
              .eq("casino_id", casinoId).eq("business_date", today);
            if (error) throw error;
            return data ?? [];
          },
          staleTime: 30_000,
        }),
      ];

    // ──────────── STAFF / HR ────────────
    case "staff_employees":
    case "staff_rota":
    case "staff_attendance":
    case "employee_playlist":
      return [
        () => qc.prefetchQuery({
          queryKey: ["staff_members", casinoId],
          queryFn: async () => {
            const { data, error } = await supabase
              .from("employees").select("*")
              .eq("casino_id", casinoId).neq("department", "Pit")
              .order("department").order("full_name");
            if (error) throw error;
            return data ?? [];
          },
          staleTime: 1000 * 60 * 30,
        }),
      ];

    // Other modules: lazy-load on first navigation.
    default:
      return [];
  }
}

async function runSequential(tasks: Task[]) {
  for (const task of tasks) {
    try { await task(); } catch { /* keep warming the rest */ }
  }
}

export function usePrefetchCriticalData() {
  const qc = useQueryClient();
  const { casinoId, user, roles } = useAuth();
  const { isReady } = useDataScope();
  const { data: allowedModules } = useMyModulePermissions();

  useEffect(() => {
    if (!isReady || !casinoId || !user || allowedModules === undefined) return;
    const today = getBusinessDate();

    // Warm route chunks only for modules the user can open (Step 3 will
    // tighten this further; for now still warms everything as a fallback
    // for offline navigation).
    prefetchRouteChunks();

    const tasks: Task[] = [...alwaysTasks(qc, casinoId, today)];
    const isSuperAdmin = roles.includes("super_admin");

    // Iterate every known module; super-admin = all, otherwise filter.
    const moduleSet = isSuperAdmin
      ? new Set<string>(allModuleKeys)
      : allowedModules;

    for (const key of moduleSet) {
      tasks.push(...modulePrefetchTasks(key as ModuleKey, qc, casinoId, today));
    }

    // Fire-and-forget; sequential.
    void runSequential(tasks);
  }, [isReady, casinoId, user, roles, allowedModules, qc]);
}

// Module keys we know how to prefetch (used for super-admin path).
const allModuleKeys: ModuleKey[] = [
  "pit_dealers", "pit_breaklist", "pit_rota", "pit_attendance", "pit_active_players",
  "tables", "table_tracker", "table_results",
  "cage", "cage_view", "closings",
  "bank_checks", "expenses", "daily_expenses",
  "finance_dashboard", "finance_wallets", "finance_review", "finance_budget", "finance_cash_count",
  "staff_employees", "staff_rota", "staff_attendance", "employee_playlist",
];
