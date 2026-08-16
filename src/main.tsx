import { createRoot } from "react-dom/client";
import { installNumericArrowNav } from "@/lib/numeric-nav";
import App from "./App.tsx";
import "./index.css";
import { setupPWA } from "./lib/pwa-register";
import { installChunkRecovery } from "./lib/chunk-recovery";
import { initAuthLeaderElection } from "./lib/auth-leader";
import { installAuthThrottle } from "./lib/auth-throttle";
import { getRuntimeConfig } from "./lib/runtime-config";

// Install BEFORE rendering so we catch chunk errors during initial route load.
installChunkRecovery();

// Preload runtime-config.json (local on-prem casinoSlug/casinoId) so that
// synchronous slug detection in casino-context can pick it up on first render.
// Fire-and-forget kicks off the fetch immediately; we also await it before
// mounting so on local installs the UI doesn't flash an empty/landing state.
const runtimeReady = getRuntimeConfig().catch(() => null);

// Patch window.fetch to throttle /auth/v1/token requests. Must run BEFORE any
// Supabase client call. Protects shared-IP networks (5-10 casino devices behind
// one public IP) from triggering Supabase's per-IP rate limit on /token.
installAuthThrottle();

// Elect a single tab/PWA per device to own the Supabase token refresh loop.
// Prevents refresh-token storms (HTTP 429) when one account is open in
// multiple tabs/windows on the same device.
initAuthLeaderElection();

// Track current version in localStorage WITHOUT triggering a reload.
// The destructive "version buster" that wiped caches + reloaded on every
// version change has been removed — it caused white screens and surprise
// reloads. Updates now flow through the explicit PWAUpdateNotification
// (user clicks "Update now") or the manual Force Update button.
declare const __APP_VERSION__: string;
try {
  localStorage.setItem("cms:app-version", __APP_VERSION__);
} catch { /* ignore */ }

// Safety net: mount React no later than 5s even if runtimeReady stalls
// (e.g. dead network right after Force Update). Prevents the multi-minute
// white screen seen on slow / flaky connections.
const bootDeadline = new Promise((resolve) => setTimeout(resolve, 5000));
Promise.race([runtimeReady, bootDeadline]).finally(() => {
  installNumericArrowNav();
  createRoot(document.getElementById("root")!).render(<App />);
  // Register PWA service worker (no-op in editor preview / iframe / dev)
  setupPWA();
});


