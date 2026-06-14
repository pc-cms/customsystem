import { useCallback, useEffect, useRef, useState } from "react";

/**
 * useSessionState — drop-in replacement for useState that mirrors the value
 * into sessionStorage so filters/sorts/active tabs/period selectors restore
 * automatically while the browser tab is open.
 *
 * - Key is auto-namespaced by current pathname so the same `key` ("search",
 *   "sort", ...) on different pages doesn't collide.
 * - Closing the tab clears the state (sessionStorage semantics).
 * - On signOut call `clearSessionState()` to wipe everything for the next user.
 *
 * Do NOT use for form inputs, modal state, row selection, or operational
 * grid cells — restoring those leads to stale/confusing UX.
 */

const PREFIX = "cms:v1:ss:";

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

export function useSessionState<T>(
  key: string,
  initial: T | (() => T),
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const fullKeyRef = useRef<string>(`${PREFIX}${currentPath()}::${key}`);

  const [value, setValue] = useState<T>(() => {
    const stored = readKey(fullKeyRef.current);
    if (stored !== undefined) return stored as T;
    return typeof initial === "function" ? (initial as () => T)() : initial;
  });

  useEffect(() => {
    writeKey(fullKeyRef.current, value);
  }, [value]);

  const setter = useCallback<React.Dispatch<React.SetStateAction<T>>>(
    (next) => setValue(next),
    [],
  );

  return [value, setter];
}

/** Wipe all useSessionState entries (call on signOut). */
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
