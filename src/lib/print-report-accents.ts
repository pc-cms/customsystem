/**
 * Shared CSS accents for printable cash-desk reports.
 *
 * Injected as a <style> block inside each report root (scoped by id) so the
 * printed and on-screen previews get consistent, high-contrast styling:
 *   - dark filled section titles (white on slate-800)
 *   - shaded sub-header rows
 *   - punchy totals rows with double top border
 *   - yellow highlight on the final Balance / Total Closer cells
 *   - subtle zebra striping on body rows
 *   - forced color reproduction for print
 *
 * Targets: #shift-print-area, #chip-print-area, #slots-print-area.
 */
export const PRINT_REPORT_ACCENTS_CSS = `
  #shift-print-area, #chip-print-area, #slots-print-area {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
    color-adjust: exact !important;
  }
  #shift-print-area table, #chip-print-area table, #slots-print-area table {
    box-shadow: inset 0 0 0 1.5px #000;
  }
  /* --- Section title cells: solid BLACK strip with WHITE text --- */
  #shift-print-area th.bg-gray-200,
  #shift-print-area td.bg-gray-200,
  #slots-print-area th.bg-gray-200,
  #slots-print-area td.bg-gray-200,
  #chip-print-area .bg-gray-100 {
    background-color: #000 !important;
    color: #fff !important;
    font-weight: 700 !important;
    letter-spacing: 0.03em;
    text-transform: uppercase;
  }
  /* Big casino title banner */
  #shift-print-area td.text-lg,
  #slots-print-area td.text-lg {
    background-color: #000 !important;
    color: #fff !important;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  /* --- Sub-header rows (column labels): medium grey ~30% --- */
  #shift-print-area tr.bg-gray-100 > th,
  #shift-print-area tr.bg-gray-100 > td,
  #slots-print-area tr.bg-gray-100 > th,
  #slots-print-area tr.bg-gray-100 > td,
  #chip-print-area thead tr.bg-gray-50 > th {
    background-color: #bfbfbf !important;
    color: #000 !important;
    font-weight: 700 !important;
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }
  /* --- Totals rows in body: mid grey with double top border --- */
  #shift-print-area tbody tr.bg-gray-200 > td,
  #slots-print-area tbody tr.bg-gray-200 > td,
  #shift-print-area tbody tr.bg-gray-100.font-bold > td,
  #slots-print-area tbody tr.bg-gray-100.font-bold > td,
  #chip-print-area tbody tr.bg-gray-100.font-bold > td {
    background-color: #d9d9d9 !important;
    color: #000 !important;
    font-weight: 800 !important;
    border-top: 3px double #000 !important;
  }
  /* --- Grand-total / Shift Balance cells: heavy black frame, no fill --- */
  #shift-print-area td.bg-gray-300,
  #slots-print-area td.bg-gray-300,
  #shift-print-area tr.bg-gray-200.font-bold > td:last-child,
  #slots-print-area tr.bg-gray-200.font-bold > td:last-child {
    background-color: #fff !important;
    color: #000 !important;
    font-weight: 900 !important;
    font-size: 1.05em !important;
    border-top: 3px double #000 !important;
    border-bottom: 3px double #000 !important;
    border-left: 2px solid #000 !important;
    border-right: 2px solid #000 !important;
    outline: 1px solid #000;
  }
  /* --- Zebra striping: very light grey ~7% --- */
  #shift-print-area tbody tr:not(.bg-gray-100):not(.bg-gray-200):not(.bg-gray-300):nth-child(even) > td:not(.bg-gray-100):not(.bg-gray-200):not(.bg-gray-300),
  #slots-print-area tbody tr:not(.bg-gray-100):not(.bg-gray-200):not(.bg-gray-300):nth-child(even) > td:not(.bg-gray-100):not(.bg-gray-200):not(.bg-gray-300),
  #chip-print-area tbody tr:not(.bg-gray-50):not(.bg-gray-100):nth-child(even) > td {
    background-color: #efefef !important;
  }
  #shift-print-area td.font-bold,
  #slots-print-area td.font-bold {
    font-weight: 800 !important;
  }
  /* --- Chip movement: section titles (the <p> strips) --- */
  #chip-print-area p.border-b {
    background-color: #000 !important;
    color: #fff !important;
    padding: 3px 6px !important;
    border-bottom: 0 !important;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    font-weight: 700 !important;
  }
  #chip-print-area p.bg-gray-100 {
    background-color: #000 !important;
    color: #fff !important;
    font-weight: 700 !important;
    letter-spacing: 0.03em;
    text-transform: uppercase;
  }
`;
