/**
 * Casino settings — single source of truth for tunable operational params.
 *
 * Adding a setting:
 *   1. Add a SettingSpec entry to SETTINGS below.
 *   2. Consume it via `useCasinoSetting("your.key")` — never re-import defaults elsewhere.
 *   3. CasinoSettingsPage renders each spec automatically inside its group tab.
 *
 * Types drive both the SettingCard UI control and TypeScript inference.
 */

export type SettingType =
  | "number"
  | "text"
  | "toggle"
  | "select"
  | "currency-list"
  | "denomination-list"
  | "provider-list"
  | "json";

export type SettingGroup =
  | "general"
  | "currency"
  | "cashless"
  | "tips"
  | "limits"
  | "time";

export interface SettingSpec<T = unknown> {
  key: string;
  group: SettingGroup;
  label: string;
  description?: string;
  type: SettingType;
  default: T;
  /** Free-text options for type="select". */
  options?: { value: string; label: string }[];
  /** For number type. */
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  /** Warn-and-confirm before saving; used for values that cannot be undone
   *  (e.g. currency removal, denomination merges). */
  irreversible?: boolean;
}

export const SETTINGS: SettingSpec[] = [
  // ─── CURRENCY ─────────────────────────────────────────────────────────
  {
    key: "currency.enabled",
    group: "currency",
    label: "Enabled currencies",
    description: "Order matters: shown left→right largest note first. TZS is the base currency.",
    type: "currency-list",
    default: ["TZS", "USD", "EUR", "GBP", "KES"],
    irreversible: true,
  },
  {
    key: "currency.primary",
    group: "currency",
    label: "Primary currency",
    description: "Reporting currency for totals and Grand TZS conversion base.",
    type: "select",
    options: [
      { value: "TZS", label: "TZS" },
      { value: "USD", label: "USD" },
    ],
    default: "TZS",
  },

  // ─── CASHLESS ─────────────────────────────────────────────────────────
  {
    key: "cashless.providers",
    group: "cashless",
    label: "Cashless providers",
    description: "Mobile money / e-wallet networks accepted at the cage.",
    type: "provider-list",
    default: ["MPESA", "TIGO", "HALOTEL", "AIRTEL"],
  },
  {
    key: "cashless.max_per_tx_tzs",
    group: "cashless",
    label: "Max per transaction (TZS)",
    description: "Cashless single-transaction cap. Set 0 for no limit.",
    type: "number",
    default: 0,
    min: 0,
    step: 100000,
    suffix: "TZS",
  },

  // ─── TIPS ─────────────────────────────────────────────────────────────
  {
    key: "tips.weekly_bonus_min_hours",
    group: "tips",
    label: "Weekly bonus min hours",
    description: "Dealer must reach this many attendance hours to be eligible.",
    type: "number",
    default: 30,
    min: 0,
    max: 168,
    step: 1,
    suffix: "h",
  },
  {
    key: "tips.monthly_pool_share_percent",
    group: "tips",
    label: "Monthly pool employer share (%)",
    description: "Portion of the monthly tips pool retained by the casino.",
    type: "number",
    default: 0,
    min: 0,
    max: 100,
    step: 1,
    suffix: "%",
  },

  // ─── LIMITS ───────────────────────────────────────────────────────────
  {
    key: "limits.hourly_check_interval_minutes",
    group: "limits",
    label: "Hourly check interval",
    description: "Cashier is prompted for a cash-check after this interval.",
    type: "number",
    default: 60,
    min: 15,
    max: 240,
    step: 15,
    suffix: "min",
  },
  {
    key: "limits.max_shift_duration_hours",
    group: "limits",
    label: "Max shift duration",
    description: "Warn if a shift stays open longer than this.",
    type: "number",
    default: 14,
    min: 6,
    max: 24,
    step: 1,
    suffix: "h",
  },
  {
    key: "limits.cash_desk_imbalance_warning_tzs",
    group: "limits",
    label: "Cash desk imbalance warning (TZS)",
    description: "Show a soft warning if |Shift Balance| exceeds this value.",
    type: "number",
    default: 100000,
    min: 0,
    step: 50000,
    suffix: "TZS",
  },

  // ─── GENERAL ──────────────────────────────────────────────────────────
  {
    key: "general.enable_incidents_ai_hints",
    group: "general",
    label: "Enable Incidents AI hints",
    description: "Show suggested tags on new incident entries.",
    type: "toggle",
    default: false,
  },
];

/** Lookup by key with strong return typing. */
export function getSpec(key: string): SettingSpec | undefined {
  return SETTINGS.find((s) => s.key === key);
}

/** Get default value for a key (falls back to null if unknown). */
export function getDefault<T = unknown>(key: string): T | null {
  return (getSpec(key)?.default as T) ?? null;
}

export const SETTING_GROUPS: { key: SettingGroup; label: string }[] = [
  { key: "general", label: "General" },
  { key: "currency", label: "Currency" },
  { key: "cashless", label: "Cashless" },
  { key: "tips", label: "Tips" },
  { key: "limits", label: "Limits" },
  { key: "time", label: "Time" },
];
