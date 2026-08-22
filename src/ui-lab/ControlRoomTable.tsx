/**
 * CONTROL ROOM LAB — table system, written from scratch for /ui-lab only.
 *
 * Read-only by design: it renders cells, never editors or action buttons.
 */
import { ReactNode, useMemo, useState } from "react";

export type CrlAlign = "left" | "right" | "center";

export type CrlColumn<T> = {
  key: string;
  label: ReactNode;
  /** Column group label — enables the grouped header row. */
  group?: string;
  align?: CrlAlign;
  width?: number | string;
  /** Monospaced tabular rendering (financial / numeric columns). */
  numeric?: boolean;
  /** Compact fixed-width date/time column. */
  date?: boolean;
  /** Sticky first column (only meaningful for the leftmost column). */
  sticky?: boolean;
  /** Faint vertical boundary on the left edge — use to separate groups. */
  divider?: boolean;
  sortable?: boolean;
  sortValue?: (row: T) => number | string | null | undefined;
  render: (row: T) => ReactNode;
  /** Cell content of the totals row (omit → empty cell). */
  total?: () => ReactNode;
  className?: (row: T) => string | undefined;
};

export type CrlDensity = "compact" | "comfortable";

type Props<T> = {
  columns: CrlColumn<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => string;
  /** Extra class for a whole row (e.g. group rows). */
  rowClass?: (row: T) => string | undefined;
  initialSort?: { key: string; dir: "asc" | "desc" };
  density?: CrlDensity;
  /** Render the anchored totals row (sticky at the bottom). */
  showTotals?: boolean;
  loading?: boolean;
  emptyTitle?: string;
  emptyHint?: string;
  maxHeight?: string;
  /** Set when the table is not preceded by a toolbar. */
  standalone?: boolean;
};

const alignClass = (c: CrlColumn<any>) => {
  if (c.numeric) return "crl-cell-num";
  if (c.align === "right") return "crl-al-right";
  if (c.align === "center") return "crl-al-center";
  return "";
};

export function ControlRoomTable<T>({
  columns,
  rows,
  rowKey,
  rowClass,
  initialSort,
  density = "compact",
  showTotals = false,
  loading = false,
  emptyTitle = "No records",
  emptyHint = "There is no data for the selected period.",
  maxHeight = "calc(100vh - 300px)",
  standalone = false,
}: Props<T>) {
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(
    initialSort ?? null,
  );

  const hasGroups = columns.some((c) => c.group);

  const groupSpans = useMemo(() => {
    if (!hasGroups) return [];
    const out: { label: string; span: number; divider: boolean }[] = [];
    columns.forEach((c) => {
      const label = c.group ?? "";
      const last = out[out.length - 1];
      if (last && last.label === label) last.span += 1;
      else out.push({ label, span: 1, divider: out.length > 0 });
    });
    return out;
  }, [columns, hasGroups]);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return rows;
    const arr = [...rows];
    arr.sort((a, b) => {
      const va = col.sortValue!(a);
      const vb = col.sortValue!(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === "number" && typeof vb === "number") {
        return sort.dir === "asc" ? va - vb : vb - va;
      }
      const sa = String(va);
      const sb = String(vb);
      return sort.dir === "asc" ? sa.localeCompare(sb) : sb.localeCompare(sa);
    });
    return arr;
  }, [rows, sort, columns]);

  const toggle = (col: CrlColumn<T>) => {
    if (!col.sortable || !col.sortValue) return;
    setSort((s) =>
      s && s.key === col.key
        ? { key: col.key, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key: col.key, dir: "desc" },
    );
  };

  return (
    <div
      className={`crl-table-wrap crl-density-${density}${standalone ? " is-standalone" : ""}`}
      style={{ maxHeight }}
    >
      <table className="crl-table">
        <thead>
          {hasGroups && (
            <tr className="crl-grouprow">
              {groupSpans.map((g, i) => (
                <th
                  key={`${g.label}-${i}`}
                  colSpan={g.span}
                  className={g.divider ? "crl-col-divider" : undefined}
                >
                  {g.label}
                </th>
              ))}
            </tr>
          )}
          <tr>
            {columns.map((c) => {
              const active = sort?.key === c.key;
              const cls = [
                alignClass(c),
                c.sticky ? "crl-sticky-col" : "",
                c.divider ? "crl-col-divider" : "",
                c.sortable && c.sortValue ? "crl-sortable" : "",
                active ? "crl-sorted" : "",
              ]
                .filter(Boolean)
                .join(" ");
              return (
                <th
                  key={c.key}
                  className={cls || undefined}
                  style={c.width ? { width: c.width, minWidth: c.width } : undefined}
                  onClick={() => toggle(c)}
                >
                  {c.label}
                  {c.sortable && c.sortValue && (
                    <span className="crl-sort-icon">
                      {active ? (sort!.dir === "asc" ? "▲" : "▼") : "⇅"}
                    </span>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>

        <tbody>
          {loading && (
            <tr>
              <td colSpan={columns.length}>
                <div className="crl-empty">Loading…</div>
              </td>
            </tr>
          )}

          {!loading && sorted.length === 0 && (
            <tr>
              <td colSpan={columns.length}>
                <div className="crl-empty">
                  <div className="crl-empty-title">{emptyTitle}</div>
                  <div>{emptyHint}</div>
                </div>
              </td>
            </tr>
          )}

          {!loading &&
            sorted.map((row, i) => (
              <tr key={rowKey(row, i)} className={rowClass?.(row) || undefined}>
                {columns.map((c) => {
                  const cls = [
                    alignClass(c),
                    c.date ? "crl-cell-date" : "",
                    c.sticky ? "crl-sticky-col" : "",
                    c.divider ? "crl-col-divider" : "",
                    c.className?.(row) ?? "",
                  ]
                    .filter(Boolean)
                    .join(" ");
                  return (
                    <td key={c.key} className={cls || undefined}>
                      {c.render(row)}
                    </td>
                  );
                })}
              </tr>
            ))}
        </tbody>

        {showTotals && !loading && sorted.length > 0 && (
          <tfoot>
            <tr>
              {columns.map((c) => {
                const cls = [
                  alignClass(c),
                  c.sticky ? "crl-sticky-col" : "",
                  c.divider ? "crl-col-divider" : "",
                ]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <td key={c.key} className={cls || undefined}>
                    {c.total ? c.total() : null}
                  </td>
                );
              })}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

export default ControlRoomTable;
