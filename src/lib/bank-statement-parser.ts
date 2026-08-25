/**
 * Bank statement parser (CSV / XLSX).
 *
 * Pure client-side PARSING only — no accounting decisions are taken here.
 * The parsed rows are handed to `fin_bank_import_create_batch` which is the
 * only authoritative writer (matching, duplicate detection, staging).
 *
 * Supported: .csv / .txt (delimiter auto-detect: , ; \t |) and .xlsx / .xls
 * (via exceljs). PDF is intentionally NOT supported — we do not fake OCR.
 */

export interface ParsedStatementRow {
  tx_date: string; // YYYY-MM-DD
  description: string;
  reference: string | null;
  debit: number;
  credit: number;
  currency?: string;
}

export interface ParsedStatement {
  rows: ParsedStatementRow[];
  opening: number | null;
  closing: number | null;
  warnings: string[];
  skipped: number;
  headerUsed: Record<string, string>;
}

export class UnsupportedStatementFile extends Error {}

const HEADERS = {
  date: ["date", "txn date", "transaction date", "value date", "posting date", "trans date", "booking date"],
  description: ["description", "narration", "details", "particulars", "narrative", "transaction details", "remarks"],
  reference: ["reference", "ref", "ref no", "transaction id", "txn id", "cheque", "cheque no", "document no", "trn ref"],
  debit: ["debit", "withdrawal", "withdrawals", "dr", "money out", "paid out", "debit amount"],
  credit: ["credit", "deposit", "deposits", "cr", "money in", "paid in", "credit amount"],
  amount: ["amount", "signed amount", "value"],
  currency: ["currency", "ccy"],
  balance: ["balance", "running balance", "closing balance"],
};

const norm = (s: unknown) => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

function matchHeader(cell: string): keyof typeof HEADERS | null {
  const n = norm(cell);
  if (!n) return null;
  for (const [key, aliases] of Object.entries(HEADERS)) {
    if (aliases.some((a) => n === a || n.startsWith(a + " ") || n.endsWith(" " + a))) {
      return key as keyof typeof HEADERS;
    }
  }
  return null;
}

/** Numbers like "1,234.56", "(1 234.56)", "1.234,56-", "" */
export function parseAmount(raw: unknown): number {
  if (raw == null || raw === "") return 0;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : 0;
  let s = String(raw).trim();
  if (!s) return 0;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (/-$/.test(s)) { neg = true; s = s.slice(0, -1); }
  if (/^-/.test(s)) { neg = true; s = s.slice(1); }
  s = s.replace(/[^0-9.,]/g, "");
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > lastDot) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else {
    s = s.replace(/,/g, "");
  }
  const v = parseFloat(s);
  if (!Number.isFinite(v)) return 0;
  return neg ? -v : v;
}

