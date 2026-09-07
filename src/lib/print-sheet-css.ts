/**
 * PRINT_SHEET_CSS — THE single source of truth for the printed cash-desk
 * report sheet geometry (page size, orientation, margins, page breaks).
 *
 * FROZEN LAYOUT: do not change these rules as a side effect of a numbers fix.
 * Every print entry point (CloseShiftDialog, PrintSlotsShiftDialog,
 * ReprintShiftDialog / EditReprintShiftPage via printLiveGameReport, and the
 * Total Closing sheet) injects this exact string, so a sheet looks identical
 * regardless of where printing was launched from.
 *
 * Orientation is declared by the sheet itself:
 *   .rv2-page          → A4 portrait  (Slots, Live Game, Total Closing)
 *   .rv2-page-land     → A4 landscape (Casino Chips Movement)
 */
export const PRINT_SHEET_CSS = `
@media print {
  @page rv2portrait { size: A4 portrait; margin: 8mm; }
  @page rv2landscape { size: A4 landscape; margin: 8mm; }

  html:has(.rv2-page),
  body:has(.rv2-page),
  .cms-print-root:has(.rv2-page),
  .slots-print-area:has(.rv2-page),
  .live-game-print-area:has(.rv2-page) {
    page: rv2portrait;
    background: #fff !important;
  }

  /* Absolute positioning breaks page fragmentation for the V2 sheets */
  .cms-print-root:has(.rv2-page),
  .slots-print-area:has(.rv2-page),
  .live-game-print-area:has(.rv2-page) {
    position: static !important;
    display: block !important;
    width: auto !important;
    min-height: 0 !important;
    padding: 0 !important;
    margin: 0 !important;
  }

  /* Wrappers must never impose their own page or break */
  #shift-print-area,
  #chip-print-area {
    position: relative !important;
    left: 0 !important;
    width: auto !important;
    padding: 0 !important;
    margin: 0 !important;
    display: block !important;
    page: auto !important;
    break-before: auto !important;
    page-break-before: auto !important;
    break-after: auto !important;
    page-break-after: auto !important;
  }

  .rv2-page {
    page: rv2portrait !important;
    width: 194mm !important;
    max-width: 194mm !important;
    height: 277mm !important;
    min-height: 277mm !important;
    max-height: 277mm !important;
    overflow: hidden !important;
    font-size: 10.5px !important;
    line-height: 1.3 !important;
    zoom: 1 !important;
    break-after: page !important;
    page-break-after: always !important;
    break-inside: avoid !important;
    page-break-inside: avoid !important;
  }

  .rv2-page.rv2-page-land {
    page: rv2landscape !important;
    width: 281mm !important;
    max-width: 281mm !important;
    height: 190mm !important;
    min-height: 190mm !important;
    max-height: 190mm !important;
  }

  .rv2-page:last-child {
    break-after: auto !important;
    page-break-after: auto !important;
  }

  .rv2-break {
    display: block;
    height: 0;
    break-after: page;
    page-break-after: always;
  }

  .rv2-card,
  .rv2-page table,
  .rv2-page thead,
  .rv2-page tfoot,
  .rv2-page tr {
    break-inside: avoid !important;
    page-break-inside: avoid !important;
  }
}
`;

/** Sheet CSS wrapped in a <style> string, for the print iframes. */
export const PRINT_SHEET_STYLE_TAG = `<style data-print-sheet="1">
html, body { margin: 0; background: white; font-size: 16px; -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }
@media print { html, body { margin: 0 !important; background: white !important; } body, body * { visibility: visible !important; } }
${PRINT_SHEET_CSS}
</style>`;
