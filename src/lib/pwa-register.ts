/**
 * PWA service worker registration with strict guards + manual update UX.
 *
 * Update policy (deliberate, do not "improve" without discussion):
 *   - SW polls for updates every 30 min + on focus/visibility/online.
 *   - When new version is available we ONLY dispatch `pwa:update-available`
 *     and show a persistent toast. NO automatic reload during work.
 *   - User clicks "Update now" → updateSW(true) → page reloads with new code.
 *   - Force Update button calls resetPWACache() and is the manual escape hatch.
 *
 * No auto-reload, no idle timers — these caused screens to self-refresh
 * mid-shift and were removed deliberately.
 */

import { toast } from "sonner";

const isInIframe = (() => {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
})();

const host = typeof window !== "undefined" ? window.location.hostname : "";
const isPreviewHost =
  host.includes("lovableproject.com") ||
  host.includes("id-preview--") ||
  host.includes("localhost") ||
  host.startsWith("127.");

const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000;

export async function setupPWA() {
  if (typeof window === "undefined") return;

  // In editor preview / iframe / dev: aggressively unregister any existing SW
  // to avoid stale caches polluting future sessions.
  if (isInIframe || isPreviewHost || import.meta.env.DEV) {
    try {
      const regs = await navigator.serviceWorker?.getRegistrations?.();
      regs?.forEach((r) => r.unregister());
    } catch {
      /* ignore */
    }
    return;
  }

  // Production, top-level window, real domain — register PWA.
  try {
    const { registerSW } = await import("virtual:pwa-register");

    const updateSW = registerSW({
      immediate: true,
      async onRegisteredSW(_swUrl, registration) {
        if (!registration) return;

        // One-time cleanup: previous builds cached Supabase REST in a SW cache
        // called "supabase-api". That cache served empty/stale arrays after
        // a 5s timeout — purge any leftover entries.
        try {
          const names = await caches.keys();
          await Promise.all(
            names
              .filter((n) => n.includes("supabase-api"))
              .map((n) => caches.delete(n)),
          );
        } catch { /* ignore */ }

        // Check immediately + periodically + on visibility/focus/online.
        registration.update().catch(() => {});
        setInterval(() => {
          registration.update().catch(() => {});
        }, UPDATE_CHECK_INTERVAL_MS);

        const checkNow = () => {
          if (document.visibilityState === "visible") {
            registration.update().catch(() => {});
          }
        };
        document.addEventListener("visibilitychange", checkNow);
        window.addEventListener("focus", checkNow);
        window.addEventListener("online", checkNow);
      },
      onOfflineReady() {
        console.log("[PWA] App ready for offline use");
      },
      onNeedRefresh() {
        console.log("[PWA] New version available — waiting for user to confirm");

        // Fire global event so the blocking dialog can react.
        window.dispatchEvent(new CustomEvent("pwa:update-available", {
          detail: { update: updateSW },
        }));

        // Persistent toast fallback (no auto-reload).
        toast("New version available", {
          description: "Click Update now to load it.",
          duration: Infinity,
          action: {
            label: "Update now",
            onClick: () => { updateSW(true); },
          },
        });
      },
    });
  } catch (e) {
    console.warn("[PWA] Registration failed:", e);
  }
}

/**
 * Manually clear SW caches and reload. Used by Admin "Force update" button.
 *
 * IMPORTANT — what this MUST NOT do:
 *   - Do not touch Supabase auth keys in localStorage (sb-*-auth-token).
 *     Wiping them logs the user out and triggers a slow re-login.
 *   - Do not clear sessionStorage globally.
 *
 * What it does:
 *   1. Wipe Cache Storage (precache + runtime caches).
 *   2. Unregister all service workers on this origin.
 *   3. Drop stale React Query offline cache (may reference old chunks).
 *   4. Sync cms:app-version so any version check sees the new build.
 *   5. Hard navigate to current URL with a cache-buster.
 */
export async function resetPWACache(): Promise<void> {
  try {
    // 1) Wipe every Cache Storage bucket
    const cacheNames = await caches.keys().catch(() => [] as string[]);
    await Promise.all(cacheNames.map((n) => caches.delete(n).catch(() => false)));

    // 2) Unregister every service worker on this origin
    const regs = await navigator.serviceWorker?.getRegistrations?.().catch(() => []);
    if (regs) {
      await Promise.all(regs.map((r) => r.unregister().catch(() => false)));
    }

    // 3) Sync the version-buster key (no longer triggers a reload — see main.tsx)
    try {
      // @ts-expect-error injected by Vite define()
      const v = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "";
      if (v) localStorage.setItem("cms:app-version", v);
    } catch { /* ignore */ }

    // 4) Drop stale persisted react-query cache that might reference old chunks
    try {
      localStorage.removeItem("REACT_QUERY_OFFLINE_CACHE");
    } catch { /* ignore */ }
  } catch (e) {
    console.warn("[PWA] reset failed:", e);
  }

  // 5) Force a network fetch for the current page so we get the latest
  //    index.html (with new hashed chunk URLs) instead of a stale
  //    browser-cache or SW-cached copy.
  try {
    await fetch(window.location.href, { cache: "no-store", credentials: "same-origin" });
  } catch { /* ignore */ }

  // 6) Hard navigation with cache-buster — bypasses HTTP cache AND any SW
  //    controller still claiming this page. `replace` keeps history clean.
  try {
    const url = new URL(window.location.href);
    url.searchParams.set("_cb", Date.now().toString(36));
    window.location.replace(url.toString());
  } catch {
    window.location.reload();
  }
}
