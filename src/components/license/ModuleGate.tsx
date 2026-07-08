/**
 * ModuleGate — hides a subtree when the active license does not include a
 * given module. Renders an <UpgradeCard> in place of the children so
 * operators immediately see what package would unlock the screen.
 *
 * Used automatically by RoleGuard for every route (via moduleKeyForRoute),
 * but can also be dropped around any nested section that should be gated
 * independently (e.g. a sub-tab).
 */
import type { ReactNode } from "react";
import { Lock } from "lucide-react";
import type { ModuleKey } from "@/lib/modules";
import { useLicense, hasModule } from "@/hooks/use-license";
import { MODULES } from "@/lib/modules";

interface Props {
  module: ModuleKey;
  children: ReactNode;
  /** When true, render nothing (used by sidebar to hide nav items). */
  silent?: boolean;
}

export function ModuleGate({ module, children, silent = false }: Props) {
  const license = useLicense();
  if (hasModule(license, module)) return <>{children}</>;
  if (silent) return null;
  return <UpgradeCard module={module} />;
}

export function UpgradeCard({ module }: { module: ModuleKey }) {
  const license = useLicense();
  const def = MODULES.find((m) => m.key === module);
  const label = def?.label ?? module;
  const isExpired = !license.isValid && !license.isImplicit;

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="max-w-md w-full rounded-lg border border-border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
          <Lock className="w-6 h-6 text-muted-foreground" />
        </div>
        <h2 className="text-lg font-semibold text-foreground mb-1">
          {isExpired ? "License expired" : `${label} — not included`}
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          {isExpired
            ? "The casino license has expired. Contact your administrator to activate a new license."
            : `Your current package (${license.packageCode}) does not include this module.`}
        </p>
        {!isExpired && (
          <p className="text-xs text-muted-foreground">
            Ask a super-admin to upgrade the license package to enable {label}.
          </p>
        )}
      </div>
    </div>
  );
}
