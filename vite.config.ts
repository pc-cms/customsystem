import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";
import pkg from "./package.json";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version || "1.0.2"),
  },
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ["react", "react-dom", "react-router-dom"],
          query: ["@tanstack/react-query", "@tanstack/react-query-persist-client"],
          supabase: ["@supabase/supabase-js"],
          ui: ["@radix-ui/react-dialog", "@radix-ui/react-popover", "@radix-ui/react-select", "@radix-ui/react-tabs", "@radix-ui/react-dropdown-menu"],
          charts: ["recharts"],
        },
      },
    },
  },
  // Strip `console.log` / `console.info` / `debugger` in production builds.
  // Keeps `console.warn` and `console.error` (used for real diagnostics).
  // Dev keeps everything for live debugging.
  esbuild: mode === "production"
    ? { drop: ["debugger"], pure: ["console.log", "console.info", "console.debug"] }
    : undefined,
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: null, // we register manually with iframe/preview guard
      devOptions: { enabled: false },
      includeAssets: ["favicon.png", "apple-touch-icon.png", "icon-192-any.png", "icon-512-any.png", "icon-192-maskable.png", "icon-512-maskable.png", "arusha-logo.png", "manifest.json", "manifest-arusha.json", "manifest-mwanza.json", "manifest-dodoma.json", "manifest-mbeya.json", "manifest-premier.json"],
      manifest: false, // we ship our own /public/manifest.json
      workbox: {
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/~oauth/, /^\/api/],
        // Cache JS/CSS/images aggressively (hashed filenames are safe)
        globPatterns: ["**/*.{js,css,html,png,svg,ico,webp,woff,woff2}"],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        runtimeCaching: [
          {
            // HTML navigations — always try network. Generous timeout so a
            // slow network still gets a chance at fresh HTML before falling
            // back to cache (short timeouts were silently serving stale HTML
            // and keeping computers on old versions).
            urlPattern: ({ request }) => request.mode === "navigate",
            handler: "NetworkFirst",
            options: {
              cacheName: "html",
              networkTimeoutSeconds: 10,
            },
          },

          {
            // Supabase REST/Realtime/Storage: NEVER cache via SW.
            // Caching here caused the "either-or" symptom — slow network + 5s
            // timeout returned a stale/empty response, React Query then stored
            // [] and the tab stayed empty until a manual refetch.
            // Offline support is handled by IndexedDB (offline-mutation) +
            // React Query persister; the SW must not duplicate that path.
            urlPattern: ({ url }) =>
              url.hostname.endsWith(".supabase.co") ||
              url.hostname.endsWith(".supabase.in") ||
              url.pathname.startsWith("/rest/") ||
              url.pathname.startsWith("/auth/") ||
              url.pathname.startsWith("/realtime/") ||
              url.pathname.startsWith("/storage/") ||
              url.pathname.startsWith("/functions/"),
            handler: "NetworkOnly",
          },
        ],
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
  },
}));
