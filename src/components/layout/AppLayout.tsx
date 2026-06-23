import { Suspense, useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { AppSidebar } from "./AppSidebar";
// useRealtimeSubscriptions intentionally not imported — mounted in App.tsx only.
import { useIsMobile } from "@/hooks/use-mobile";
import { MobileHeader } from "./AppSidebar";
import { PWAUpdateNotification } from "@/components/PWAUpdateNotification";
import { LocalServerBadge } from "@/components/LocalServerBadge";
import { OfflineBanner } from "@/components/OfflineBanner";
import { prefetchRouteChunks } from "@/lib/route-prefetch";

import { cn } from "@/lib/utils";

const PageLoader = () => (
  <div className="flex items-center justify-center py-20">
    <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

// Routes that need full-bleed width (no max-w container)
const FULL_WIDTH_ROUTES = [
  "/reports",
  "/pit",
  "/staff",
  "/floor",
  "/player-statistics",
  "/incidents",
  "/table-tracker",

  "/logs",
  "/bank-checks",
];

const STORAGE_KEY = "cms.sidebar.collapsed";

export const AppLayout = () => {
  // Realtime is mounted once in ProtectedRoutes (App.tsx). Do NOT mount here too —
  // duplicate channels cause double invalidations and waste connections.
  const isMobile = useIsMobile();
  const location = useLocation();
  const isFullWidth = FULL_WIDTH_ROUTES.some((p) => location.pathname.startsWith(p));

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(STORAGE_KEY) === "1";
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0");
  }, [collapsed]);

  // Route-chunk warm-up is driven by `usePrefetchCriticalData` (App.tsx)
  // so it can filter chunks by `allowedModules`. Duplicating it here would
  // warm everything for super-admin path before modules load.

  return (
    <div className="flex h-screen overflow-hidden">

      {!isMobile && (
        <div className="no-print">
          <AppSidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
        </div>
      )}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        <OfflineBanner />
        <PWAUpdateNotification />
        {isMobile && <div className="no-print"><MobileHeader /></div>}

        <main className="flex-1 overflow-y-auto">
          {isFullWidth ? (
            <div className="p-3 sm:p-4 animate-fade-in h-full">
              <Suspense fallback={<PageLoader />}>
                <Outlet />
              </Suspense>
            </div>
          ) : (
            <div className="p-3 sm:p-6 max-w-[1600px] mx-auto animate-fade-in">
              <Suspense fallback={<PageLoader />}>
                <Outlet />
              </Suspense>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};
