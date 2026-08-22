/**
 * V2Scope — wraps routed page content when the UI V2 Preview is enabled
 * for a super_admin AND the current route is inside the V2 test scope.
 *
 * Outside the scope (or for any other user) it renders children untouched.
 */
import * as React from "react";
import { FlaskConical } from "lucide-react";
import { useUiV2 } from "./ui-version";
import { V2ReadOnlyGuard } from "./V2ReadOnlyGuard";
import "./ui-v2.css";

export function V2Scope({ children }: { children: React.ReactNode }) {
  const { inScope } = useUiV2();

  if (!inScope) return <>{children}</>;

  return (
    <div className="ui-v2 relative">
      <div className="no-print sticky top-0 z-40 -mt-1 mb-2 flex justify-end pointer-events-none">
        <span className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-primary shadow-sm">
          <FlaskConical className="h-3 w-3" />
          V2 Preview · read-only
        </span>
      </div>
      <V2ReadOnlyGuard>{children}</V2ReadOnlyGuard>
    </div>
  );
}
