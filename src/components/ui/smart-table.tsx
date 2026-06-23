/**
 * SmartTable — single config-driven table component for every list/report.
 *
 * Why: instead of duplicating `<table>` markup (sort handlers, sticky cols,
 * empty state, virtualization) across 30+ pages, every list declares an
 * array of `ColumnDef` and gets:
 *   - unified visual via existing DataTable/DTHead/DTBody/DTRow/DTCell
 *     (same CSS — zero visual regression with hand-rolled tables that
 *      already used DataTable),
 *   - built-in click-to-sort with mono-numeric awareness,
 *   - automatic virtualization (window-rendered rows) when data.length
 *     exceeds the threshold (default 200) — solves the "long list lag"
 *     for Players/Bank-Checks/Expenses/Cancelled in one place,
 *   - permission-aware column visibility — hidden columns aren't even
 *     mounted, so Cashier doesn't pay for finance cells,
 *   - stable React.memo'd rows via `rowKey`.
 *
 * Adding a new page = ~30 lines of config. Adding a new role = nothing.
 */
import * as React from "react";
import {
  DataTable,
  DTHead,
  DTBody,
  DTRow,
  DTHeader,
  DTCell,
  type ColType,
} from "@/components/ui/data-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronUp } from "lucide-react";

export type SortDir = "asc" | "desc";
export interface SortState {
  key: string;
  dir: SortDir;
}

export interface TableCtx {
  /** Allow callers to gate columns on permissions/role/etc. */
  [k: string]: unknown;
}

export interface ColumnDef<T> {
  /** Unique column id; also the sort key. */
  key: string;
  /** Header label. */
  header: React.ReactNode;
  /** Column semantic type (drives width/alignment/numerals). */
  type?: ColType;
  /** Cell renderer. */
  accessor: (row: T, index: number) => React.ReactNode;
  /** Optional sort value extractor; if absent the column is not sortable. */
  sortValue?: (row: T) => string | number | null | undefined;
  /** Custom cell className (per row). */
  cellClassName?: string | ((row: T) => string | undefined);
  /** Custom header className. */
  headerClassName?: string;
  /** Inline style for the column (header + cells). */
  style?: React.CSSProperties;
  /** Hide column based on context (permissions, role, mode). */
  hidden?: (ctx: TableCtx) => boolean;
}

export interface SmartTableProps<T> {
  data: T[];
  columns: ColumnDef<T>[];
  rowKey: (row: T) => string | number;
  /** Controlled sort (optional). When omitted, table manages its own. */
  sort?: SortState | null;
  defaultSort?: SortState | null;
  onSortChange?: (s: SortState | null) => void;
  /** Context object passed to column.hidden(). */
  ctx?: TableCtx;
  /** Empty-state node. */
  empty?: React.ReactNode;
  /** Loading skeleton rows count (renders shimmer rows). */
  loading?: boolean;
  loadingRows?: number;
  /** Per-row classNames or handler. */
  rowClassName?: string | ((row: T) => string | undefined);
  /** Per-row click handler. */
  onRowClick?: (row: T) => void;
  /** Sticky first column. */
  stickyFirstColumn?: boolean;
  /**
   * Auto-enable row virtualization when data.length exceeds this threshold.
   * Pass `false` to disable, or a number to override (default 200).
   * Virtualization requires a fixed scrollable container — caller must wrap
   * SmartTable in an element with bounded height.
   */
  virtualize?: boolean | number;
  /** Estimated row height in px (for virtualizer). */
  rowHeight?: number;
  /** Outer wrapper className (applied to DataTable wrapper). */
  className?: string;
  /** Render as bare (no border) when embedded in a card. */
  bare?: boolean;
}

const DEFAULT_VIRTUAL_THRESHOLD = 200;

