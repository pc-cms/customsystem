/**
 * MODULE_LIVE_SPEC — реестр таблиц Realtime-подписок по модулям.
 *
 * Фаза A "Realtime-first": при логине для каждого разрешённого
 * пользователю модуля мы монтируем Postgres Changes каналы на
 * перечисленные таблицы. Событие → `queryClient.invalidateQueries`
 * по указанным ключам.
 *
 * Свежесть кэша обеспечивается Realtime, а не таймером refetch.
 * См. `liveQueryOptions()` и `useModuleLiveSync()`.
 *
 * Правила:
 *   - `table` — public.<name>, точно как в БД.
 *   - `queryKeyPrefixes` — какие queryKey инвалидировать при событии.
 *     Совпадение по префиксу: `["dealers"]` затрагивает
 *     `["dealers", casinoId]`, `["dealers", casinoId, x]` и т.д.
 *   - `filter` — опциональный фильтр Postgres Changes (напр.
 *     `casino_id=eq.<uuid>`). Подставляется на runtime.
 *
 * Не добавляй сюда таблицы, где Realtime невозможен или бессмыслен
 * (агрегаты, RPC). Оставляй такие запросы со своим staleTime.
 */
import type { ModuleKey } from "@/lib/modules";

export type LiveTableSpec = {
  table: string;
  queryKeyPrefixes: string[];
  /** Если true — фильтруем по casino_id (default true). Ставь false для глобальных справочников. */
  scopedByCasino?: boolean;
};

