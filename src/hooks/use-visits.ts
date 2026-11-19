import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { getBusinessDate } from "@/lib/business-day";
import { liveQueryOptions } from "@/lib/live-query-options";

/**
 * Returns visits for the current business day.
 *
 *  - "In Casino" = visits with date = today AND checked_out_at IS NULL.
 *    A DB trigger guarantees that any active table session re-opens / creates
 *    today's visit, so anyone in Active Players is always present here.
 *  - "Checked out" = visits with date = today AND checked_out_at IS NOT NULL.
 *
 * The 07:00 EAT auto-close cron closes any open visits at the rollover
 * (shift runs until 06:00, so nothing is closed before 07:00).
 *
 * Realtime-first: `casino_visits` is subscribed at App level via
 * useModuleLiveSync (ALWAYS_LIVE). No refetchOnMount/Focus needed.
 */
export const useVisitsToday = (selectFields = "*, players(first_name, last_name, nickname, photo_url, status, id_number, category, player_type, player_cards(*), player_tags(*))") => {
  const { casinoId, roles } = useAuth();
  const isSuper = roles.includes("super_admin");
  const today = getBusinessDate();

  return useQuery({
    queryKey: ["casino-visits-live", casinoId, today, selectFields, isSuper ? "with-ace" : "no-ace"],
    queryFn: async () => {
      if (!casinoId) return [];
      // ACE auto players are Super Admin only on every screen.
      let q: any = supabase
        .from("casino_visits")
        .select(isSuper ? selectFields : `${selectFields}, ace_chk:players!inner(is_ace_auto)`)
        .eq("casino_id", casinoId)
        .eq("date", today);
      if (!isSuper) q = q.eq("ace_chk.is_ace_auto", false);
      const { data, error } = await q.order("checked_in_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!casinoId,
    ...liveQueryOptions(),
  });
};

/**
 * Players with an open visit today in this casino, fetched directly via the
 * visit → player join. Does NOT depend on the global paged players list, so a
 * freshly checked-in player is never missing from cashier / pit screens.
 */
export const useCheckedInPlayers = () => {
  const { casinoId, roles } = useAuth();
  const isSuper = roles.includes("super_admin");
  const today = getBusinessDate();
  return useQuery({
    queryKey: ["casino-visits-live", casinoId, today, "checked-in-players", isSuper ? "with-ace" : "no-ace"],
    queryFn: async () => {
      if (!casinoId) return [] as any[];
      const { data, error } = await supabase
        .from("casino_visits")
        .select("player_id, players(*, player_cards(id, player_id, card_number, rfid_uid, is_active), player_tags(id, player_id, tag))")
        .eq("casino_id", casinoId)
        .eq("date", today)
        .is("checked_out_at", null)
        .order("checked_in_at", { ascending: false })
        .order("id");
      if (error) throw error;
      const seen = new Set<string>();
      return (data || []).flatMap((v: any) => {
        const p = v.players;
        if (!p?.id || seen.has(p.id)) return [];
        if (!isSuper && p.is_ace_auto) return []; // ACE auto players: Super Admin only
        seen.add(p.id);
        return [p];
      });
    },
    enabled: !!casinoId,
    refetchInterval: 30_000,
    ...liveQueryOptions(),
  });
};
