import { useCallback, useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth-context";

/**
 * useScrollMemory — persist a scroll container's scrollLeft/scrollTop in
 * sessionStorage, namespaced per user + per pathname (mirrors useSessionState).
 * Restores once after `ready` flips true (i.e. content has rendered with its
 * real width/height); subsequent scrolls write back (debounced).
 *
 * Usage:
 *   const { ref, onScroll } = useScrollMemory("breaklist-scroll", !isLoading);
 *   <div ref={ref} onScroll={onScroll} className="overflow-auto"> ... </div>
 */

const PREFIX = "cms:v1:ss:";

interface ScrollPos { x: number; y: number }

function keyFor(userId: string | null | undefined, key: string): string {
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
  const { user } = useAuth();
  const fullKey = keyFor(user?.id, key);
  const ref = useRef<T | null>(null);
  const restoredRef = useRef(false);
  const writeTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!ready || restoredRef.current) return;
    const el = ref.current;
    if (!el) return;
    const pos = read(fullKey);
    if (pos) {
      requestAnimationFrame(() => {
        if (!ref.current) return;
        ref.current.scrollLeft = pos.x;
        ref.current.scrollTop = pos.y;
        restoredRef.current = true;
      });
    } else {
      restoredRef.current = true;
    }
  }, [ready, fullKey]);

  // Reset restore flag if user/path changes.
  useEffect(() => { restoredRef.current = false; }, [fullKey]);

  const onScroll = useCallback(() => {
    if (!restoredRef.current) return;
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
