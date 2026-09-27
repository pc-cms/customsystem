/**
 * Shared-terminal POS operator session (waiter unlocked by PIN).
 * Stored in sessionStorage only — never long-term persistent storage.
 * The token is opaque; the server validates it on every order.
 */
import { useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";

export type PosOperator = {
  token: string;
  employee_id: string;
  full_name: string;
  role: string;
  casino_id: string;
  expires_at: string;
};

const KEY = "pos.operator.v1";
const listeners = new Set<() => void>();
let cache: PosOperator | null = read();

function read(): PosOperator | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const op = JSON.parse(raw) as PosOperator;
    if (new Date(op.expires_at).getTime() <= Date.now()) {
      sessionStorage.removeItem(KEY);
      return null;
    }
    return op;
  } catch {
    return null;
  }
}

function emit() {
  listeners.forEach((l) => l());
}

export function getPosOperator(): PosOperator | null {
  if (cache && new Date(cache.expires_at).getTime() <= Date.now()) {
    cache = null;
    sessionStorage.removeItem(KEY);
  }
  return cache;
}

export function setPosOperator(op: PosOperator | null) {
  cache = op;
  if (op) sessionStorage.setItem(KEY, JSON.stringify(op));
  else sessionStorage.removeItem(KEY);
  emit();
}

export async function unlockPosOperator(casinoId: string, pin: string): Promise<PosOperator> {
  const { data, error } = await supabase.rpc("pos_operator_unlock", { _casino_id: casinoId, _pin: pin });
  if (error) {
    const msg = String(error.message ?? "");
    throw new Error(msg.includes("Too many attempts") ? "Too many attempts. Wait a few minutes and try again." : "Invalid PIN.");
  }
  const row = (Array.isArray(data) ? data[0] : data) as any;
  if (!row?.token) throw new Error("Invalid PIN.");
  const op: PosOperator = {
    token: row.token,
    employee_id: row.employee_id,
    full_name: row.full_name,
    role: row.role,
    casino_id: casinoId,
    expires_at: row.expires_at,
  };
  setPosOperator(op);
  return op;
}

export async function lockPosOperator() {
  const op = cache;
  setPosOperator(null);
  if (op) {
    try { await supabase.rpc("pos_operator_lock", { _token: op.token }); } catch { /* best-effort */ }
  }
}

export function usePosOperator(casinoId: string | null): PosOperator | null {
  const op = useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    () => getPosOperator(),
  );
  return op && op.casino_id === casinoId ? op : null;
}
