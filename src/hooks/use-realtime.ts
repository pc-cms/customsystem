import { useEffect, useMemo, useRef } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCasino } from "@/lib/casino-context";
import { useMyModulePermissions } from "@/hooks/use-module-permissions";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";

/**
 * Realtime subscriptions, module-aware.
 *
 * One channel per casino (fewer reconnects, fewer auth handshakes) — but
 * each `.on('postgres_changes', ...)` filter is conditionally attached
 * based on the user's `allowedModules`. Pit-Boss without finance access
 * never receives expense/wallet/day-closing events, never invalidates
 * unrelated query keys.
 *
 * Catch-up after disconnect/sleep:
 *  - Active query keys (currently visible page) → refetch
 *  - Other keys (cached but off-screen) → mark stale; React Query refetches
 *    silently on next mount → stale-while-revalidate, no flicker.
 *
 * Filters use the ACTIVE casino (subdomain), not the user's profile
 * casino, so cross-casino accounts work correctly.
 */

type Channel = ReturnType<typeof supabase.channel>;

const debounceMap = new Map<string, NodeJS.Timeout>();

/** Debounced invalidate — collapses a burst of Realtime events into one refetch. */
function debouncedInvalidate(qc: QueryClient, key: string, queryKey: unknown[], wait = 250) {
  const prev = debounceMap.get(key);
  if (prev) clearTimeout(prev);
  debounceMap.set(
    key,
    setTimeout(() => {
      debounceMap.delete(key);
      qc.invalidateQueries({ queryKey });
    }, wait),
  );
}

