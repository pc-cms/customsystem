/**
 * Shared building blocks for the "Style A — Clear Cards" printable cash desk
 * reports (Slots / Live Game / Chips Movement / Total Closing).
 *
 * Pure presentation. A4 portrait, 194mm content width, print-safe borders.
 */
import { formatNumberSpaces } from "@/lib/currency";
import { fmtDate } from "@/lib/format-date";

/** Class carrying the print page geometry (see `.rv2-page` in index.css). */
export const A4_CLASS = "rv2-page";

export const A4_STYLE: React.CSSProperties = {
  width: "194mm",
  boxSizing: "border-box",
  fontFamily: "Arial, Helvetica, sans-serif",
  fontSize: "10.5px",
  lineHeight: 1.3,
};


export const num = (v: number | null | undefined) => formatNumberSpaces(Math.round(Number(v || 0)));

export const signed = (v: number | null | undefined) => {
  const n = Math.round(Number(v || 0));
  if (n === 0) return "0";
  return `${n > 0 ? "+" : "-"}${formatNumberSpaces(Math.abs(n))}`;
};

/** Report id — SCD-20260824-00418 style. */
export const buildReportId = (prefix: string, businessDate: string, seed?: string | null) => {
  const d = String(businessDate || "").replace(/-/g, "");
  const raw = String(seed || "");
  let h = 0;
  for (let i = 0; i < raw.length; i++) h = (h * 31 + raw.charCodeAt(i)) >>> 0;
  const tail = String(h % 100000).padStart(5, "0");
  return `${prefix}-${d}-${tail}`;
};

export const ReportHeader = ({
  title,
  reportId,
  status,
  businessDate,
  cashier,
  manager,
  generatedAt,
  shiftLabel,
}: {
  title: string;
  reportId: string;
  status: string;
  businessDate: string;
  cashier?: string | null;
  manager?: string | null;
  generatedAt?: string;
  shiftLabel?: string | null;
}) => (
  <div className="mb-2">
    <div className="flex items-end justify-between border-b-2 border-black pb-1">
      <div className="text-[16px] font-bold uppercase tracking-wide">{title}</div>
      <div className="text-right text-[9px] uppercase">
        <div>Report ID: {reportId}</div>
        <div>Internal Controls: {status}</div>
      </div>
    </div>
    <div className="mt-1 grid grid-cols-4 gap-2 text-[9.5px]">
      <Meta label="Business Date" value={fmtDate(businessDate)} />
      <Meta label="Cashier" value={cashier || "—"} />
      <Meta label="Closing Manager" value={manager || "—"} />
      <Meta label="Generated" value={generatedAt || `${fmtDate(new Date().toISOString().slice(0, 10))} EAT`} />
    </div>
    {shiftLabel ? <div className="mt-1 text-[9.5px] uppercase font-semibold">Shift: {shiftLabel}</div> : null}
  </div>
);

const Meta = ({ label, value }: { label: string; value: string }) => (
  <div className="border border-black px-1.5 py-0.5">
    <div className="text-[8px] uppercase tracking-wide text-gray-600">{label}</div>
    <div className="font-semibold">{value}</div>
  </div>
);

/** Card wrapper with a bold section caption. */
export const Card = ({
  title,
  children,
  className = "",
}: { title?: string; children: React.ReactNode; className?: string }) => (
  <div className={`rv2-card border border-black mb-1.5 ${className}`}>
    {title ? (
      <div className="bg-gray-200 border-b border-black px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide">
        {title}
      </div>
    ) : null}
    {children}
  </div>
);

export type Col = { key: string; label: string; align?: "left" | "right" | "center"; width?: string };

/** Simple bordered data table used by every card. */
export const CardTable = ({
  cols,
  rows,
  footer,
}: {
  cols: Col[];
  rows: Array<Record<string, React.ReactNode>>;
  footer?: Record<string, React.ReactNode> | null;
}) => (
  <table className="w-full border-collapse" style={{ tableLayout: "fixed" }}>
    <colgroup>
      {cols.map(c => <col key={c.key} style={c.width ? { width: c.width } : undefined} />)}
    </colgroup>
    <thead>
      <tr className="bg-gray-100">
        {cols.map(c => (
          <th
            key={c.key}
            className={`border border-black px-1.5 py-0.5 text-[8.5px] uppercase tracking-wide font-bold ${
              c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : "text-left"
            }`}
          >
            {c.label}
          </th>
        ))}
      </tr>
    </thead>
    <tbody>
      {rows.map((r, i) => (
        <tr key={i}>
          {cols.map(c => (
            <td
              key={c.key}
              className={`border border-black px-1.5 py-0.5 ${
                c.align === "right" ? "text-right font-mono tabular-nums" : c.align === "center" ? "text-center" : "text-left"
              }`}
            >
              {r[c.key] ?? ""}
            </td>
          ))}
        </tr>
      ))}
      {!rows.length && (
        <tr><td colSpan={cols.length} className="border border-black px-1.5 py-2 text-center text-gray-500">No data</td></tr>
      )}
    </tbody>
    {footer ? (
      <tfoot>
        <tr className="bg-gray-200 font-bold">
          {cols.map(c => (
            <td
              key={c.key}
              className={`border border-black px-1.5 py-0.5 ${
                c.align === "right" ? "text-right font-mono tabular-nums" : c.align === "center" ? "text-center" : "text-left"
              }`}
            >
              {footer[c.key] ?? ""}
            </td>
          ))}
        </tr>
      </tfoot>
    ) : null}
  </table>
);

/** Horizontal KPI strip — the wide "cards" row of the layout. */
export const KpiStrip = ({
  items,
}: { items: Array<{ label: string; value: React.ReactNode; strong?: boolean }> }) => (
  <table className="w-full border-collapse mb-1.5" style={{ tableLayout: "fixed" }}>
    <thead>
      <tr className="bg-gray-100">
        {items.map(i => (
          <th key={i.label} className="border border-black px-1.5 py-0.5 text-[8.5px] uppercase tracking-wide font-bold text-center">
            {i.label}
          </th>
        ))}
      </tr>
    </thead>
    <tbody>
      <tr>
        {items.map(i => (
          <td
            key={i.label}
            className={`border border-black px-1.5 py-1 text-center font-mono tabular-nums ${i.strong ? "font-bold text-[12px] bg-gray-50" : "font-semibold"}`}
          >
            {i.value}
          </td>
        ))}
      </tr>
    </tbody>
  </table>
);

export const Signatures = ({
  left,
  right,
  leftName,
  rightName,
}: { left: string; right: string; leftName?: string | null; rightName?: string | null }) => (
  <div className="grid grid-cols-2 gap-8 mt-6">
    {[{ t: left, n: leftName }, { t: right, n: rightName }].map((s, i) => (
      <div key={i} className="text-[9.5px]">
        <div className="uppercase font-bold tracking-wide">{s.t}</div>
        <div className="mt-0.5">{s.n || "—"}</div>
        <div className="mt-6 border-t border-black pt-0.5 text-center text-[8.5px] uppercase tracking-wide">Signature</div>
      </div>
    ))}
  </div>
);

export const PageFooter = ({ casinoName, page, total }: { casinoName: string; page: number; total: number }) => (
  <div className="mt-auto pt-3 flex items-center justify-between text-[8.5px] uppercase tracking-wide border-t border-black">
    <span className="font-bold">{casinoName}</span>
    <span>Closing Report · Style A</span>
    <span>Page {page} of {total}</span>
  </div>
);
