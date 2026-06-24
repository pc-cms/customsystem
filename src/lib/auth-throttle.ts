/**
 * Auth Throttle — minimal global guard around Supabase refresh-token requests.
 *
 * Why: All casino devices share one public IP. Supabase Auth rate-limits per IP.
 * With 5-10 devices each refreshing on its own schedule, bursts can trigger
 * HTTP 429 → session invalidation → forced re-login storm.
 *
 * What this does:
 *   1. Only guards refresh_token calls. Password login is never delayed.
 *   2. Coalesces concurrent refreshes from THE SAME tab — callers wait for one
 *      shared in-flight request.
 *   3. On HTTP 429, waits a cooldown and retries once. Does NOT fabricate a
 *      fake success response (that was unsafe — refresh tokens rotate).
 *
 * What this intentionally does NOT do anymore:
 *   - No startup jitter / artificial delay on the FIRST refresh. That blocked
 *     app boot when getSession() needed to refresh on cold start, leaving the
 *     UI stuck on a blank screen for up to 26 seconds.
 *   - No localStorage-shared timing between tabs (leader election in
 *     auth-leader.ts already ensures only ONE tab refreshes per device).
 *   - No fabricated fallback response from cached session (unsafe — caused
 *     stale tokens to be reintroduced into storage).
 */

import { clearStoredAuthSession, isInvalidRefreshTokenResponse, notifyInvalidRefreshToken } from "@/lib/auth-storage";

const TOKEN_PATH = "/auth/v1/token";
const RATE_LIMIT_COOLDOWN_MS = 30_000;
const MAX_429_RETRIES = 1;

let inFlight: Promise<Response> | null = null;
let cooldownUntil = 0;

const originalFetch = typeof window !== "undefined" ? window.fetch.bind(window) : null;

function isRefreshTokenRequest(input: RequestInfo | URL, init?: RequestInit): boolean {
  try {
    const url = typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : (input as Request).url;
    if (!url.includes(TOKEN_PATH)) return false;
    if (url.includes("grant_type=refresh_token")) return true;

    const body = init?.body;
    if (typeof body === "string") {
      return body.includes("refresh_token") || body.includes("grant_type=refresh_token");
    }
    if (body instanceof URLSearchParams) {
      return body.get("grant_type") === "refresh_token" || body.has("refresh_token");
    }
  } catch {
    return false;
  }
  return false;
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

async function guardedRefreshFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (!originalFetch) return fetch(input, init);

  // Coalesce concurrent refresh calls from this tab.
  if (inFlight) {
    const shared = await inFlight;
    return shared.clone();
  }

  inFlight = (async () => {
    try {
      // Honor cooldown if we recently got a 429.
      const now = Date.now();
      if (now < cooldownUntil) {
        await delay(cooldownUntil - now);
      }

      for (let attempt = 0; attempt <= MAX_429_RETRIES; attempt += 1) {
        const res = await originalFetch(input, init);
        if (await isInvalidRefreshTokenResponse(res)) {
          console.warn("[auth-throttle] invalid refresh token — clearing stale local session");
          clearStoredAuthSession();
          notifyInvalidRefreshToken();
          return res;
        }
        if (res.status !== 429) return res;

        cooldownUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS;
        console.warn(`[auth-throttle] refresh_token 429 (attempt ${attempt + 1}), cooling down ${RATE_LIMIT_COOLDOWN_MS}ms`);
        if (attempt < MAX_429_RETRIES) {
          await delay(RATE_LIMIT_COOLDOWN_MS);
          continue;
        }
        return res;
      }

      return originalFetch(input, init);
    } finally {
      inFlight = null;
    }
  })();

  const result = await inFlight;
  return result.clone();
}

let installed = false;

export function installAuthThrottle() {
  if (installed || typeof window === "undefined" || !originalFetch) return;
  installed = true;

  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    if (isRefreshTokenRequest(input, init)) {
      return guardedRefreshFetch(input, init);
    }
    return originalFetch(input, init);
  }) as typeof window.fetch;
}
