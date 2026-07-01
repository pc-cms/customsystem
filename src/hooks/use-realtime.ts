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
        )
        // Drop-split (Player Statistics / Dashboard) must update in realtime
        // for ALL roles, not only those with cage access. Pit-Boss + Manager
        // without cage module otherwise had to F5 to see new Drop values.
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "transactions", filter: `casino_id=eq.${casinoId}` },
          () => {
            debouncedInvalidate(qc, "players-drop-split", ["players-drop-split"]);
            debouncedInvalidate(qc, "tables-drop-split", ["tables-drop-split"]);
            debouncedInvalidate(qc, "player-drop-split", ["player-drop-split"]);
            debouncedInvalidate(qc, "dashboard-table-results", ["dashboard-table-results", casinoId]);
          },
        )
        // Materialized per-table Drop cache — updated by triggers on transactions.
        // Subscribing directly lets dashboards refresh instantly without waiting
        // for the heavy compute_tables_drop_split RPC.
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "table_day_drop_cache", filter: `casino_id=eq.${casinoId}` },
          () => {
            debouncedInvalidate(qc, "tables-drop-cache-today", ["tables-drop-cache-today"]);
          },
        )
        // Per-player Drop cache — single source of truth used by Tables (seated
        // players), Player Statistics, and PlayerPreviewHeader. Subscribing here
        // keeps Σ players-cache ≡ Σ tables-cache without waiting for any RPC.
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "player_day_drop_cache", filter: `casino_id=eq.${casinoId}` },
          () => {
            debouncedInvalidate(qc, "players-drop-cache-today", ["players-drop-cache-today"]);
            debouncedInvalidate(qc, "players-drop-cache-range", ["players-drop-cache-range"]);
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
              debouncedInvalidate(qc, "players-drop-split", ["players-drop-split"]);
              debouncedInvalidate(qc, "tables-drop-split", ["tables-drop-split"]);
              debouncedInvalidate(qc, "player-drop-split", ["player-drop-split"]);
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
              debouncedInvalidate(qc, "shifts-tables-result", ["shifts-tables-result"]);
              debouncedInvalidate(qc, "closed-shifts", ["closed-shifts"]);
            },
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "cage_slots_shifts", filter: `casino_id=eq.${casinoId}` },
            () => {
              debouncedInvalidate(qc, "slots-auto-for-date", ["slots-auto-for-date"]);
              debouncedInvalidate(qc, "cage-slots-shifts", ["cage-slots-shifts"]);
              debouncedInvalidate(qc, "cage-slots-shift", ["cage-slots-shift"]);
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

      // ═════════════ FINANCE / OFFICE ═════════════
      if (
        has("finance_dashboard") || has("finance_wallets") || has("finance_cash_count") ||
        has("finance_budget") || has("finance_review") || has("finance_transfers") ||
        has("finance_summary") || has("finance_payments") || has("closings") || has("daily_expenses")
      ) {
        channel = channel
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "fin_day_closing", filter: `casino_id=eq.${casinoId}` },
            () => {
              debouncedInvalidate(qc, "fin-day-closing", ["fin-day-closing"]);
              debouncedInvalidate(qc, "fin-day-closing-list", ["fin-day-closing-list"]);
              debouncedInvalidate(qc, "bdc-snapshot", ["bdc-snapshot"]);
            },
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "fin_wallets", filter: `casino_id=eq.${casinoId}` },
            () => {
              debouncedInvalidate(qc, "fin-wallets", ["fin-wallets"]);
              debouncedInvalidate(qc, "fin-wallet-balances", ["fin-wallet-balances"]);
            },
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "fin_wallet_tx", filter: `casino_id=eq.${casinoId}` },
            () => {
              debouncedInvalidate(qc, "fin-wallet-tx", ["fin-wallet-tx"]);
              debouncedInvalidate(qc, "fin-wallet-balances", ["fin-wallet-balances"]);
              debouncedInvalidate(qc, "fin-monthly-report", ["fin-monthly-report"]);
            },
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "fin_money_change", filter: `casino_id=eq.${casinoId}` },
            () => {
              debouncedInvalidate(qc, "fin-money-change", ["fin-money-change"]);
              debouncedInvalidate(qc, "fin-wallet-balances", ["fin-wallet-balances"]);
            },
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "fin_incomes", filter: `casino_id=eq.${casinoId}` },
            () => {
              debouncedInvalidate(qc, "fin-incomes", ["fin-incomes"]);
              debouncedInvalidate(qc, "fin-monthly-report", ["fin-monthly-report"]);
            },
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "fin_daily_rates", filter: `casino_id=eq.${casinoId}` },
            () => debouncedInvalidate(qc, "fin-daily-rates", ["fin-daily-rates"]),
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "fin_budget", filter: `casino_id=eq.${casinoId}` },
            () => {
              debouncedInvalidate(qc, "fin-budget", ["fin-budget"]);
              debouncedInvalidate(qc, "fin-monthly-report", ["fin-monthly-report"]);
            },
          );
      }

      // ═════════════ CAGE SLOTS (shift sub-tables) ═════════════
      if (has("cage_slots")) {
        channel = channel
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "cage_slots_cash_counts" },
            () => debouncedInvalidate(qc, "cage-slots-cash-counts", ["cage-slots-cash-counts"]),
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "cage_slots_cards" },
            () => {
              debouncedInvalidate(qc, "cage-slots-cards", ["cage-slots-cards"]);
              debouncedInvalidate(qc, "cage-slots-last-closed-cards", ["cage-slots-last-closed-cards"]);
            },
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "cage_slots_comments" },
            () => debouncedInvalidate(qc, "cage-slots-comments", ["cage-slots-comments"]),
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "cage_slots_transfers", filter: `casino_id=eq.${casinoId}` },
            () => debouncedInvalidate(qc, "cage-slots-transfers", ["cage-slots-transfers"]),
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "cage_slots_tips_cd", filter: `casino_id=eq.${casinoId}` },
            () => debouncedInvalidate(qc, "slots-tips-cd", ["slots-tips-cd"]),
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "cage_slots_tips_cd_payouts", filter: `casino_id=eq.${casinoId}` },
            () => debouncedInvalidate(qc, "slots-tips-cd-payouts", ["slots-tips-cd-payouts"]),
          );
      }

      // ═════════════ CHIP MOVEMENTS ═════════════
      if (has("cage") || has("tables") || has("table_tracker")) {
        channel = channel
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "chip_transfers", filter: `casino_id=eq.${casinoId}` },
            () => {
              debouncedInvalidate(qc, "chip-transfers", ["chip-transfers"]);
              debouncedInvalidate(qc, "chip-inventory", ["chip-inventory"]);
            },
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "chip_inventory", filter: `casino_id=eq.${casinoId}` },
            () => debouncedInvalidate(qc, "chip-inventory", ["chip-inventory"]),
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "chip_emissions", filter: `casino_id=eq.${casinoId}` },
            () => debouncedInvalidate(qc, "chip-emissions", ["chip-emissions"]),
          );
      }

      // ═════════════ TABLE DAILY RESULTS ═════════════
      if (has("table_results") || has("cage") || has("closings")) {
        channel = channel.on(
          "postgres_changes",
          { event: "*", schema: "public", table: "table_daily_results", filter: `casino_id=eq.${casinoId}` },
          () => {
            debouncedInvalidate(qc, "table-daily-results", ["table-daily-results"]);
            debouncedInvalidate(qc, "shift_tables_result", ["shift_tables_result_total"]);
            debouncedInvalidate(qc, `dashboard-table-results:${casinoId}`, ["dashboard-table-results", casinoId]);
          },
        );
      }

      // ═════════════ PIT BOOK (chat) ═════════════
      if (has("pit_book")) {
        channel = channel
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "pit_book_entries", filter: `casino_id=eq.${casinoId}` },
            () => {
              debouncedInvalidate(qc, "pit-book", ["pit-book"]);
              debouncedInvalidate(qc, "pit-book-unread", ["pit-book-unread"]);
            },
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "pit_book_reads" },
            () => debouncedInvalidate(qc, "pit-book-unread", ["pit-book-unread"]),
          );
      }

      // ═════════════ INCIDENTS / CCTV ═════════════
      if (has("incidents") || has("cctv")) {
        channel = channel
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "incidents", filter: `casino_id=eq.${casinoId}` },
            () => debouncedInvalidate(qc, "incidents", ["incidents"]),
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "cctv_observations", filter: `casino_id=eq.${casinoId}` },
            () => debouncedInvalidate(qc, "cctv-observations", ["cctv-observations"]),
          );
      }

      // ═════════════ ROLES & MODULE PERMISSIONS ═════════════
      // Always on: if an admin grants/revokes roles or module access, the
      // current session must reflect it without a manual sign-out.
      channel = channel
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "user_roles" },
          () => {
            debouncedInvalidate(qc, "user-roles", ["user-roles"]);
            debouncedInvalidate(qc, "my-roles", ["my-roles"]);
            debouncedInvalidate(qc, "my-modules", ["my-module-permissions"]);
          },
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "user_module_permissions" },
          () => debouncedInvalidate(qc, "my-modules", ["my-module-permissions"]),
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "user_casino_access" },
          () => debouncedInvalidate(qc, "user-casino-access", ["user-casino-access"]),
        );

      // ═════════════ PAYROLL ═════════════
      if (has("payroll")) {
        channel = channel
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "payroll_entries" },
            () => debouncedInvalidate(qc, "payroll-entries", ["payroll-entries"]),
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "payroll_periods" },
            () => debouncedInvalidate(qc, "payroll-periods", ["payroll-periods"]),
          );
      }

      // ═════════════ EMPLOYEES / STAFF MASTER / WARNINGS ═════════════
      if (has("staff_employees") || has("staff_master") || has("employee_playlist") || has("hr_warnings")) {
        channel = channel
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "employees" },
            () => {
              debouncedInvalidate(qc, "employees", ["employees"]);
              debouncedInvalidate(qc, "staff-master", ["staff-master"]);
            },
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "staff_warnings" },
            () => debouncedInvalidate(qc, "staff-warnings", ["staff-warnings"]),
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "employee_playlist_notes" },
            () => debouncedInvalidate(qc, "employee-playlist-notes", ["employee-playlist-notes"]),
          );
      }

      // ═════════════ ATTENDANCE MONTHLY (hours / holidays) ═════════════
      if (has("staff_attendance") || has("pit_attendance")) {
        channel = channel
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "attendance_hours", filter: `casino_id=eq.${casinoId}` },
            () => debouncedInvalidate(qc, "attendance-hours", ["attendance-hours"]),
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "attendance_holidays", filter: `casino_id=eq.${casinoId}` },
            () => debouncedInvalidate(qc, "attendance-holidays", ["attendance-holidays"]),
          );
      }

      // ═════════════ TIPS & BONUSES ═════════════
      if (has("tips_and_bonuses")) {
        channel = channel
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "monthly_tips_pools", filter: `casino_id=eq.${casinoId}` },
            () => debouncedInvalidate(qc, "monthly-tips", ["monthly-tips"]),
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "monthly_tips_entries" },
            () => debouncedInvalidate(qc, "monthly-tips", ["monthly-tips"]),
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "weekly_bonus_pools", filter: `casino_id=eq.${casinoId}` },
            () => debouncedInvalidate(qc, "weekly-bonus", ["weekly-bonus"]),
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "weekly_bonus_entries" },
            () => debouncedInvalidate(qc, "weekly-bonus", ["weekly-bonus"]),
          );
      }

      // ═════════════ CLUB / PROMO / MARKETING ═════════════
      if (
        has("marketing_campaigns") || has("promo_codes") || has("promo_grants") ||
        has("kyc_reviews") || has("shop_orders") || has("shop_catalog") || has("lotteries") ||
        has("am_budget") || has("am_performance") || has("fm_topups")
      ) {
        channel = channel
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "promo_grants", filter: `casino_id=eq.${casinoId}` },
            () => debouncedInvalidate(qc, "promo-grants", ["promo-grants"]),
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "promo_redemptions", filter: `casino_id=eq.${casinoId}` },
            () => debouncedInvalidate(qc, "promo-redemptions", ["promo-redemptions"]),
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "promo_codes" },
            () => debouncedInvalidate(qc, "promo-codes", ["promo-codes"]),
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "promo_wallet_ledger" },
            () => debouncedInvalidate(qc, "promo-wallet-ledger", ["promo-wallet-ledger"]),
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "kyc_reviews" },
            () => debouncedInvalidate(qc, "kyc-reviews", ["kyc-reviews"]),
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "shop_orders" },
            () => debouncedInvalidate(qc, "shop-orders", ["shop-orders"]),
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "lottery_tickets" },
            () => debouncedInvalidate(qc, "lottery-tickets", ["lottery-tickets"]),
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "am_budget_ledger" },
            () => debouncedInvalidate(qc, "am-budget-ledger", ["am-budget-ledger"]),
          );
      }

      // ═════════════ POS (bar / kitchen / inventory) ═════════════
      // No dedicated module keys today — gate to anyone who can reach any
      // POS surface via the generic operational modules (managers, cage).
      if (has("cage") || has("closings") || has("finance_dashboard") || isSuperAdmin) {
        channel = channel
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "pos_orders" },
            () => {
              debouncedInvalidate(qc, "pos-orders", ["pos-orders"]);
              debouncedInvalidate(qc, "pos-shift", ["pos-shift"]);
            },
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "pos_order_items" },
            () => debouncedInvalidate(qc, "pos-orders", ["pos-orders"]),
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "pos_tabs" },
            () => debouncedInvalidate(qc, "pos-tabs", ["pos-tabs"]),
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "pos_shifts" },
            () => debouncedInvalidate(qc, "pos-shifts", ["pos-shifts"]),
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "pos_player_charges" },
            () => debouncedInvalidate(qc, "pos-player-charges", ["pos-player-charges"]),
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "pos_inventory_movements" },
            () => debouncedInvalidate(qc, "pos-inventory", ["pos-inventory"]),
          );
      }

      // ═════════════ CANCELLED TRANSACTIONS ═════════════
      if (has("cancelled_transactions") || has("cage")) {
        channel = channel.on(
          "postgres_changes",
          { event: "*", schema: "public", table: "transaction_cancellations", filter: `casino_id=eq.${casinoId}` },
          () => debouncedInvalidate(qc, "transaction-cancellations", ["transaction-cancellations"]),
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

  // Foreground catch-up: when the tab is refocused (laptop lid, PWA switch,
  // phone unlock), force-refetch active queries and re-check the realtime
  // socket. Supabase-js auto-reconnects, but this guarantees the UI reflects
  // any events missed while the socket was suspended — no more "3-4 minute"
  // gaps where Table Tracker looks frozen until F5.
  useEffect(() => {
    if (!casinoId) return;
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      // Always refetch the on-screen queries; other keys are marked stale.
      qc.invalidateQueries({ refetchType: "active" });
      qc.invalidateQueries({ refetchType: "none" });
      // Nudge realtime: if the socket dropped, re-subscribing the channel
      // is handled by supabase-js; touching it forces a status callback.
      const ch = channelRef.current;
      if (ch && ch.state !== "joined") {
        try { ch.subscribe(); } catch { /* ignore */ }
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    window.addEventListener("online", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.removeEventListener("online", onVisible);
    };
  }, [casinoId, qc]);
};
