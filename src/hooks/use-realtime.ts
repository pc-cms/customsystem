import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCasino } from "@/lib/casino-context";
import { toast } from "sonner";
import { markRealtimeEvent, setRealtimeStatus } from "@/lib/realtime-status";

/**
 * Realtime subscriptions for wired LAN environment.
 * Always uses full Supabase realtime — no polling fallback needed.
 * Brief disconnections are handled by Supabase client reconnection.
 *
 * CRITICAL: filters use the ACTIVE casino (from subdomain), not the user's
 * profile casino. Otherwise a user whose profile is in Mwanza but currently
 * working on the Arusha subdomain would receive events for the wrong casino,
 * and worse — invalidations from another casino could trigger refetches in
 * the active one.
 */
export const useRealtimeSubscriptions = () => {
  const qc = useQueryClient();
  const { activeCasinoId: casinoId } = useCasino();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const crossChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!casinoId) return;

    // Cleanup previous channel fully before creating new one
    const prevChannel = channelRef.current;
    channelRef.current = null;
    if (prevChannel) {
      supabase.removeChannel(prevChannel);
    }

    try {
      const channel = supabase
        .channel(`casino:${casinoId}:cms-realtime-${Date.now()}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "transactions", filter: `casino_id=eq.${casinoId}` },
          () => {
            qc.invalidateQueries({ queryKey: ["transactions"] });
            qc.invalidateQueries({ queryKey: ["player-economy"] });
          }
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "players" },
          (payload) => {
            qc.invalidateQueries({ queryKey: ["players"] });
            qc.invalidateQueries({ queryKey: ["player-economy"] });

            if (payload.eventType === "UPDATE" && payload.new && payload.old) {
              const newRow = payload.new as any;
              const oldRow = payload.old as any;

              if (newRow.status === "blacklist" && oldRow.status !== "blacklist") {
                toast.error(`🚫 ${newRow.first_name} ${newRow.last_name} added to blacklist`, { duration: 8000 });
              } else if (oldRow.status === "blacklist" && newRow.status !== "blacklist") {
                toast.info(`✅ ${newRow.first_name} ${newRow.last_name} removed from blacklist`, { duration: 6000 });
              }

              if (newRow.category !== oldRow.category) {
                const upgrades = ["diamond", "platinum"];
                if (upgrades.includes(newRow.category)) {
                  toast.info(`⭐ ${newRow.first_name} ${newRow.last_name} upgraded to ${newRow.category.toUpperCase()}`, { duration: 5000 });
                }
              }
            }

            if (payload.eventType === "INSERT" && payload.new) {
              const newPlayer = payload.new as any;
              if (newPlayer.casino_id !== casinoId) {
                toast.info(`👤 New player registered: ${newPlayer.first_name} ${newPlayer.last_name}`, { duration: 4000 });
              }
            }
          }
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "breaklist", filter: `casino_id=eq.${casinoId}` },
          () => {
            markRealtimeEvent("breaklist");
            qc.invalidateQueries({ queryKey: ["breaklist", casinoId] });
          }
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "dealer_attendance", filter: `casino_id=eq.${casinoId}` },
          () => {
            markRealtimeEvent("dealer_attendance");
            qc.invalidateQueries({ queryKey: ["dealer-attendance-range", casinoId] });
          }
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "expenses", filter: `casino_id=eq.${casinoId}` },
          () => {
            qc.invalidateQueries({ queryKey: ["expenses"] });
            qc.invalidateQueries({ queryKey: ["player-economy"] });
          }
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "player_tags" },
          () => { qc.invalidateQueries({ queryKey: ["players"] }); }
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "player_cards" },
          () => { qc.invalidateQueries({ queryKey: ["players"] }); }
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "table_tracker", filter: `casino_id=eq.${casinoId}` },
          () => {
            markRealtimeEvent("table_tracker");
            qc.invalidateQueries({ queryKey: ["table-tracker", casinoId] });
          }
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "chip_snapshots", filter: `casino_id=eq.${casinoId}` },
          () => {
            markRealtimeEvent("chip_snapshots");
            qc.invalidateQueries({ queryKey: ["chip-snapshots", casinoId] });
            qc.invalidateQueries({ queryKey: ["chip-snapshots-full", casinoId] });
          }
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "pit_rota", filter: `casino_id=eq.${casinoId}` },
          () => {
            markRealtimeEvent("pit_rota");
            qc.invalidateQueries({ queryKey: ["pit-rota-range", casinoId] });
          }
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "activity_logs", filter: `casino_id=eq.${casinoId}` },
          () => { qc.invalidateQueries({ queryKey: ["activity-logs"] }); }
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "casino_visits", filter: `casino_id=eq.${casinoId}` },
          () => { qc.invalidateQueries({ queryKey: ["casino-visits-live"] }); }
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "gaming_tables", filter: `casino_id=eq.${casinoId}` },
          () => {
            qc.invalidateQueries({ queryKey: ["gaming-tables"] });
            qc.invalidateQueries({ queryKey: ["table-tracker", casinoId] });
          }
        )
        .subscribe();

      channelRef.current = channel;
    } catch (err) {
      console.error("[Realtime] Failed to setup channel:", err);
    }

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [casinoId, qc]);
};
