import { useCallback, useEffect, useState } from "react";

/**
 * Personal merge basket kept in sessionStorage.
 * Survives page navigation, dies with the tab.
 * Broadcast via storage-like custom event for same-tab sync.
 */
const KEY = "merge-basket-v1";
const EVT = "merge-basket-change";
const MAX_ITEMS = 5;

const read = (): string[] => {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
};

const write = (ids: string[]) => {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(ids));
  } catch {}
  window.dispatchEvent(new CustomEvent(EVT));
};

export const useMergeBasket = () => {
  const [ids, setIds] = useState<string[]>(() => read());

  useEffect(() => {
    const onChange = () => setIds(read());
    window.addEventListener(EVT, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener(EVT, onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  const add = useCallback((id: string) => {
    const cur = read();
    if (cur.includes(id)) return;
    if (cur.length >= MAX_ITEMS) return;
    write([...cur, id]);
  }, []);

  const addMany = useCallback((newIds: string[]) => {
    const cur = read();
    const merged = [...cur];
    for (const id of newIds) {
      if (merged.includes(id)) continue;
      if (merged.length >= MAX_ITEMS) break;
      merged.push(id);
    }
    write(merged);
  }, []);

  const remove = useCallback((id: string) => {
    write(read().filter(x => x !== id));
  }, []);

  const clear = useCallback(() => write([]), []);

  const toggle = useCallback((id: string) => {
    const cur = read();
    if (cur.includes(id)) write(cur.filter(x => x !== id));
    else if (cur.length < MAX_ITEMS) write([...cur, id]);
  }, []);

  const has = useCallback((id: string) => ids.includes(id), [ids]);

  return { ids, add, addMany, remove, clear, toggle, has, max: MAX_ITEMS, count: ids.length };
};
