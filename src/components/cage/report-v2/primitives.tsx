/**
 * Shared building blocks for the "Style A — Clear Cards" printable cash desk
 * reports (Slots / Live Game / Chips Movement / Total Closing).
 *
 * Pure presentation. A4 portrait, 194mm content width, print-safe styling.
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
  <div className="rv2-card rv2-head mb-2">
    <div className="rv2-head-top">
      <div className="rv2-title">{title}</div>
      <div className="rv2-head-id">
        <div className="rv2-head-id-main">Report ID: {reportId}</div>
        <div className="rv2-head-id-sub">Internal Controls: {status}</div>
      </div>
    </div>
    <div className="rv2-head-meta">
      <Meta label="Business Date" value={fmtDate(businessDate)} />
      <Meta label="Cashier" value={cashier || "—"} />
      <Meta label="Closing Manager" value={manager || "—"} />
      <Meta label="Generated" value={generatedAt || `${fmtDate(new Date().toISOString().slice(0, 10))} EAT`} />
    </div>
    {shiftLabel ? (
      <div className="rv2-head-shift">Shift: {shiftLabel}</div>
    ) : null}
  </div>
);

const Meta = ({ label, value }: { label: string; value: string }) => (
  <div className="rv2-meta">
    <div className="rv2-meta-label">{label}</div>
    <div className="rv2-meta-value">{value}</div>
  </div>
);

/** Card wrapper with a bold section caption. */
export const Card = ({
  title,
  children,
  className = "",
}: { title?: string; children: React.ReactNode; className?: string }) => (
  <div className={`rv2-card ${className}`}>
    {title ? (
      <div className="rv2-card-title"><span className="rv2-accent" />{title}</div>
    ) : null}
    {children}
  </div>
);

export type Col = { key: string; label: string; align?: "left" | "right" | "center"; width?: string };

const alignClass = (a?: Col["align"]) =>
  a === "right" ? "rv2-r" : a === "center" ? "rv2-c" : "rv2-l";

/** Simple data table used by every card. */
export const CardTable = ({
  cols,
  rows,
  footer,
}: {
  cols: Col[];
  rows: Array<Record<string, React.ReactNode>>;
  footer?: Record<string, React.ReactNode> | null;
}) => (
  <table className="rv2-table" style={{ tableLayout: "fixed" }}>
    <colgroup>
      {cols.map(c => <col key={c.key} style={c.width ? { width: c.width } : undefined} />)}
    </colgroup>
    <thead>
      <tr>
        {cols.map(c => (
          <th key={c.key} className={alignClass(c.align)}>{c.label}</th>
        ))}
      </tr>
    </thead>
    <tbody>
      {rows.map((r, i) => (
        <tr key={i}>
          {cols.map(c => (
            <td key={c.key} className={alignClass(c.align)}>{r[c.key] ?? ""}</td>
          ))}
        </tr>
      ))}
      {!rows.length && (
        <tr><td colSpan={cols.length} className="rv2-c rv2-empty">No data</td></tr>
      )}
    </tbody>
    {footer ? (
      <tfoot>
        <tr>
          {cols.map(c => (
            <td key={c.key} className={alignClass(c.align)}>{footer[c.key] ?? ""}</td>
          ))}
        </tr>
      </tfoot>
    ) : null}
  </table>
);

/** Horizontal KPI strip — the row of separate rounded tiles. */
export const KpiStrip = ({
  items,
}: { items: Array<{ label: string; value: React.ReactNode; strong?: boolean }> }) => (
  <div className="rv2-kpis" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
    {items.map(i => (
      <div key={i.label} className="rv2-card rv2-kpi">
        <div className="rv2-kpi-label">{i.label}</div>
        <div className={`rv2-kpi-value${i.strong ? " rv2-kpi-strong" : ""}`}>{i.value}</div>
      </div>
    ))}
  </div>
);

export const Signatures = ({
  left,
  right,
  leftName,
  rightName,
}: { left: string; right: string; leftName?: string | null; rightName?: string | null }) => (
  <div className="rv2-signs">
    {[{ t: left, n: leftName }, { t: right, n: rightName }].map((s, i) => (
      <div key={i} className="rv2-card rv2-sign">
        <div className="rv2-sign-who">
          <div className="rv2-sign-role">{s.t}</div>
          <div className="rv2-sign-name">{s.n || "—"}</div>
        </div>
        <div className="rv2-sign-line"><span>Signature</span></div>
      </div>
    ))}
  </div>
);

export const PageFooter = ({ casinoName, page, total }: { casinoName: string; page: number; total: number }) => (
  <div className="rv2-footer">
    <span className="rv2-footer-name">{casinoName}</span>
    <span>Closing Report · Style A</span>
    <span>Page {page} of {total}</span>
  </div>
);

/**
 * Printed template version — bump ONLY together with a real layout change.
 * Combined with the app build version so any sheet can be traced back to the
 * exact code that produced it.
 */
declare const __APP_VERSION__: string | undefined;
export const REPORT_TEMPLATE_VERSION = "Style A v2.1";
export const REPORT_BUILD_VERSION =
  typeof __APP_VERSION__ !== "undefined" && __APP_VERSION__ ? __APP_VERSION__ : "dev";

/** Human timestamp in casino time (EAT) for printed provenance lines. */
export const fmtStamp = (iso?: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Dar_es_Salaam",
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(d).reduce((a, x) => ({ ...a, [x.type]: x.value }), {} as any);
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute} EAT`;
};

export type DataSourceEntry = {
  /** e.g. "Live shift", "Slots shift" */
  label: string;
  /** shift_close_id — the closed shift record the figures come from */
  id?: string | null;
  /** shifts.closed_at */
  closedAt?: string | null;
  /** optional extra note, e.g. "still open — provisional" */
  note?: string | null;
};

/**
 * Provenance block — printed on every sheet so anyone holding the paper can
 * tell exactly which shift record, which closing time and which template
 * version produced the figures.
 */
export const DataSource = ({ entries }: { entries: DataSourceEntry[] }) => (
  <div className="rv2-card rv2-src">
    <div className="rv2-card-title"><span className="rv2-accent" />Data Source</div>
    <table className="rv2-table">
      <thead>
        <tr>
          <th className="rv2-l" style={{ width: "22%" }}>Source</th>
          <th className="rv2-l">shift_close_id</th>
          <th className="rv2-l" style={{ width: "26%" }}>Closed at</th>
        </tr>
      </thead>
      <tbody>
        {entries.length ? entries.map((e, i) => (
          <tr key={i}>
            <td className="rv2-l">{e.label}</td>
            <td className="rv2-l" style={{ fontFamily: "monospace", wordBreak: "break-all" }}>
              {e.id || "—"}
            </td>
            <td className="rv2-l">{e.note ? e.note : fmtStamp(e.closedAt)}</td>
          </tr>
        )) : (
          <tr><td colSpan={3} className="rv2-c rv2-empty">—</td></tr>
        )}
        <tr>
          <td className="rv2-l">Template</td>
          <td className="rv2-l" colSpan={2}>
            {REPORT_TEMPLATE_VERSION} · build {REPORT_BUILD_VERSION} · printed {fmtStamp(new Date().toISOString())}
          </td>
        </tr>
      </tbody>
    </table>
  </div>
);
