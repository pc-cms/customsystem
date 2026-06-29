/**
 * printLiveGameReport — clones the on-screen Live Game printable area into a
 * hidden iframe with A4 portrait styling and triggers window.print().
 *
 * Shared by ReprintShiftDialog and EditReprintShiftDialog so the printed
 * output looks identical regardless of where it was launched from.
 *
 * Looks for `.live-game-print-area` in the DOM (rendered via PrintPortal).
 */
const ensureLiveGamePortraitPrintStyle = () => {
  const existing = document.head.querySelector<HTMLStyleElement>('style[data-live-game-print="1"]');
  const styleEl = existing || document.createElement("style");
  styleEl.setAttribute("data-live-game-print", "1");
  styleEl.textContent = `
    @media print {
      @page portrait { size: A4 portrait; margin: 8mm; }
    }
  `;
  if (!existing) document.head.appendChild(styleEl);
  return styleEl;
};

export const printLiveGameReport = () => {
  const source = document.querySelector<HTMLElement>(".live-game-print-area");
  if (!source) return;
  ensureLiveGamePortraitPrintStyle();
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
  doc.write(`<!doctype html><html><head>${styles}<style>
    @media print {
      @page portrait { size: A4 portrait; margin: 8mm; }
      html, body { margin: 0 !important; background: white !important; }
      body, body * { visibility: visible !important; }
      .live-game-print-area { display: block !important; }
      #shift-print-area {
        page: portrait !important;
        width: 194mm !important;
        padding: 0 !important;
        page-break-after: always !important;
        break-after: page !important;
      }
      #chip-print-area {
        page: portrait !important;
        width: 194mm !important;
        padding: 0 !important;
        page-break-before: always !important;
        break-before: page !important;
        page-break-after: auto !important;
        break-after: auto !important;
      }
    }
  </style></head><body><div class="live-game-print-area cms-print-root">${source.innerHTML}</div></body></html>`);
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
