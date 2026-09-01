/**
 * preview-auto-login — QA-режим ТОЛЬКО для preview/dev-хостов.
 *
 * Позволяет автоматически войти под тестовой учёткой, чтобы проверять
 * защищённые экраны (например Office → Import Statement / Rates /
 * Inter-Casino) без ручного редиректа на /login.
 *
 * Активация (любой из способов):
 *   1. URL: ?pv_user=<email>&pv_pass=<password>  (один раз; после входа
 *      креды сохраняются в sessionStorage и вычищаются из адресной строки)
 *   2. localStorage: cms:preview-autologin = {"email":"...","password":"..."}
 *
 * Жёсткие ограничения:
 *   - работает только на localhost / *.lovable.app / *.lovableproject.com
 *     / id-preview-- хостах или в DEV-сборке;
 *   - на продакшн-доменах (casinosystem.app и др.) полностью отключён;
 *   - ничего не делает, если сессия уже есть.
 */
import { supabase } from "@/integrations/supabase/client";

const LS_KEY = "cms:preview-autologin";
const SS_KEY = "cms:preview-autologin:session-creds";

export function isPreviewSurface(): boolean {
  if (typeof window === "undefined") return false;
  if (import.meta.env.DEV) return true;
  const host = window.location.hostname;
  return (
    host === "localhost" ||
    host.startsWith("127.") ||
    host.includes("id-preview--") ||
    host.endsWith(".lovable.app") ||
    host.endsWith(".lovableproject.com")
  );
}

type Creds = { email: string; password: string };

function readCreds(): Creds | null {
  try {
    const url = new URL(window.location.href);
    const email = url.searchParams.get("pv_user");
    const password = url.searchParams.get("pv_pass");
    if (email && password) {
      sessionStorage.setItem(SS_KEY, JSON.stringify({ email, password }));
      url.searchParams.delete("pv_user");
      url.searchParams.delete("pv_pass");
      window.history.replaceState(null, "", url.toString());
      return { email, password };
    }
    for (const raw of [sessionStorage.getItem(SS_KEY), localStorage.getItem(LS_KEY)]) {
      if (!raw) continue;
      const parsed = JSON.parse(raw) as Partial<Creds>;
      if (parsed?.email && parsed?.password) {
        return { email: parsed.email, password: parsed.password };
      }
    }
  } catch {
    /* ignore malformed config / blocked storage */
  }
  return null;
}

/** Выключить режим (очистить сохранённые креды). */
export function clearPreviewAutoLogin() {
  try {
    sessionStorage.removeItem(SS_KEY);
    localStorage.removeItem(LS_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Возвращает true, если вход выполнен этим механизмом.
 * Никогда не бросает исключений — при любой ошибке приложение
 * продолжает обычный flow с редиректом на /login.
 */
export async function tryPreviewAutoLogin(): Promise<boolean> {
  if (!isPreviewSurface()) return false;
  const creds = readCreds();
  if (!creds) return false;
  try {
    const { data } = await supabase.auth.getSession();
    if (data.session) return false;
    const { error } = await supabase.auth.signInWithPassword(creds);
    if (error) {
      console.warn("[preview-auto-login] sign-in failed:", error.message);
      return false;
    }
    console.info("[preview-auto-login] signed in as", creds.email);
    return true;
  } catch (e) {
    console.warn("[preview-auto-login] error", e);
    return false;
  }
}