/** Accepts DD/MM/YYYY, YYYY-MM-DD, DD-MMM-YYYY, Excel Date objects. */
export function parseStatementDate(raw: unknown): string | null {
  if (raw == null || raw === "") return null;
  if (raw instanceof Date && !isNaN(raw.getTime())) {
    return `${raw.getUTCFullYear()}-${String(raw.getUTCMonth() + 1).padStart(2, "0")}-${String(raw.getUTCDate()).padStart(2, "0")}`;
  }
  const s = String(raw).trim().split(/[ T]/)[0];
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/.exec(s);
  if (m) {
    const yy = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${yy}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  m = /^(\d{1,2})[-/ ]([A-Za-z]{3,})[-/ ](\d{2,4})$/.exec(s);
  if (m) {
    const mi = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase());
    if (mi >= 0) {
      const yy = m[3].length === 2 ? `20${m[3]}` : m[3];
      return `${yy}-${String(mi + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    }
  }
  return null;
}

/** RFC-4180-ish CSV splitter with delimiter auto-detection. */
function splitCsv(text: string): string[][] {
  const firstLine = text.split(/\r?\n/).find((l) => l.trim().length > 0) || "";
  const candidates = [",", ";", "\t", "|"];
  const delim = candidates
    .map((d) => ({ d, n: firstLine.split(d).length }))
    .sort((a, b) => b.n - a.n)[0].d;

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else quoted = false;
      } else cell += c;
      continue;
    }
    if (c === '"') { quoted = true; continue; }
    if (c === delim) { row.push(cell); cell = ""; continue; }
    if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; continue; }
    if (c === "\r") continue;
    cell += c;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => String(x).trim() !== ""));
}

async function readXlsx(file: File): Promise<unknown[][]> {
  const ExcelJS = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const ws = wb.worksheets[0];
  if (!ws) throw new UnsupportedStatementFile("Workbook has no sheets");
  const out: unknown[][] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const vals: unknown[] = [];
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      let v: unknown = cell.value;
      if (v && typeof v === "object") {
        const o = v as Record<string, unknown>;
        if ("result" in o) v = o.result;
        else if ("text" in o) v = o.text;
        else if ("richText" in o) v = (o.richText as { text: string }[]).map((t) => t.text).join("");
      }
      vals[col - 1] = v;
    });
    out.push(vals);
  });
  return out;
}

function buildFromMatrix(matrix: unknown[][]): ParsedStatement {
  const warnings: string[] = [];
  // find header row within the first 30 lines
  let headerIdx = -1;
  let map: Partial<Record<keyof typeof HEADERS, number>> = {};
  for (let i = 0; i < Math.min(matrix.length, 30); i++) {
    const candidate: Partial<Record<keyof typeof HEADERS, number>> = {};
    matrix[i].forEach((cell, idx) => {
      const key = matchHeader(String(cell ?? ""));
      if (key && candidate[key] === undefined) candidate[key] = idx;
    });
    if (candidate.date !== undefined && (candidate.debit !== undefined || candidate.credit !== undefined || candidate.amount !== undefined)) {
      headerIdx = i;
      map = candidate;
      break;
    }
  }
  if (headerIdx < 0) {
    throw new UnsupportedStatementFile(
      "Could not detect statement columns. Required headers: Date + (Debit/Credit or Amount). Optional: Description, Reference, Currency, Balance.",
    );
  }

  const rows: ParsedStatementRow[] = [];
  let skipped = 0;
  let opening: number | null = null;
  let closing: number | null = null;

  for (let i = headerIdx + 1; i < matrix.length; i++) {
    const r = matrix[i];
    const rawDate = r[map.date!];
    const date = parseStatementDate(rawDate);
    const joined = r.map((x) => norm(x)).join(" ");
    if (!date) {
      if (/opening balance|balance b\/f|b\/fwd/.test(joined)) {
        const nums = r.map(parseAmount).filter((n) => n !== 0);
        if (nums.length) opening = nums[nums.length - 1];
      } else if (/closing balance|balance c\/f|c\/fwd/.test(joined)) {
        const nums = r.map(parseAmount).filter((n) => n !== 0);
        if (nums.length) closing = nums[nums.length - 1];
      } else if (joined.trim()) skipped++;
      continue;
    }

    let debit = 0;
    let credit = 0;
    if (map.debit !== undefined || map.credit !== undefined) {
      debit = Math.abs(parseAmount(map.debit !== undefined ? r[map.debit] : 0));
      credit = Math.abs(parseAmount(map.credit !== undefined ? r[map.credit] : 0));
    }
    if (!debit && !credit && map.amount !== undefined) {
      const v = parseAmount(r[map.amount]);
      if (v < 0) debit = Math.abs(v); else credit = v;
    }
    if (!debit && !credit) { skipped++; continue; }

    rows.push({
      tx_date: date,
      description: map.description !== undefined ? String(r[map.description] ?? "").trim() : "",
      reference: map.reference !== undefined ? String(r[map.reference] ?? "").trim() || null : null,
      debit,
      credit,
      currency: map.currency !== undefined ? String(r[map.currency] ?? "").trim().toUpperCase() || undefined : undefined,
    });

    if (map.balance !== undefined) {
      const bal = parseAmount(r[map.balance]);
      if (bal) closing = bal;
    }
  }

  if (!rows.length) {
    throw new UnsupportedStatementFile("No transaction rows found in the file.");
  }
  if (skipped) warnings.push(`${skipped} non-transaction line(s) skipped`);

  const headerUsed: Record<string, string> = {};
  Object.entries(map).forEach(([k, idx]) => {
    headerUsed[k] = String(matrix[headerIdx][idx as number] ?? "");
  });

  return { rows, opening, closing, warnings, skipped, headerUsed };
}

export async function parseStatementFile(file: File): Promise<ParsedStatement> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv") || name.endsWith(".txt")) {
    return buildFromMatrix(splitCsv(await file.text()));
  }
  if (name.endsWith(".xlsx") || name.endsWith(".xlsm") || name.endsWith(".xls")) {
    return buildFromMatrix(await readXlsx(file));
  }
  throw new UnsupportedStatementFile(
    `Unsupported file type "${name.split(".").pop()}". Supported: CSV and XLSX. PDF statements must be exported to CSV/XLSX by the bank first.`,
  );
}

/** Stable file identity (SHA-256) for re-upload detection. */
export async function fileHash(file: File): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
