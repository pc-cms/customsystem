/**
 * UI V2 Preview — feature flag (presentation only).
 *
 * Scope: super_admin only. Persisted per-browser in localStorage.
 * Never written to the database. Removing the `src/v2` folder plus the
 * three call-sites (AppLayout, AppSidebar, main entry) fully removes it.
 */
import { useSyncExternalStore } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/lib/auth-context";

const KEY = "cms.ui.v2";
const EVT = "cms:ui-v2-changed";

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  window.addEventListener(EVT, cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener(EVT, cb);
    window.removeEventListener("storage", cb);
  };
};

const getSnapshot = () => {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
};

export const setUiV2 = (on: boolean) => {
  try {
    localStorage.setItem(KEY, on ? "1" : "0");
  } catch {
    /* ignore */
  }
  emit();
  window.dispatchEvent(new Event(EVT));
};

/** Raw stored flag (ignores roles / query param). */
export const useUiV2Stored = () =>
  useSyncExternalStore(subscribe, getSnapshot, () => false);

/** Routes covered by the V2 preview. */
export const V2_SCOPE_PREFIXES = [
  "/reports",          // sidebar "Statistics" (Live Game, Slots, Total, Groups, Tables, Graphics)
  "/miss-chips",       // part of the same report experience
  "/player-statistics", // Player Tracking (kept visually current)
  "/players",
  "/boss-dashboard",
  "/office",
  "/budget",
  "/expenses",
];


export const isV2ScopedPath = (pathname: string) =>
  V2_SCOPE_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/") || pathname.startsWith(p + "?"));

/**
 * Effective V2 state for the current user + route.
 * `?ui=v2` / `?ui=current` overrides the stored flag for super_admin only.
 */
export const useUiV2 = () => {
  const { roles } = useAuth();
  const stored = useUiV2Stored();
  const location = useLocation();
  const isSuperAdmin = roles.includes("super_admin");

  const param = new URLSearchParams(location.search).get("ui");
  const enabled = isSuperAdmin && (param === "v2" ? true : param === "current" ? false : stored);

  return {
    isSuperAdmin,
    enabled,
    inScope: enabled && isV2ScopedPath(location.pathname),
  };
};
