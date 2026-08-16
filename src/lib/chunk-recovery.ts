/**
 * Auto-recovery from stale service worker chunks.
 *
 * After a deploy, an installed PWA may still hold the OLD index.html in cache.
 * That OLD HTML references JS chunk filenames (with content hashes) that no
 * longer exist on the server. When the app tries to dynamic-import a route,
 * it fails with "Failed to fetch dynamically imported module" or
 * "ChunkLoadError" — and the user gets bounced (often to /login) or sees
 * a blank ErrorBoundary.
 *
 * Strategy:
 *  - Listen for unhandledrejection / error events globally.
 *  - If the message looks like a chunk-load failure, unregister all SWs,
 *    purge caches, and hard-reload ONCE per session (sessionStorage flag
 *    prevents infinite reload loops).
 */
const RECOVERY_FLAG = "__pwa_chunk_recovery_done__";

const CHUNK_ERROR_PATTERNS = [
  /Failed to fetch dynamically imported module/i,
  /Importing a module script failed/i,
  /ChunkLoadError/i,
  /Loading chunk \d+ failed/i,
  /Loading CSS chunk/i,
  /error loading dynamically imported module/i,
];

const looksLikeChunkError = (message: string | undefined): boolean => {
  if (!message) return false;
  return CHUNK_ERROR_PATTERNS.some((rx) => rx.test(message));
};

const recoverFromStaleCache = async () => {
  // CRITICAL: if we're offline, DO NOT nuke caches and reload.
  // The chunk failed because it was never loaded online (lazy route) —
  // wiping SW caches here would destroy the entire offline shell and
  // drop the user on Chrome's "no internet" dinosaur page.
  // Instead, surface a friendly toast and let the user navigate elsewhere.
  if (!navigator.onLine) {
    console.warn("[ChunkRecovery] Chunk missing while offline — keeping caches intact.");
    try {
      // Fire a global event so a UI banner can react.
      window.dispatchEvent(
        new CustomEvent("cms:offline-chunk-missing", {
          detail: { path: window.location.pathname },
        }),
      );
    } catch {
      /* ignore */
    }
    return;
  }

  // Guard: only recover once per session, otherwise we may loop forever
  if (sessionStorage.getItem(RECOVERY_FLAG)) {
    console.warn("[ChunkRecovery] Already attempted recovery this session — giving up.");
    return;
  }

  // NEVER reload while the operator has unsaved input on screen
  // (Chips Check, cash count, etc.) — ask instead.
  if (hasDirtyWork()) {
    console.warn("[ChunkRecovery] Stale chunk, but unsaved work on screen — asking user.");
    toast("New version available", {
      description: "Save your current entry, then click Reload.",
      duration: Infinity,
      action: { label: "Reload", onClick: () => { void purgeAndReload(); } },
    });
    return;
  }

  sessionStorage.setItem(RECOVERY_FLAG, "1");
  console.warn("[ChunkRecovery] Stale chunk detected — purging SW caches and reloading.");
  await purgeAndReload();
};

const purgeAndReload = async () => {
  sessionStorage.setItem(RECOVERY_FLAG, "1");
  try {
    // Unregister every service worker on this origin
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
    // Clear every Cache Storage bucket
    if ("caches" in window) {
      const names = await caches.keys();
      await Promise.all(names.map((n) => caches.delete(n)));
    }
  } catch (e) {
    console.error("[ChunkRecovery] Cleanup failed", e);
  } finally {
    // Hard reload bypasses HTTP cache as well
    window.location.reload();
  }
};

export const installChunkRecovery = () => {
  if (typeof window === "undefined") return;

  window.addEventListener("error", (event) => {
    const msg =
      (event.error && (event.error.message || String(event.error))) ||
      event.message;
    if (looksLikeChunkError(msg)) {
      void recoverFromStaleCache();
    }
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const msg =
      (reason && (reason.message || String(reason))) || undefined;
    if (looksLikeChunkError(msg)) {
      void recoverFromStaleCache();
    }
  });
};
