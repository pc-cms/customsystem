/**
 * Automated print test for the "Style A — Clear Cards" Total Closing report.
 *
 * Renders the report page geometry (real `.rv2-*` print CSS from src/index.css)
 * inside headless Chromium, prints to PDF at several browser font sizes and
 * zoom levels, and asserts every run produces exactly 4 A4 portrait pages.
 *
 * Usage:  node scripts/print-tests/total-closing-print.mjs [outDir]
 * Default outDir: /mnt/documents/print-tests
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { existsSync } from "node:fs";
import { chromium } from "playwright";

/** Fall back to the sandbox-installed Chromium when the bundled build is absent. */
const CHROMIUM_FALLBACKS = [
  "/opt/ms-playwright/chromium-1194/chrome-linux/chrome",
  "/usr/bin/chromium",
  "/usr/bin/google-chrome",
];
const executablePath = CHROMIUM_FALLBACKS.find((p) => existsSync(p));

const OUT_DIR = resolve(process.argv[2] || "/mnt/documents/print-tests");
const EXPECTED_PAGES = 4;
const A4_PORTRAIT = { w: 595, h: 842, tol: 3 };

// Font size (px) × browser zoom factor.
const MATRIX = [
  { fontSize: 12, zoom: 1 },
  { fontSize: 16, zoom: 1 },
  { fontSize: 20, zoom: 1 },
  { fontSize: 24, zoom: 1 },
  { fontSize: 16, zoom: 1.25 },
  { fontSize: 16, zoom: 1.5 },
];

// Row volumes per page: empty shift → full denomination + bank matrix.
const VOLUMES = { min: 0, typical: 12, max: 38 };

const css = readFileSync(resolve("src/index.css"), "utf8")
  .replace(/@tailwind[^;]*;/g, "")
  .replace(/@apply[^;]*;/g, "");

const money = (i) => `${(1250000 + i * 5000).toLocaleString("en-US").replace(/,/g, " ")}`;

const sheet = (page, rows, title) => {
  const body = Array.from({ length: rows })
    .map(
      (_, j) =>
        `<tr><td class="rv2-l">Denomination ${j + 1}</td><td class="rv2-r">${(j + 1) * 3} pcs</td><td class="rv2-r">${money(j)}</td></tr>`,
    )
    .join("");
  return `<div class="rv2-page bg-white text-black p-2">
    <div class="rv2-card rv2-head">
      <div class="rv2-head-top">
        <div class="rv2-title">TOTAL CLOSING CASH DESK REPORT</div>
        <div class="rv2-head-id">
          <div class="rv2-head-id-main">Report ID: TCD-20260905-00418</div>
          <div class="rv2-head-id-sub">Internal Controls: DRAFT</div>
        </div>
      </div>
    </div>
    <div class="rv2-card">
      <div class="rv2-card-title"><span class="rv2-accent"></span>${title}</div>
      <table class="rv2-table">
        <thead><tr><th class="rv2-l">Item</th><th class="rv2-r">Qty</th><th class="rv2-r">Amount</th></tr></thead>
        <tbody>${body || '<tr><td colspan="3" class="rv2-c rv2-empty">No data</td></tr>'}</tbody>
      </table>
    </div>
    <div style="margin-top:auto">
      <div class="rv2-footer">
        <span class="rv2-footer-name">ARUSHA</span>
        <span>Closing Report · Style A</span>
        <span>Page ${page} of ${EXPECTED_PAGES}</span>
      </div>
    </div>
  </div>`;
};

const document_ = (fontSize, zoom, rows) => `<!doctype html><html><head><meta charset="utf-8">
<style>${css}</style>
<style>html,body{margin:0;font-size:${fontSize}px}body{zoom:${zoom}}</style>
</head><body><div class="cms-print-root">
${["Slots Cash Desk", "Live Game Cash Desk", "Casino Chips Movement", "Total Closing"]
  .map((t, i) => sheet(i + 1, rows, t))
  .join("\n")}
</div></body></html>`;

const inspectPdf = (buf) => {
  const raw = buf.toString("latin1");
  const pages = (raw.match(/\/Type\s*\/Page[^s]/g) || []).length;
  const boxes = [...new Set(raw.match(/\/MediaBox\s*\[[^\]]*\]/g) || [])];
  return { pages, boxes };
};

const run = async () => {
  mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch(executablePath ? { executablePath } : {});
  const results = [];
  let failed = 0;

  for (const [volume, rows] of Object.entries(VOLUMES)) {
    for (const { fontSize, zoom } of MATRIX) {
      const page = await browser.newPage();
      await page.setContent(document_(fontSize, zoom, rows), { waitUntil: "load" });
      const name = `total-closing_${volume}_fs${fontSize}_zoom${String(zoom).replace(".", "-")}.pdf`;
      const file = join(OUT_DIR, name);
      const buf = await page.pdf({ path: file, printBackground: true, preferCSSPageSize: true });
      await page.close();

      const { pages, boxes } = inspectPdf(buf);
      const dims = boxes.map((b) => b.match(/[\d.]+/g).slice(2).map(Number));
      const portraitA4 = dims.every(
        ([w, h]) =>
          Math.abs(w - A4_PORTRAIT.w) < A4_PORTRAIT.tol && Math.abs(h - A4_PORTRAIT.h) < A4_PORTRAIT.tol,
      );
      const ok = pages === EXPECTED_PAGES && portraitA4;
      if (!ok) failed++;
      results.push({ volume, fontSize, zoom, pages, portraitA4, ok, file: name });
      console.log(
        `${ok ? "PASS" : "FAIL"}  ${volume.padEnd(7)} fs=${String(fontSize).padStart(2)}px zoom=${zoom}  pages=${pages}  A4portrait=${portraitA4}  → ${name}`,
      );
    }
  }

  await browser.close();
  writeFileSync(join(OUT_DIR, "print-test-report.json"), JSON.stringify({ expectedPages: EXPECTED_PAGES, results }, null, 2));
  console.log(`\n${results.length - failed}/${results.length} passed. Output: ${OUT_DIR}`);
  process.exit(failed ? 1 : 0);
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