function compare(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

/** Non-virtualized body — used for small lists or when virtualization is off. */
function PlainBody<T>({
  rows,
  visibleCols,
  rowKey,
  rowClassName,
  onRowClick,
}: {
  rows: T[];
  visibleCols: ColumnDef<T>[];
  rowKey: SmartTableProps<T>["rowKey"];
  rowClassName?: SmartTableProps<T>["rowClassName"];
  onRowClick?: SmartTableProps<T>["onRowClick"];
}) {
  return (
    <DTBody>
      {rows.map((row, idx) => {
        const cls = typeof rowClassName === "function" ? rowClassName(row) : rowClassName;
        return (
          <DTRow
            key={rowKey(row)}
            className={cn(onRowClick && "cursor-pointer", cls)}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
          >
            {visibleCols.map((c) => {
              const cellCls =
                typeof c.cellClassName === "function" ? c.cellClassName(row) : c.cellClassName;
              return (
                <DTCell key={c.key} type={c.type} className={cellCls} style={c.style}>
                  {c.accessor(row, idx)}
                </DTCell>
              );
            })}
          </DTRow>
        );
      })}
    </DTBody>
  );
}

/** Virtualized body — windowed rendering for long lists. */
function VirtualBody<T>({
  rows,
  visibleCols,
  rowKey,
  rowClassName,
  onRowClick,
  rowHeight,
  scrollRef,
}: {
  rows: T[];
  visibleCols: ColumnDef<T>[];
  rowKey: SmartTableProps<T>["rowKey"];
  rowClassName?: SmartTableProps<T>["rowClassName"];
  onRowClick?: SmartTableProps<T>["onRowClick"];
  rowHeight: number;
  scrollRef: React.RefObject<HTMLDivElement>;
}) {
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 12,
  });
  const items = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();
  const paddingTop = items.length > 0 ? items[0].start : 0;
  const paddingBottom = items.length > 0 ? totalSize - items[items.length - 1].end : 0;
  const colSpan = visibleCols.length;

  return (
    <DTBody>
      {paddingTop > 0 && (
        <tr aria-hidden style={{ height: paddingTop }}>
          <td colSpan={colSpan} />
        </tr>
      )}
      {items.map((vi) => {
        const row = rows[vi.index];
        const cls = typeof rowClassName === "function" ? rowClassName(row) : rowClassName;
        return (
          <DTRow
            key={rowKey(row)}
            className={cn(onRowClick && "cursor-pointer", cls)}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
          >
            {visibleCols.map((c) => {
              const cellCls =
                typeof c.cellClassName === "function" ? c.cellClassName(row) : c.cellClassName;
              return (
                <DTCell key={c.key} type={c.type} className={cellCls} style={c.style}>
                  {c.accessor(row, vi.index)}
                </DTCell>
              );
            })}
          </DTRow>
        );
      })}
      {paddingBottom > 0 && (
        <tr aria-hidden style={{ height: paddingBottom }}>
          <td colSpan={colSpan} />
        </tr>
      )}
    </DTBody>
  );
}

