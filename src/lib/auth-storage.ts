const AUTH_TOKEN_KEY_RE = /^sb-.*-auth-token$/;

export const AUTH_INVALID_REFRESH_EVENT = "cms:auth-invalid-refresh";

export function clearStoredAuthSession() {
  if (typeof window === "undefined") return;
  try {
    for (const key of Object.keys(window.localStorage)) {
      if (AUTH_TOKEN_KEY_RE.test(key)) {
        window.localStorage.removeItem(key);
      }
    }
  } catch {
    // ignore storage errors (private mode / blocked storage)
  }
}

export function isInvalidRefreshTokenError(error: unknown): boolean {
  const message = error instanceof Error
    ? error.message
    : typeof error === "string"
      ? error
      : JSON.stringify(error ?? "");
  return /invalid refresh token|refresh token not found/i.test(message);
}

export async function isInvalidRefreshTokenResponse(response: Response): Promise<boolean> {
  if (![400, 401, 403].includes(response.status)) return false;
  try {
    const text = await response.clone().text();
    return /invalid refresh token|refresh token not found/i.test(text);
  } catch {
    return false;
  }
}

export function notifyInvalidRefreshToken() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(AUTH_INVALID_REFRESH_EVENT));
}