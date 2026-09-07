/**
 * printLiveGameReport — clones the on-screen Live Game printable area into a
 * hidden iframe and triggers window.print().
 *
 * Sheet geometry comes from PRINT_SHEET_CSS (src/lib/print-sheet-css.ts) — the
 * only place page size / orientation / breaks are defined. Do not add local
 * @page rules here.
 *
 * Looks for `.live-game-print-area` in the DOM (rendered via PrintPortal).
 */
import { PRINT_SHEET_STYLE_TAG } from "@/lib/print-sheet-css";

export const printLiveGameReport = () => {
  const source = document.querySelector<HTMLElement>(".live-game-print-area");
  if (!source) return;
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  const styles = Array.from(document.querySelectorAll<HTMLStyleElement | HTMLLinkElement>('style, link[rel="stylesheet"]'))
    .map((node) => node.outerHTML)
    .join("\n");
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument;
  if (!doc) {
    if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
    return;
  }
  doc.open();
  doc.write(`<!doctype html><html><head>${styles}${PRINT_SHEET_STYLE_TAG}</head><body><div class="live-game-print-area cms-print-root">${source.innerHTML}</div></body></html>`);

  doc.close();
  const cleanup = () => {
    setTimeout(() => {
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
    }, 500);
  };
  let didPrint = false;
  const runPrint = () => {
    if (didPrint) return;
    didPrint = true;
    requestAnimationFrame(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      cleanup();
    });
  };
  iframe.onload = runPrint;
  setTimeout(runPrint, 250);
};
