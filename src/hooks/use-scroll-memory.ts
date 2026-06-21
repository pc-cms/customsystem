import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";

/**
 * useScrollMemory — persist a scroll container's scrollLeft/scrollTop in
 * sessionStorage, namespaced per user + per pathname (same scheme as
 * useSessionState). Restores once after content mounts; subsequent scrolls
 * write back (debounced).
 *
 * Usage:
 *   const { ref, onScroll } = useScrollMemory("breaklist-scroll", ready);
 *   <div ref={ref} onScroll={onScroll} className="overflow-auto"> ... </div>
 *
 * `ready` should flip to true once the content with its real width/height
 * has rendered — otherwise restoring to (x,y) would clamp to 0 because the
 * container has no scrollable content yet.
 */

const PREFIX = "cms:v1:ss:";

// Mirror of useSessionState user-id store (kept as a duplicate tiny subscriber
// to avoid a circular import — same source publishes via setSessionUserId).
let currentUserId: string | null = null;
const listeners = new Set<() => void>();

// Read the current value lazily — useSessionState owns the setter; we only
// listen by polling on each subscribe tick via a microtask.
function readUserIdFromGlobal(): string | null {
  // Re-import via dynamic require avoided; instead rely on storage key.
  return currentUserId;
}

// Lightweight bridge: read the same key useSessionState uses.
function snapshot(): string | null {
  return currentUserId;
}
function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

// Sync from useSessionState's userId by reading sessionStorage's user-tagged
// keys is unreliable — instead, expose a setter that auth-context could call.
// To stay decoupled, we ALSO read from window.__cmsUserId if present.
if (typeof window !== "undefined") {
  // @ts-ignore
  window.__cmsScrollMemoryBind = (id: string | null) => {
    if (currentUserId === id) return;
    currentUserId = id;
    listeners.forEach((l) => l());
  };
}

interface ScrollPos { x: number; y: number }

function keyFor(userId: string | null, key: string): string {
  const path = typeof window !== "undefined" ? window.location.pathname : "";
  return `${PREFIX}${userId || "anon"}::${path}::${key}`;
}

function read(fullKey: string): ScrollPos | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(fullKey);
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (typeof v?.x === "number" && typeof v?.y === "number") return v;
  } catch { /* ignore */ }
  return null;
}

function write(fullKey: string, pos: ScrollPos) {
  if (typeof window === "undefined") return;
  try { window.sessionStorage.setItem(fullKey, JSON.stringify(pos)); } catch { /* ignore */ }
}

export function useScrollMemory<T extends HTMLElement = HTMLDivElement>(
  key: string,
  ready: boolean,
) {
  const userId = useSyncExternalStore(subscribe, snapshot, snapshot);
  const fullKey = keyFor(userId, key);
  const ref = useRef<T | null>(null);
  const restoredRef = useRef(false);
  const writeTimer = useRef<number | null>(null);

  // Restore once content is ready.
  useEffect(() => {
    if (!ready || restoredRef.current) return;
    const el = ref.current;
    if (!el) return;
    const pos = read(fullKey);
    if (pos) {
      // Run after paint so scrollWidth/Height are final.
      requestAnimationFrame(() => {
        el.scrollLeft = pos.x;
        el.scrollTop = pos.y;
        restoredRef.current = true;
      });
    } else {
      restoredRef.current = true;
    }
  }, [ready, fullKey]);

  // Reset restore flag when key changes (user switched / route changed).
  useEffect(() => {
    restoredRef.current = false;
  }, [fullKey]);

  const onScroll = useCallback(() => {
    if (!restoredRef.current) return; // don't capture pre-restore (0,0)
    const el = ref.current;
    if (!el) return;
    if (writeTimer.current != null) window.clearTimeout(writeTimer.current);
    writeTimer.current = window.setTimeout(() => {
      write(fullKey, { x: el.scrollLeft, y: el.scrollTop });
    }, 150);
  }, [fullKey]);

  useEffect(() => () => {
    if (writeTimer.current != null) window.clearTimeout(writeTimer.current);
  }, []);

  return { ref, onScroll };
}
