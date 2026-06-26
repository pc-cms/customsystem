import { useCallback, useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth-context";

/**
 * useScrollMemory — persist a scroll container's scrollLeft/scrollTop,
 * namespaced per user + per pathname. Defaults to sessionStorage (per-tab);
 * pass `persist: "local"` to survive tab close via localStorage.
 *
 * Usage:
 *   const { ref, onScroll } = useScrollMemory("breaklist-scroll", !isLoading, { persist: "local" });
 *   <div ref={ref} onScroll={onScroll} className="overflow-auto"> ... </div>
 */

const PREFIX_SS = "cms:v1:ss:";
const PREFIX_LS = "cms:v1:ls:scroll:";

interface ScrollPos { x: number; y: number }
type PersistMode = "session" | "local";

function keyFor(userId: string | null | undefined, key: string, mode: PersistMode): string {
  const prefix = mode === "local" ? PREFIX_LS : PREFIX_SS;
  const path = typeof window !== "undefined" ? window.location.pathname : "";
  return `${prefix}${userId || "anon"}::${path}::${key}`;
}

function storageFor(mode: PersistMode): Storage | null {
  if (typeof window === "undefined") return null;
  try { return mode === "local" ? window.localStorage : window.sessionStorage; } catch { return null; }
}

function read(fullKey: string, mode: PersistMode): ScrollPos | null {
  const store = storageFor(mode);
  if (!store) return null;
  try {
    const raw = store.getItem(fullKey);
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (typeof v?.x === "number" && typeof v?.y === "number") return v;
  } catch { /* ignore */ }
  return null;
}

function write(fullKey: string, pos: ScrollPos, mode: PersistMode) {
  const store = storageFor(mode);
  if (!store) return;
  try { store.setItem(fullKey, JSON.stringify(pos)); } catch { /* ignore */ }
}

export function useScrollMemory<T extends HTMLElement = HTMLDivElement>(
  key: string,
  ready: boolean,
  opts: { persist?: PersistMode } = {},
) {
  const mode: PersistMode = opts.persist ?? "session";
  const { user } = useAuth();
  const fullKey = keyFor(user?.id, key, mode);
  const ref = useRef<T | null>(null);
  const restoredRef = useRef(false);
  const writeTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!ready || restoredRef.current) return;
    const el = ref.current;
    if (!el) return;
    const pos = read(fullKey, mode);
    if (!pos || (pos.x === 0 && pos.y === 0)) {
      restoredRef.current = true;
      return;
    }
    // Wait until layout is wide/tall enough to honor the saved position.
    // Otherwise scrollLeft gets clamped to 0 because inner content is still rendering.
    let cancelled = false;
    let attempts = 0;
    const tryApply = () => {
      if (cancelled || !ref.current) return;
      const node = ref.current;
      const maxX = node.scrollWidth - node.clientWidth;
      const maxY = node.scrollHeight - node.clientHeight;
      const ready2 = (pos.x === 0 || maxX >= pos.x - 1) && (pos.y === 0 || maxY >= pos.y - 1);
      if (ready2 || attempts > 60) {
        node.scrollLeft = Math.min(pos.x, Math.max(0, maxX));
        node.scrollTop = Math.min(pos.y, Math.max(0, maxY));
        restoredRef.current = true;
        return;
      }
      attempts += 1;
      requestAnimationFrame(tryApply);
    };
    requestAnimationFrame(tryApply);
    return () => { cancelled = true; };
  }, [ready, fullKey, mode]);

  // Reset restore flag if user/path changes.
  useEffect(() => { restoredRef.current = false; }, [fullKey]);

  const onScroll = useCallback(() => {
    if (!restoredRef.current) return;
    const el = ref.current;
    if (!el) return;
    if (writeTimer.current != null) window.clearTimeout(writeTimer.current);
    writeTimer.current = window.setTimeout(() => {
      write(fullKey, { x: el.scrollLeft, y: el.scrollTop }, mode);
    }, 150);
  }, [fullKey, mode]);

  useEffect(() => () => {
    if (writeTimer.current != null) window.clearTimeout(writeTimer.current);
  }, []);

  return { ref, onScroll };
}
