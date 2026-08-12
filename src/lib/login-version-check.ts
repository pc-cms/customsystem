/**
 * login-version-check — гарантирует, что на экране логина всегда загружена
 * актуальная сборка фронта. CTRL+SHIFT+R не всегда помогает, потому что
 * index.html может отдаваться из кэша service worker'а.
 *
 * Логика (запускается только на login-экране, где пользователь ещё не работает,
 * поэтому перезагрузка безопасна):
 *   1. Дёргаем registration.update() — SW проверяет наличие новой версии.
 *   2. Если есть waiting/installing SW → сразу применяем (без диалога).
 *   3. Параллельно тянем /index.html с cache: no-store и сравниваем имя
 *      главного бандла с тем, что реально загружен в документе. Если сервер
 *      отдаёт другой хэш → сборка устарела → resetPWACache() (жёсткий сброс).
 *
 * Защита от циклов: одна проверка на вкладку (sessionStorage-флаг).
 */
import { useEffect } from "react";
import { resetPWACache } from "@/lib/pwa-register";

const FLAG = "cms:login-version-checked";

const isInIframe = (() => {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
})();

const host = typeof window !== "undefined" ? window.location.hostname : "";
const isPreviewHost =
  host.includes("lovableproject.com") ||
  host.includes("id-preview--") ||
  host.includes("localhost") ||
  host.startsWith("127.");

function loadedEntryScripts(): string[] {
  return Array.from(document.querySelectorAll<HTMLScriptElement>("script[src]"))
    .map((s) => {
      try {
        return new URL(s.src, window.location.origin).pathname;
      } catch {
        return "";
      }
    })
    .filter((p) => /\/assets\/.*\.js$/.test(p));
}

async function serverEntryScripts(): Promise<string[]> {
  const res = await fetch(`/index.html?_v=${Date.now().toString(36)}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const out: string[] = [];
  const re = /<script[^>]+src="([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const src = m[1];
    if (/\/assets\/.*\.js$/.test(src)) {
      out.push(src.startsWith("http") ? new URL(src).pathname : src);
    }
  }
  return out;
}

export async function checkFrontendVersion(): Promise<void> {
  if (typeof window === "undefined") return;
  if (isInIframe || isPreviewHost || import.meta.env.DEV) return;
  if (sessionStorage.getItem(FLAG) === "1") return;
  sessionStorage.setItem(FLAG, "1");

  // 1) Попросить service worker проверить обновление и применить его сразу.
  try {
    const regs = (await navigator.serviceWorker?.getRegistrations?.()) ?? [];
    for (const reg of regs) {
      await reg.update().catch(() => {});
      const waiting = reg.waiting;
      if (waiting) {
        waiting.postMessage({ type: "SKIP_WAITING" });
      }
    }
  } catch {
    /* ignore */
  }

  // 2) Сравнить бандл на сервере с загруженным.
  try {
    const server = await serverEntryScripts();
    if (!server.length) return;
    const loaded = new Set(loadedEntryScripts());
    const stale = server.every((p) => !loaded.has(p));
    if (stale) {
      console.warn("[version] Stale build detected — forcing refresh", {
        server,
        loaded: [...loaded],
      });
      await resetPWACache();
    }
  } catch {
    /* оффлайн / нет доступа — работаем как есть */
  }
}

/** Хук для экранов логина. */
export function useLoginVersionCheck() {
  useEffect(() => {
    checkFrontendVersion().catch(() => {});
  }, []);
}
