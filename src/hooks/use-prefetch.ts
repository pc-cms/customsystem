/**
 * Prefetch critical data after login so it's available instantly
 * and cached for offline use.
 * Uses the same query functions as the hooks to ensure DRY consistency.
 */
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useDataScope } from "@/hooks/use-data-scope";
import { getBusinessDate } from "@/lib/business-day";
import { disambiguateNames, mapEmployeeToDealer } from "@/hooks/use-dealers";
import { prefetchRouteChunks } from "@/lib/route-prefetch";

// Shared query functions — must match the hooks in use-casino-data.ts exactly
const queryFns = {
  players: (casinoId: string) => async () => {
    const { data } = await supabase
      .from("players")
      .select("*, player_cards(*), player_tags(*)")
      .eq("casino_id", casinoId)
      .order("last_name");
    return data ?? [];
  },
  visits: (casinoId: string, date: string) => async () => {
    const { data } = await supabase
      .from("casino_visits")
      .select("*, players(first_name, last_name, nickname, photo_url, status, player_tags(tag), id_number)")
      .eq("casino_id", casinoId)
      .eq("date", date);
    return data ?? [];
  },
  tables: (casinoId: string) => async () => {
    const { data } = await supabase
      .from("gaming_tables")
      .select("*")
      .eq("casino_id", casinoId)
      .order("name");
    return data ?? [];
  },
  dealers: (casinoId: string) => async () => {
    // Phase 3: dealers = employees WHERE department='Pit'
    const { data, error } = await supabase
      .from("employees")
      .select("*")
      .eq("casino_id", casinoId)
      .eq("department", "Pit")
      .order("full_name");
    if (error) throw error;
    const raw = data ?? [];
    return disambiguateNames(raw.map(mapEmployeeToDealer), raw);
  },
  currentShift: (casinoId: string) => async () => {
    const { data } = await supabase
      .from("shifts")
      .select("*")
      .eq("casino_id", casinoId)
      .is("closed_at", null)
      .order("opened_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return data ?? null;
  },
};

export function usePrefetchCriticalData() {
  const qc = useQueryClient();
  const { casinoId, user, roles } = useAuth();
  const { isReady } = useDataScope();

  useEffect(() => {
    if (!isReady || !casinoId || !user) return;
    const today = getBusinessDate();

    // Warm lazy route chunks for offline navigation. Idempotent (24h throttle).
    prefetchRouteChunks();

    // Always prefetch players and visits
    qc.prefetchQuery({
      queryKey: ["players", casinoId],
      queryFn: queryFns.players(casinoId),
      staleTime: 1000 * 60 * 5,
    });

    qc.prefetchQuery({
      queryKey: ["casino-visits-live", casinoId, today],
      queryFn: queryFns.visits(casinoId, today),
      staleTime: 1000 * 60 * 2,
    });




    // Prefetch tables + current open shift for cage/pit roles
    if (roles.some(r => ["cashier", "cashier_slots", "pit", "manager", "finance_manager"].includes(r))) {
      qc.prefetchQuery({
        queryKey: ["gaming-tables", casinoId],
        queryFn: queryFns.tables(casinoId),
        staleTime: 1000 * 60 * 5,
      });
      qc.prefetchQuery({
        queryKey: ["current-shift", casinoId],
        queryFn: queryFns.currentShift(casinoId),
        staleTime: 1000 * 30,
      });
    }

    // Prefetch dealers for pit roles
    if (roles.some(r => ["pit", "manager"].includes(r))) {
      qc.prefetchQuery({
        queryKey: ["dealers", casinoId],
        queryFn: queryFns.dealers(casinoId),
        staleTime: 1000 * 60 * 2,
      });
    }
  }, [casinoId, user, roles, qc]);
}
