import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

/**
 * useSessionState — drop-in replacement for useState that mirrors the value
 * into sessionStorage so filters/sorts/active tabs/period selectors restore
 * automatically while the browser tab is open.
 *
 * Key shape: `cms:v1:ss:${userId}::${pathname}::${key}`
 *  - userId namespace ⇒ different users in the same tab don't see each other's
 *    filters (privacy + correctness on shared kiosks).
 *  - pathname namespace ⇒ same `key` ("search", "sort", ...) on different
 *    pages doesn't collide.
 *  - sessionStorage semantics ⇒ closing the tab wipes everything anyway.
 *
 * The AuthProvider calls `setSessionUserId(user?.id ?? null)` on every auth
 * change. When the userId changes, mounted hooks automatically re-read from
 * the new namespace.
 *
 * Do NOT use for form inputs, modal state, row selection, or operational
 * grid cells — restoring those leads to stale/confusing UX.
 */

const PREFIX = "cms:v1:ss:";

// ----- user-id pub/sub -----
let currentUserId: string | null = null;
const userListeners = new Set<() => void>();

export function setSessionUserId(id: string | null): void {
  const next = id || null;
  if (currentUserId === next) return;
  currentUserId = next;
  userListeners.forEach((l) => l());
}

function subscribeUserId(cb: () => void): () => void {
  userListeners.add(cb);
  return () => { userListeners.delete(cb); };
}

function snapshotUserId(): string | null {
  return currentUserId;
}

// ----- storage helpers -----
function readKey(fullKey: string): unknown {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = window.sessionStorage.getItem(fullKey);
    if (raw == null) return undefined;
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function writeKey(fullKey: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(fullKey, JSON.stringify(value));
  } catch {
    /* quota / serialization — ignore */
  }
}

function currentPath(): string {
  if (typeof window === "undefined") return "";
  return window.location.pathname || "";
}

function makeKey(userId: string | null, key: string): string {
  return `${PREFIX}${userId || "anon"}::${currentPath()}::${key}`;
}

export function useSessionState<T>(
  key: string,
  initial: T | (() => T),
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const userId = useSyncExternalStore(subscribeUserId, snapshotUserId, snapshotUserId);
  const fullKey = makeKey(userId, key);
  const initialRef = useRef(initial);
  initialRef.current = initial;

  const [value, setValue] = useState<T>(() => {
    const stored = readKey(fullKey);
    if (stored !== undefined) return stored as T;
    return typeof initial === "function" ? (initial as () => T)() : initial;
  });

  // On userId switch (different namespace), re-hydrate from the new bucket.
  const lastKeyRef = useRef(fullKey);
  useEffect(() => {
    if (lastKeyRef.current === fullKey) return;
    lastKeyRef.current = fullKey;
    const stored = readKey(fullKey);
    if (stored !== undefined) {
      setValue(stored as T);
    } else {
      const init = initialRef.current;
      setValue(typeof init === "function" ? (init as () => T)() : init);
    }
  }, [fullKey]);

  useEffect(() => {
    writeKey(fullKey, value);
  }, [fullKey, value]);

  const setter = useCallback<React.Dispatch<React.SetStateAction<T>>>(
    (next) => setValue(next),
    [],
  );

  return [value, setter];
}

/**
 * Legacy wipe — kept for compatibility. Per current policy we do NOT clear
 * on signOut: the userId namespace already isolates the next user, and the
 * tab close wipes everything anyway.
 */
export function clearSessionState(): void {
  if (typeof window === "undefined") return;
  try {
    const ss = window.sessionStorage;
    const toDelete: string[] = [];
    for (let i = 0; i < ss.length; i++) {
      const k = ss.key(i);
      if (k && k.startsWith(PREFIX)) toDelete.push(k);
    }
    toDelete.forEach((k) => ss.removeItem(k));
  } catch {
    /* ignore */
  }
}
