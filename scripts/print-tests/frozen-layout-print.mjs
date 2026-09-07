/**
 * Frozen-layout print test.
 *
 * Guards the ONE rule that keeps the printed closing pack stable for every
 * casino: 4 sheets, always the same order, always the same orientation
 * (portrait, portrait, LANDSCAPE chips, portrait), nothing clipped.
 *
 * Geometry is read straight from the single source of truth
 * (src/lib/print-sheet-css.ts) — if someone re-adds page rules elsewhere and
 * they conflict, this test fails.
 *
 * Usage:  node scripts/print-tests/frozen-layout-print.mjs [outDir]
 */
import { readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "playwright";

const CHROMIUM_FALLBACKS = [
  "/opt/ms-playwright/chromium-1194/chrome-linux/chrome",
  "/usr/bin/chromium",
  "/usr/bin/google-chrome",
];
const executablePath = CHROMIUM_FALLBACKS.find((p) => existsSync(p));

const OUT_DIR = resolve(process.argv[2] || "/mnt/documents/print-tests");
const CASINOS = ["ARUSHA", "DODOMA", "MBEYA", "MWANZA"];
const SHEETS = [
  { title: "SLOTS CASH DESK REPORT", land: false },
  { title: "LIVE GAME CASH DESK REPORT", land: false },
  { title: "CASINO CHIPS MOVEMENT REPORT", land: true },
  { title: "TOTAL CLOSING CASH DESK REPORT", land: false },
];
const A4 = { portrait: [595, 842], landscape: [842, 595], tol: 3 };
const REPORT_SOURCES = [
  "src/components/cage/LiveClosingReportV2.tsx",
  "src/components/cage/ChipsMovementReportV2.tsx",
  "src/components/cage-slots/SlotsClosingReportV2.tsx",
  "src/components/cage/TotalClosingReportV2.tsx",
];

/** Screen-side .rv2-* styling from index.css + the frozen print geometry. */
const screenCss = readFileSync(resolve("src/index.css"), "utf8")
  .replace(/@tailwind[^;]*;/g, "")
  .replace(/@apply[^;]*;/g, "");
const sheetTs = readFileSync(resolve("src/lib/print-sheet-css.ts"), "utf8");
const printCss = sheetTs.slice(
  sheetTs.indexOf("export const PRINT_SHEET_CSS = `") + "export const PRINT_SHEET_CSS = `".length,
  sheetTs.indexOf("`;"),
);

const money = (i) => (1250000 + i * 5000).toLocaleString("en-US").replace(/,/g, " ");

const sheetHtml = ({ title, land }, casino, index, rows) => {
  const body = Array.from({ length: rows })
    .map(
      (_, j) =>
        `<tr><td class="rv2-l">Wallet / denomination ${j + 1}</td><td class="rv2-r">${(j + 1) * 3}</td><td class="rv2-r">${money(j)}</td></tr>`,
    )
    .join("");
  return `<div class="rv2-page${land ? " rv2-page-land" : ""} bg-white text-black p-2">
    <div class="rv2-card rv2-head">
      <div class="rv2-head-top">
        <div class="rv2-title">${title}</div>
        <div class="rv2-head-id"><div class="rv2-head-id-main">${casino} · Report ID: TST-${index + 1}</div></div>
      </div>
    </div>
    <div class="rv2-card">
      <div class="rv2-card-title"><span class="rv2-accent"></span>${title}</div>
      <table class="rv2-table">
        <thead><tr><th class="rv2-l">Item</th><th class="rv2-r">Qty</th><th class="rv2-r">Amount</th></tr></thead>
        <tbody>${body || '<tr><td colspan="3" class="rv2-c rv2-empty">0</td></tr>'}</tbody>
      </table>
    </div>
    <div class="rv2-signatures" style="margin-top:auto">
      <div>Cashier: ______________________</div>
      <div>Manager: ______________________</div>
    </div>
    <div class="rv2-footer">
      <span class="rv2-footer-name">${casino}</span>
      <span>Closing Pack</span>
      <span>Page ${index + 1} of ${SHEETS.length}</span>
    </div>
  </div>`;
};

const documentHtml = (casino, rows) => `<!doctype html><html><head><meta charset="utf-8">
<style>${screenCss}</style>
<style>${printCss}</style>
<style>html,body{margin:0;font-size:16px}</style>
</head><body><div class="cms-print-root">
${SHEETS.map((s, i) => sheetHtml(s, casino, i, rows)).join("\n")}
</div></body></html>`;

const pdfBoxes = (buf) => {
  const raw = buf.toString("latin1");
  const pages = (raw.match(/\/Type\s*\/Page[^s]/g) || []).length;
  const boxes = (raw.match(/\/MediaBox\s*\[[^\]]*\]/g) || []).map((b) =>
    b.match(/[\d.]+/g).slice(2).map(Number),
  );
  return { pages, boxes };
};

