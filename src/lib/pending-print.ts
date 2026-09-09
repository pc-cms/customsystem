/**
 * Safety net for the mandatory closing-pack print.
 *
 * When a shift is closed the app navigates to a dedicated print route. If that
 * navigation is lost (view unmounts, reload, offline hiccup), the pending mark
 * stored here makes the Cage / Cage Slots screen re-open the print dialog once.
 */
export type PendingPrintKind = "live" | "slots";

export type PendingPrint = {
  kind: PendingPrintKind;
  shiftId: string;
  casinoId?: string | null;
};

const KEY = "cms.pendingPrint";

export const setPendingPrint = (p: PendingPrint) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch { /* storage unavailable — printing still works via the route */ }
};

export const getPendingPrint = (kind?: PendingPrintKind): PendingPrint | null => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingPrint;
    if (!parsed?.shiftId || !parsed?.kind) return null;
    if (kind && parsed.kind !== kind) return null;
    return parsed;
  } catch {
    return null;
  }
};

export const clearPendingPrint = () => {
  try {
    localStorage.removeItem(KEY);
  } catch { /* ignore */ }
};