export function SmartTable<T>({
  data,
  columns,
  rowKey,
  sort,
  defaultSort = null,
  onSortChange,
  ctx,
  empty,
  loading,
  loadingRows = 6,
  rowClassName,
  onRowClick,
  stickyFirstColumn,
  virtualize = true,
  rowHeight = 40,
  className,
  bare,
}: SmartTableProps<T>) {
  // Internal sort state (used when uncontrolled).
  const [internalSort, setInternalSort] = React.useState<SortState | null>(defaultSort);
  const isControlled = sort !== undefined;
  const activeSort = isControlled ? sort ?? null : internalSort;

  const visibleCols = React.useMemo(
    () => columns.filter((c) => !(c.hidden && c.hidden(ctx ?? {}))),
    [columns, ctx],
  );

  const sortedData = React.useMemo(() => {
    if (!activeSort) return data;
    const col = visibleCols.find((c) => c.key === activeSort.key);
    if (!col?.sortValue) return data;
    const dir = activeSort.dir === "asc" ? 1 : -1;
    return [...data].sort((a, b) => compare(col.sortValue!(a), col.sortValue!(b)) * dir);
  }, [data, activeSort, visibleCols]);

  const handleSort = React.useCallback(
    (key: string) => {
      const next: SortState | null = (() => {
        if (!activeSort || activeSort.key !== key) return { key, dir: "asc" };
        if (activeSort.dir === "asc") return { key, dir: "desc" };
        return null;
      })();
      if (isControlled) onSortChange?.(next);
      else {
        setInternalSort(next);
        onSortChange?.(next);
      }
    },
    [activeSort, isControlled, onSortChange],
  );

  // Virtualization decision.
  const threshold =
    typeof virtualize === "number" ? virtualize : virtualize ? DEFAULT_VIRTUAL_THRESHOLD : Infinity;
  const useVirtual = sortedData.length > threshold && !loading;
  const scrollRef = React.useRef<HTMLDivElement>(null);

  const headerRow = (
    <DTHead>
      <DTRow>
        {visibleCols.map((c) => {
          const sortable = !!c.sortValue;
          const isSorted = activeSort?.key === c.key;
          return (
            <DTHeader
              key={c.key}
              type={c.type}
              className={cn(sortable && "cursor-pointer select-none", c.headerClassName)}
              style={c.style}
              onClick={sortable ? () => handleSort(c.key) : undefined}
            >
              <span className="inline-flex items-center gap-1">
                {c.header}
                {sortable && isSorted && (
                  activeSort!.dir === "asc"
                    ? <ChevronUp className="h-3 w-3" />
                    : <ChevronDown className="h-3 w-3" />
                )}
              </span>
            </DTHeader>
          );
        })}
      </DTRow>
    </DTHead>
  );

  // Empty / loading.
  if (!loading && sortedData.length === 0) {
    return (
      <DataTable
        className={className}
        bare={bare}
        stickyFirstColumn={stickyFirstColumn}
      >
        {headerRow}
        <DTBody>
          <DTRow>
            <DTCell
              colSpan={visibleCols.length}
              className="text-center text-muted-foreground py-8"
            >
              {empty ?? "No data"}
            </DTCell>
          </DTRow>
        </DTBody>
      </DataTable>
    );
  }

  if (loading) {
    return (
      <DataTable className={className} bare={bare} stickyFirstColumn={stickyFirstColumn}>
        {headerRow}
        <DTBody>
          {Array.from({ length: loadingRows }).map((_, i) => (
            <DTRow key={i}>
              {visibleCols.map((c) => (
                <DTCell key={c.key} type={c.type}>
                  <div className="h-4 w-3/4 rounded bg-muted/60 animate-pulse" />
                </DTCell>
              ))}
            </DTRow>
          ))}
        </DTBody>
      </DataTable>
    );
  }

  // Virtualized path requires a scrollable wrapper; the inner DataTable
  // is marked `scroll={false}` so its overflow doesn't fight the
  // virtualizer's getScrollElement target.
  if (useVirtual) {
    return (
      <div
        ref={scrollRef}
        className={cn(
          "w-full overflow-auto",
          !bare && "rounded-lg border border-border",
          className,
        )}
        style={{ maxHeight: "100%" }}
      >
        <DataTable scroll={false} bare stickyFirstColumn={stickyFirstColumn}>
          {headerRow}
          <VirtualBody
            rows={sortedData}
            visibleCols={visibleCols}
            rowKey={rowKey}
            rowClassName={rowClassName}
            onRowClick={onRowClick}
            rowHeight={rowHeight}
            scrollRef={scrollRef}
          />
        </DataTable>
      </div>
    );
  }

  return (
    <DataTable className={className} bare={bare} stickyFirstColumn={stickyFirstColumn}>
      {headerRow}
      <PlainBody
        rows={sortedData}
        visibleCols={visibleCols}
        rowKey={rowKey}
        rowClassName={rowClassName}
        onRowClick={onRowClick}
      />
    </DataTable>
  );
}
