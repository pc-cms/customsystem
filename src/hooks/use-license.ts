/**
 * useLicense — reads the currently-active signed license for the active casino.
 *
 * Rules:
 *   - Cloud/no row: returns `enterprise` (everything enabled). Cloud is
 *     the licensing authority itself, so a missing row means "unrestricted".
 *   - Row present + expired: returns isValid=false, no modules. UI enters
 *     read-only mode via LicenseBanner + ModuleGate.
 *   - Row present + valid: returns package_code, feature Set, daysLeft.
 *
 * Signature is verified server-side by the verify-license edge function
 * before the row is ever inserted. This hook does NOT re-verify (client
 * cannot be trusted anyway); it just reads the trusted DB row.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCasino } from "@/lib/casino-context";
import type { ModuleKey } from "@/lib/modules";
import { liveQueryOptionsWithFallback } from "@/lib/live-query-options";

export interface LicenseState {
  isValid: boolean;
  packageCode: string;
  modules: Set<ModuleKey>;
  expiresAt: Date | null;
  daysLeft: number | null;
  activatedAt: Date | null;
  licenseId: string | null;
  /** true when Cloud/no license row (implicit enterprise). */
  isImplicit: boolean;
}

const IMPLICIT_ENTERPRISE: LicenseState = {
  isValid: true,
  packageCode: "enterprise",
  modules: new Set<ModuleKey>(), // "*" marker via hasModule below
  expiresAt: null,
  daysLeft: null,
  activatedAt: null,
  licenseId: null,
  isImplicit: true,
};

export function useLicense(): LicenseState {
  const { activeCasinoId } = useCasino();

  const { data } = useQuery({
    queryKey: ["casino-license", activeCasinoId],
    enabled: !!activeCasinoId,
    queryFn: async (): Promise<LicenseState> => {
      const { data: rows } = await supabase
        .from("casino_license")
        .select("license_id, package_code, features, expires_at, activated_at")
        .eq("casino_id", activeCasinoId!)
        .limit(1);

      const row = rows?.[0];
      if (!row) return IMPLICIT_ENTERPRISE;

      const expiresAt = new Date(row.expires_at);
      const daysLeft = Math.floor((expiresAt.getTime() - Date.now()) / 86_400_000);
      const isValid = expiresAt.getTime() > Date.now();
      const features = Array.isArray(row.features) ? (row.features as string[]) : [];

      return {
        isValid,
        packageCode: row.package_code,
        modules: new Set(features as ModuleKey[]),
        expiresAt,
        daysLeft,
        activatedAt: row.activated_at ? new Date(row.activated_at) : null,
        licenseId: row.license_id,
        isImplicit: false,
      };
    },
    ...liveQueryOptionsWithFallback(60_000),
  });

  return data ?? IMPLICIT_ENTERPRISE;
}

/**
 * True when the given module is enabled by the active license.
 * Implicit enterprise (Cloud, no row) → always true.
 * Expired license → always false.
 */
export function hasModule(state: LicenseState, key: ModuleKey): boolean {
  if (!state.isValid) return false;
  if (state.isImplicit) return true;
  if (state.packageCode === "enterprise") return true;
  return state.modules.has(key);
}