export const useRealtimeSubscriptions = () => {
  const qc = useQueryClient();
  const { activeCasinoId: casinoId } = useCasino();
  const { roles } = useAuth();
  const { data: allowedModules } = useMyModulePermissions();
  const channelRef = useRef<Channel | null>(null);
  const wasDisconnectedRef = useRef(false);
  const subscribedOnceRef = useRef(false);

  // Stable scalar keys — array/Set identity changes every render and would
  // tear down + rebuild the channel on each parent re-render, leaking
  // websocket handshakes and creating gaps where no listener is attached.
  const rolesKey = useMemo(() => [...roles].sort().join(","), [roles]);
  const modulesKey = useMemo(
    () => (allowedModules ? [...allowedModules].sort().join(",") : "__undef__"),
    [allowedModules],
  );

  useEffect(() => {
    if (!casinoId) return;
    // Wait for modules to load — otherwise we'd subscribe to nothing
    // and then have to tear down & rebuild as soon as they arrive.
    if (allowedModules === undefined) return;

    const isSuperAdmin = roles.includes("super_admin");
    const has = (mod: string) => isSuperAdmin || allowedModules.has(mod);

    // Cleanup previous channel fully before creating new one
    const prevChannel = channelRef.current;
    channelRef.current = null;
    if (prevChannel) {
      supabase.removeChannel(prevChannel);
    }
    subscribedOnceRef.current = false;

    // Stable channel name (no Date.now()): a re-render of the parent must
    // not produce a brand-new channel each time.
    const channelName = `casino:${casinoId}:cms-realtime`;
    const status = (window as any).__realtimeStatus ?? {};
    status.channelName = channelName;
    status.subscribed = false;
    status.lastEventAt = 0;
    (window as any).__realtimeStatus = status;

    try {
      let channel = supabase.channel(channelName);

      // ═════════════ CORE (always-on for everyone) ═════════════
      // Players + cards + tags — global player base, universal.
      channel = channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "players" },
        (payload) => {
          debouncedInvalidate(qc, "players", ["players"]);
          debouncedInvalidate(qc, "player-economy", ["player-economy"]);

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
        },
      )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "player_tags" },
          () => debouncedInvalidate(qc, "players", ["players"]),
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "player_cards" },
          () => debouncedInvalidate(qc, "players", ["players"]),
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "casino_visits", filter: `casino_id=eq.${casinoId}` },
          () => debouncedInvalidate(qc, "casino-visits-live", ["casino-visits-live"]),
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "business_day_closures", filter: `casino_id=eq.${casinoId}` },
          () => {
            debouncedInvalidate(qc, "business-day-closure", ["business-day-closure"]);
            debouncedInvalidate(qc, "effective-business-date", ["effective-business-date"]);
            debouncedInvalidate(qc, "business-day-history", ["business-day-history"]);
          },
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "player_notes" },
          () => {
            debouncedInvalidate(qc, "player-notes", ["player-notes"]);
            debouncedInvalidate(qc, "player-profile", ["player-profile"]);
          },
        );

      // ═════════════ PIT (breaklist / rota / dealers / attendance) ═════════════
      if (has("pit_breaklist") || has("pit_rota") || has("pit_attendance") || has("pit_dealers")) {
        channel = channel
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "breaklist", filter: `casino_id=eq.${casinoId}` },
            () => debouncedInvalidate(qc, `breaklist:${casinoId}`, ["breaklist", casinoId]),
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "dealer_attendance", filter: `casino_id=eq.${casinoId}` },
            () => debouncedInvalidate(qc, `dealer-att:${casinoId}`, ["dealer-attendance-range", casinoId]),
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "pit_rota", filter: `casino_id=eq.${casinoId}` },
            () => debouncedInvalidate(qc, `pit-rota:${casinoId}`, ["pit-rota-range", casinoId]),
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "staff_rota", filter: `casino_id=eq.${casinoId}` },
            () => {
              debouncedInvalidate(qc, `staff-rota-range:${casinoId}`, ["staff-rota-range", casinoId]);
              debouncedInvalidate(qc, `staff-rota:${casinoId}`, ["staff-rota", casinoId]);
            },
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "staff_attendance", filter: `casino_id=eq.${casinoId}` },
            () => {
              debouncedInvalidate(qc, `staff-att-range:${casinoId}`, ["staff-attendance-range", casinoId]);
              debouncedInvalidate(qc, `staff-att:${casinoId}`, ["staff-attendance", casinoId]);
            },
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "rota_locks", filter: `casino_id=eq.${casinoId}` },
            () => debouncedInvalidate(qc, `rota-locks:${casinoId}`, ["rota-locks", casinoId]),
          );
      }

      // ═════════════ TABLES / CHIP COUNTS ═════════════
      // Pit accounts also depend on Chip Count events even when their matrix is
      // mostly Live Game. Keep this subscription broad and casino-scoped.
      if (
        has("tables") || has("table_tracker") || has("table_results") ||
        has("pit_breaklist") || has("pit_rota") || has("pit_attendance") || has("pit_dealers") ||
        roles.includes("pit")
      ) {
        channel = channel
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "table_tracker", filter: `casino_id=eq.${casinoId}` },
            () => debouncedInvalidate(qc, `table-tracker:${casinoId}`, ["table-tracker", casinoId]),
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "chip_snapshots", filter: `casino_id=eq.${casinoId}` },
            () => {
              debouncedInvalidate(qc, `chip-snap:${casinoId}`, ["chip-snapshots", casinoId]);
              debouncedInvalidate(qc, `chip-snap-full:${casinoId}`, ["chip-snapshots-full", casinoId]);
              debouncedInvalidate(qc, `dashboard-table-results:${casinoId}`, ["dashboard-table-results", casinoId]);
              debouncedInvalidate(qc, "shift_tables_result", ["shift_tables_result_total"]);
            },
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "gaming_tables", filter: `casino_id=eq.${casinoId}` },
            () => {
              debouncedInvalidate(qc, "gaming-tables", ["gaming-tables"]);
              debouncedInvalidate(qc, `table-tracker:${casinoId}`, ["table-tracker", casinoId]);
            },
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "table_head_count", filter: `casino_id=eq.${casinoId}` },
            () => debouncedInvalidate(qc, `table-head-count:${casinoId}`, ["table-head-count", casinoId]),
          );
      }

      // ═════════════ CAGE ═════════════
      if (has("cage") || has("cage_view") || has("closings")) {
        channel = channel
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "transactions", filter: `casino_id=eq.${casinoId}` },
            () => {
              debouncedInvalidate(qc, "transactions", ["transactions"]);
              debouncedInvalidate(qc, "player-economy", ["player-economy"]);
            },
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "shifts", filter: `casino_id=eq.${casinoId}` },
            () => {
              debouncedInvalidate(qc, "shifts", ["shifts"]);
              debouncedInvalidate(qc, "shift", ["shift"]);
              debouncedInvalidate(qc, "active-shift", ["active-shift"]);
              debouncedInvalidate(qc, "shift_tables_result", ["shift_tables_result_total"]);
            },
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "cage_transfers", filter: `casino_id=eq.${casinoId}` },
            () => {
              debouncedInvalidate(qc, "cage-transfers", ["cage-transfers"]);
              debouncedInvalidate(qc, "shift-table-adjustments", ["shift-table-adjustments"]);
              debouncedInvalidate(qc, `dashboard-table-results:${casinoId}`, ["dashboard-table-results", casinoId]);
              debouncedInvalidate(qc, "shift_tables_result", ["shift_tables_result_total"]);
            },
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "cashless_transactions", filter: `casino_id=eq.${casinoId}` },
            () => {
              debouncedInvalidate(qc, "cashless", ["cashless"]);
              debouncedInvalidate(qc, "cashless-transactions", ["cashless-transactions"]);
            },
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "player_chip_adjustments", filter: `casino_id=eq.${casinoId}` },
            () => {
              debouncedInvalidate(qc, "pca", ["player-chip-adjustments"]);
              debouncedInvalidate(qc, "player-economy", ["player-economy"]);
            },
          );
      }

      // ═════════════ BANK CHECKS ═════════════
      if (has("bank_checks")) {
        channel = channel.on(
          "postgres_changes",
          { event: "*", schema: "public", table: "bank_checks", filter: `casino_id=eq.${casinoId}` },
          () => {
            debouncedInvalidate(qc, "bank-checks", ["bank-checks"]);
            debouncedInvalidate(qc, "cash-checks-by-date", ["cash-checks-by-date"]);
            debouncedInvalidate(qc, "player-economy", ["player-economy"]);
          },
        );
      }

      // ═════════════ EXPENSES ═════════════
      if (has("expenses") || has("daily_expenses") || has("expenses_approvals")) {
        channel = channel.on(
          "postgres_changes",
          { event: "*", schema: "public", table: "expenses", filter: `casino_id=eq.${casinoId}` },
          () => {
            debouncedInvalidate(qc, "expenses", ["expenses"]);
            debouncedInvalidate(qc, "player-economy", ["player-economy"]);
          },
        );
      }

      // ═════════════ PLAYER TRACKER ═════════════
      if (has("pit_active_players")) {
        channel = channel
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "player_daily_zones", filter: `casino_id=eq.${casinoId}` },
            () => {
              debouncedInvalidate(qc, "pdz", ["player_daily_zones"]);
              debouncedInvalidate(qc, "casino-visits-live", ["casino-visits-live"]);
            },
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "player_daily_avg_bets", filter: `casino_id=eq.${casinoId}` },
            () => {
              debouncedInvalidate(qc, "pdab", ["player-daily-avg-bets"]);
              debouncedInvalidate(qc, "player-economy", ["player-economy"]);
            },
          );
      }

      // ═════════════ LOGS ═════════════
      if (has("logs")) {
        channel = channel.on(
          "postgres_changes",
          { event: "*", schema: "public", table: "activity_logs", filter: `casino_id=eq.${casinoId}` },
          () => debouncedInvalidate(qc, "activity-logs", ["activity-logs"], 500),
        );
      }

      channel.subscribe((subStatus, err) => {
        if (subStatus === "SUBSCRIBED") {
          status.subscribed = true;
          status.lastEventAt = Date.now();
          console.info(`[Realtime] ✓ subscribed (casino=${casinoId})`);
          if (subscribedOnceRef.current && wasDisconnectedRef.current) {
            wasDisconnectedRef.current = false;
            // Catch-up: refetch the active page (visible to the user), and
            // mark everything else stale so it refreshes silently on next
            // mount (stale-while-revalidate) — no flicker.
            qc.invalidateQueries({ refetchType: "active" });
            qc.invalidateQueries({ refetchType: "none" });
            // Force-refresh the Pit-Boss / Manager operational keys so the
            // dashboards reflect any edits made while disconnected, even if
            // the corresponding screen is not currently mounted.
            const HOT_KEYS = [
              ["table-tracker", casinoId],
              ["breaklist", casinoId],
              ["pit-rota-range", casinoId],
              ["dealer-attendance-range", casinoId],
              ["casino-visits-live"],
              ["chip-snapshots", casinoId],
              ["dashboard-table-results", casinoId],
              ["players"],
            ];
            for (const k of HOT_KEYS) {
              qc.invalidateQueries({ queryKey: k });
            }
          }
          subscribedOnceRef.current = true;
        } else if (
          subStatus === "CHANNEL_ERROR" ||
          subStatus === "TIMED_OUT" ||
          subStatus === "CLOSED"
        ) {
          status.subscribed = false;
          wasDisconnectedRef.current = true;
          console.warn(`[Realtime] ✗ ${subStatus}`, err ?? "");
        }
      });

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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- scalar keys cover the Set/array deps
  }, [casinoId, qc, modulesKey, rolesKey]);
};
