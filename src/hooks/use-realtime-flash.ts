/**
 * useRealtimeFlash — attach a transient `.realtime-flash` CSS class to a
 * row whenever its underlying record updates via Realtime.
 *
 * Usage:
 *   const ref = useRealtimeFlash(row.id, row.updated_at ?? row.created_at);
 *   return <tr ref={ref}>…</tr>;
 *
 * The hook tracks the last seen `key` (id + timestamp). When it changes
 * after the first render, the className is added for 1 second and removed
 * automatically. Initial mount never flashes (avoids "list-load" noise).
 */
import { useEffect, useRef } from "react";

export function useRealtimeFlash<T extends HTMLElement = HTMLElement>(
  id: string | number | null | undefined,
  version: string | number | null | undefined,
) {
  const ref = useRef<T | null>(null);
  const lastKey = useRef<string | null>(null);
  const firstRun = useRef(true);

  useEffect(() => {
    const key = id == null || version == null ? null : `${id}|${version}`;
    if (firstRun.current) {
      firstRun.current = false;
      lastKey.current = key;
      return;
    }
    if (key === lastKey.current) return;
    lastKey.current = key;
    const el = ref.current;
    if (!el) return;
    el.classList.remove("realtime-flash");
    // Force reflow so the animation restarts when the same row updates twice.
    void el.offsetWidth;
    el.classList.add("realtime-flash");
    const t = setTimeout(() => el.classList.remove("realtime-flash"), 1000);
    return () => clearTimeout(t);
  }, [id, version]);

  return ref;
}
