/**
 * Persist React Query cache to IndexedDB for offline reads.
 * Uses idb-keyval for simple key-value storage.
 */
import { get, set, del } from "idb-keyval";
import type { PersistedClient, Persister } from "@tanstack/react-query-persist-client";

const IDB_KEY = "cms-query-cache";
const PERSIST_DEBOUNCE_MS = 1000;

let pendingClient: PersistedClient | null = null;
let persistTimer: ReturnType<typeof setTimeout> | null = null;

const flushPendingClient = async () => {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  const client = pendingClient;
  pendingClient = null;
  if (!client) return;
  await set(IDB_KEY, client);
};

export async function clearIDBPersistedQueryCache() {
  pendingClient = null;
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  await del(IDB_KEY);
}

export function createIDBPersister(): Persister {
  return {
    persistClient: async (client: PersistedClient) => {
      try {
        // Debounce IndexedDB writes. In installed PWA mode, writing the full
        // cache after every live event can block older/low-power PCs and makes
        // the PWA feel slower than a normal browser tab.
        pendingClient = client;
        if (persistTimer) return;
        persistTimer = setTimeout(() => {
          void flushPendingClient().catch((e) => {
            console.warn("[Persister] Failed to save cache:", e);
          });
        }, PERSIST_DEBOUNCE_MS);
      } catch (e) {
        console.warn("[Persister] Failed to save cache:", e);
      }
    },
    restoreClient: async () => {
      try {
        return await get<PersistedClient>(IDB_KEY);
      } catch (e) {
        console.warn("[Persister] Failed to restore cache:", e);
        return undefined;
      }
    },
    removeClient: async () => {
      try {
        await clearIDBPersistedQueryCache();
      } catch (e) {
        // ignore
      }
    },
  };
}