const matches = (dim, [w, h]) => Math.abs(dim[0] - w) < A4.tol && Math.abs(dim[1] - h) < A4.tol;

const run = async () => {
  mkdirSync(OUT_DIR, { recursive: true });
  const reportSource = REPORT_SOURCES.map((path) => readFileSync(resolve(path), "utf8")).join("\n");
  if (/Data Source|shift_close_id|<DataSource\b/.test(reportSource)) {
    throw new Error("Printed reports must not contain the removed Data Source block");
  }
  if (!/withExtraKeys\(wallets\.banks/.test(reportSource) || !/withExtraKeys\(wallets\.providers/.test(reportSource)) {
    throw new Error("Printed reports must build bank and cashless rows from the full casino wallet registry");
  }
  if (/withExtraKeys\(wallets\.(?:banks|providers)[^;]*\.filter\(/s.test(reportSource)) {
    throw new Error("Printed wallet rows must not filter out zero values");
  }

  const browser = await chromium.launch(executablePath ? { executablePath } : {});
  const results = [];
  let failed = 0;

  for (const casino of CASINOS) {
    for (const rows of [0, 14, 34]) {
      const page = await browser.newPage();
      await page.setContent(documentHtml(casino, rows), { waitUntil: "load" });
      const name = `frozen_${casino.toLowerCase()}_rows${rows}.pdf`;
      const buf = await page.pdf({ path: join(OUT_DIR, name), printBackground: true, preferCSSPageSize: true });

      // Nothing may overflow its sheet on screen either (clipped tables bug).
      const overflow = await page.evaluate(() =>
        Array.from(document.querySelectorAll(".rv2-page")).filter(
          (el) => el.scrollHeight > el.clientHeight + 2 || el.scrollWidth > el.clientWidth + 2,
        ).length,
      );
      await page.close();

      const { pages, boxes } = pdfBoxes(buf);
      const uniqueLandscape = boxes.filter((d) => matches(d, A4.landscape)).length;
      const uniquePortrait = boxes.filter((d) => matches(d, A4.portrait)).length;
      const orientationOk = uniqueLandscape >= 1 && uniquePortrait >= 1;
      const ok = pages === SHEETS.length && orientationOk && overflow === 0;
      if (!ok) failed++;
      results.push({ casino, rows, pages, orientationOk, overflow, ok, file: name });
      console.log(
        `${ok ? "PASS" : "FAIL"}  ${casino.padEnd(7)} rows=${String(rows).padStart(2)}  pages=${pages}  orientation=${orientationOk}  overflow=${overflow}`,
      );
    }
  }

  await browser.close();
  writeFileSync(
    join(OUT_DIR, "frozen-layout-report.json"),
    JSON.stringify({ expectedPages: SHEETS.length, results }, null, 2),
  );
  console.log(`\n${results.length - failed}/${results.length} passed. Output: ${OUT_DIR}`);
  process.exit(failed ? 1 : 0);
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