export const MODULE_LIVE_SPEC: Partial<Record<ModuleKey, LiveTableSpec[]>> = {
  // ─────────── PIT ───────────
  pit_dealers: [
    { table: "employees", queryKeyPrefixes: ["dealers", "staff_members", "employees"] },
  ],
  pit_breaklist: [
    { table: "breaklist", queryKeyPrefixes: ["breaklist"] },
    { table: "breaklist_logs", queryKeyPrefixes: ["breaklist-logs"] },
  ],
  pit_rota: [
    { table: "pit_rota", queryKeyPrefixes: ["pit-rota", "pit-rota-range"] },
    { table: "rota_locks", queryKeyPrefixes: ["rota-lock"] },
  ],
  pit_attendance: [
    { table: "dealer_attendance", queryKeyPrefixes: ["dealer-attendance", "dealer-attendance-range"] },
  ],
  pit_active_players: [
    { table: "player_daily_zones", queryKeyPrefixes: ["player_daily_zones"] },
    { table: "player_position_history", queryKeyPrefixes: ["player-position-history"] },
    { table: "table_head_count", queryKeyPrefixes: ["table-head-count"] },
  ],
  pit_book: [
    { table: "pit_book_entries", queryKeyPrefixes: ["pit-book", "pit-book-entries"] },
    { table: "pit_book_reads", queryKeyPrefixes: ["pit-book-unread", "pit-book-reads"] },
  ],

  // ─────────── TABLES ───────────
  tables: [
    { table: "gaming_tables", queryKeyPrefixes: ["gaming-tables", "tables"] },
  ],
  table_tracker: [
    { table: "table_tracker", queryKeyPrefixes: ["table-tracker"] },
  ],
  table_results: [
    { table: "table_daily_results", queryKeyPrefixes: ["table-daily-results", "shift-tables-result"] },
  ],

  // ─────────── CAGE (live game) ───────────
  cage: [
    { table: "shifts", queryKeyPrefixes: ["active-shift", "shifts", "shift"] },
    { table: "transactions", queryKeyPrefixes: ["transactions", "cage-transactions"] },
    { table: "cash_counts", queryKeyPrefixes: ["cash-counts"] },
    { table: "cage_transfers", queryKeyPrefixes: ["cage-transfers"] },
    { table: "chip_transfers", queryKeyPrefixes: ["chip-transfers"] },
    { table: "chip_inventory", queryKeyPrefixes: ["chip-inventory", "chips"] },
  ],
  cage_view: [
    { table: "shifts", queryKeyPrefixes: ["shifts", "shift"] },
    { table: "transactions", queryKeyPrefixes: ["transactions"] },
  ],
  closings: [
    { table: "shifts", queryKeyPrefixes: ["shifts", "closings"] },
    { table: "business_day_closures", queryKeyPrefixes: ["business-day-closure", "business-day-history"] },
  ],
  cage_slots: [
    { table: "cage_slots_shifts", queryKeyPrefixes: ["cage-slots-shifts", "cage-slots"] },
    { table: "cage_slots_transfers", queryKeyPrefixes: ["cage-slots-transfers"] },
    { table: "cage_slots_cash_counts", queryKeyPrefixes: ["cage-slots-cash-counts"] },
    { table: "cage_slots_cash_inventory", queryKeyPrefixes: ["cage-slots-cash-inventory"] },
  ],

  // ─────────── PLAYERS / RECEPTION ───────────
  players: [
    { table: "players", queryKeyPrefixes: ["players", "player-profile"] },
    { table: "player_tags", queryKeyPrefixes: ["players", "player-tags"] },
    { table: "player_cards", queryKeyPrefixes: ["players", "player-cards"] },
  ],
  in_casino: [
    { table: "casino_visits", queryKeyPrefixes: ["casino-visits", "casino-visits-live", "visits"] },
  ],
  reception: [
    { table: "casino_visits", queryKeyPrefixes: ["casino-visits", "casino-visits-live"] },
    { table: "players", queryKeyPrefixes: ["players"] },
  ],
  blacklist: [
    { table: "players", queryKeyPrefixes: ["blacklist", "players"] },
  ],
  groups: [
    { table: "player_groups", queryKeyPrefixes: ["player-groups", "groups"] },
    { table: "group_members", queryKeyPrefixes: ["player-groups", "group-members"] },
  ],

  // ─────────── FINANCE / BANK / EXPENSES ───────────
  bank_checks: [
    { table: "bank_checks", queryKeyPrefixes: ["bank-checks"] },
  ],
  expenses: [
    { table: "expenses", queryKeyPrefixes: ["expenses"] },
  ],
  daily_expenses: [
    { table: "expenses", queryKeyPrefixes: ["expenses", "daily-expenses"] },
  ],
  expenses_approvals: [
    { table: "expenses", queryKeyPrefixes: ["expenses", "expenses-approvals"] },
  ],
  cashless: [
    { table: "cashless_transactions", queryKeyPrefixes: ["cashless", "cashless-transactions", "cashless-suggestions", "cage-slots-cashless"] },
  ],
  finance_wallets: [
    { table: "fin_wallets", queryKeyPrefixes: ["fin-wallets"] },
    { table: "fin_wallet_tx", queryKeyPrefixes: ["fin-wallet-tx", "fin-wallets"] },
  ],
  finance_dashboard: [
    { table: "fin_wallets", queryKeyPrefixes: ["fin-wallets"] },
    { table: "fin_wallet_tx", queryKeyPrefixes: ["fin-wallet-tx"] },
    { table: "fin_incomes", queryKeyPrefixes: ["fin-incomes"] },
  ],
  finance_budget: [
    { table: "fin_budget", queryKeyPrefixes: ["fin-budget"] },
  ],

  // ─────────── STAFF / HR ───────────
  staff_employees: [
    { table: "employees", queryKeyPrefixes: ["staff_members", "employees"] },
  ],
  staff_rota: [
    { table: "staff_rota", queryKeyPrefixes: ["staff-rota"] },
    { table: "rota_locks", queryKeyPrefixes: ["rota-lock"] },
  ],
  staff_attendance: [
    { table: "staff_attendance", queryKeyPrefixes: ["staff-attendance"] },
  ],
  hr_warnings: [
    { table: "staff_warnings", queryKeyPrefixes: ["staff-warnings"] },
  ],

  // ─────────── TIPS / BONUSES ───────────
  tips_and_bonuses: [
    { table: "monthly_tips_entries", queryKeyPrefixes: ["monthly-tips"] },
    { table: "monthly_tips_pools", queryKeyPrefixes: ["monthly-tips"] },
    { table: "weekly_bonus_entries", queryKeyPrefixes: ["weekly-bonus"] },
    { table: "weekly_bonus_pools", queryKeyPrefixes: ["weekly-bonus"] },
    { table: "cage_slots_tips_cd", queryKeyPrefixes: ["slots-tips-cd"] },
  ],

  // ─────────── INCIDENTS / CCTV ───────────
  incidents: [
    { table: "incidents", queryKeyPrefixes: ["incidents"] },
  ],
  cctv: [
    { table: "cctv_observations", queryKeyPrefixes: ["cctv-observations"] },
  ],
  cctv_dashboard: [
    { table: "cctv_observations", queryKeyPrefixes: ["cctv-observations"] },
    { table: "incidents", queryKeyPrefixes: ["incidents"] },
  ],
};

/**
 * Всегда подписанные таблицы (для любой авторизованной сессии).
 * Держим ультра-скромный набор — то, что каждый пользователь видит
 * на любом экране (справочники казино, business_day).
 */
export const ALWAYS_LIVE: LiveTableSpec[] = [
  { table: "business_day_closures", queryKeyPrefixes: ["business-day-closure", "business-day-history"] },
  { table: "casino_visits", queryKeyPrefixes: ["casino-visits-live"] },
];
