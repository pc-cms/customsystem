import { useQuery } from "@tanstack/react-query";
import { liveQueryOptions, liveQueryOptionsWithFallback } from "@/lib/live-query-options";
import { supabase } from "@/integrations/supabase/client";

export type BoxLicenseMode = "full" | "restricted" | "stopped";

export interface BoxLicenseRow {
  id: string;
  node_id: string;
  activated_at: string;
  last_heartbeat_at: string;
  full_days: number;
  restricted_days: number;
  license_key: string | null;
  license_expires_at: string | null;
  challenge_nonce: string | null;
  notes: string | null;
}

export interface BoxLicenseState {
  mode: BoxLicenseMode;
  license: BoxLicenseRow | null;
  daysUsed: number;
  daysUntilRestricted: number | null;
  daysUntilStop: number | null;
  isCloud: boolean;
}

/**
 * Reads the current box license state. Cloud (no row) always returns 'full'.
 * Restricted mode hides Player Statistics, Reports write, HR, Finances.
 * Stopped mode blocks all writes; only super_admin can enter an activation code.
 */
export function useBoxLicense(): BoxLicenseState {
  const { data } = useQuery({
    queryKey: ["box-license"],
    queryFn: async (): Promise<BoxLicenseState> => {
      const { data: rows } = await supabase
        .from("box_licenses")
        .select("*")
        .order("activated_at", { ascending: true })
        .limit(1);

      const license = (rows?.[0] as BoxLicenseRow | undefined) ?? null;

      if (!license) {
        return {
          mode: "full",
          license: null,
          daysUsed: 0,
          daysUntilRestricted: null,
          daysUntilStop: null,
          isCloud: true,
        };
      }

      const activated = new Date(license.activated_at).getTime();
      const daysUsed = Math.max(
        0,
        Math.floor((Date.now() - activated) / 86_400_000)
      );

      // Explicit renewal wins
      if (license.license_expires_at && new Date(license.license_expires_at) > new Date()) {
        return {
          mode: "full",
          license,
          daysUsed,
          daysUntilRestricted: null,
          daysUntilStop: null,
          isCloud: false,
        };
      }

      const fullDays = license.full_days ?? 60;
      const restrictedDays = license.restricted_days ?? 30;
      const stopDay = fullDays + restrictedDays;

      let mode: BoxLicenseMode = "full";
      if (daysUsed >= stopDay) mode = "stopped";
      else if (daysUsed >= fullDays) mode = "restricted";

      return {
        mode,
        license,
        daysUsed,
        daysUntilRestricted: Math.max(0, fullDays - daysUsed),
        daysUntilStop: Math.max(0, stopDay - daysUsed),
        isCloud: false,
      };
    },
    ...liveQueryOptionsWithFallback(300000),
    refetchInterval: 15 * 60_000,
  });

  return (
    data ?? {
      mode: "full",
      license: null,
      daysUsed: 0,
      daysUntilRestricted: null,
      daysUntilStop: null,
      isCloud: true,
    }
  );
}

/**
 * Returns true when a given module should be blocked in the current license mode.
 * Restricted mode allowlist: cashier operations + pit table open/close only.
 */
const RESTRICTED_ALLOWLIST = new Set<string>([
  "cashier",
  "cage",
  "pit-tables",
  "table-tracker",
  "chip-count",
  "reports-view", // read-only for today
  "license",
]);

export function isModuleBlocked(mode: BoxLicenseMode, moduleKey: string): boolean {
  if (mode === "full") return false;
  if (mode === "stopped") return moduleKey !== "license";
  // restricted
  return !RESTRICTED_ALLOWLIST.has(moduleKey);
}
