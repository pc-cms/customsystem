/**
 * Global Realtime status store — populated by useRealtimeSubscriptions
 * and consumed by <RealtimeStatusIndicator />.
 */
export type RealtimeStatus = "connecting" | "connected" | "error" | "closed";

type State = {
  status: RealtimeStatus;
  lastEventAt: number | null;
  lastTable: string | null;
};

let state: State = { status: "connecting", lastEventAt: null, lastTable: null };
const listeners = new Set<(s: State) => void>();

export function setRealtimeStatus(status: RealtimeStatus) {
  state = { ...state, status };
  listeners.forEach((fn) => fn(state));
}

export function markRealtimeEvent(table: string) {
  state = { ...state, lastEventAt: Date.now(), lastTable: table };
  listeners.forEach((fn) => fn(state));
}

export function getRealtimeState(): State {
  return state;
}

export function subscribeRealtimeState(fn: (s: State) => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
