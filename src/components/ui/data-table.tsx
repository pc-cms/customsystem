import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * DataTable v2 — unified shell for every list/report in the system.
 *
 * Features:
 *  - sticky header (always) + optional sticky first column
 *  - zebra rows (odd:bg-muted/20) + hover bg-muted/40
 *  - dotted vertical dividers between columns
 *  - column "type" system enforces width/alignment/numerals so name
 *    columns no longer eat half the table:
 *      text   — flexible, max 240px
 *      name   — flexible, max 220px, ellipsis
 *      money  — right, mono tabular, auto (use <MoneyCell/>)
 *      int    — right, mono tabular, max-content
 *      time   — right, mono, fixed ~64px
 *      date   — right, mono, fixed ~104px
 *      status — center, fixed 120px
 *      actions— right, content
 *
 *   <DataTable>
 *     <DTHead>
 *       <DTRow>
 *         <DTHeader type="name">Player</DTHeader>
 *         <DTHeader type="money">Buy-in</DTHeader>
 *       </DTRow>
 *     </DTHead>
 *     <DTBody>
 *       <DTRow><DTCell type="name">Acme</DTCell><DTCell type="money">120,000</DTCell></DTRow>
 *     </DTBody>
 *   </DataTable>
 */

type ColType =
  | "text"
  | "name"
  | "money"
  | "int"
  | "time"
  | "date"
  | "status"
  | "actions";

const TYPE_TH: Record<ColType, string> = {
  text: "text-left",
  name: "text-left",
  money: "text-right font-mono tabular-nums",
  int: "text-right font-mono tabular-nums",
  time: "text-right font-mono tabular-nums",
  date: "text-right font-mono tabular-nums",
  status: "text-center",
  actions: "text-right",
};

const TYPE_TD: Record<ColType, string> = {
  text: "text-left",
  name: "text-left truncate",
  money: "text-right font-mono tabular-nums whitespace-nowrap",
  int: "text-right font-mono tabular-nums whitespace-nowrap",
  time: "text-right font-mono tabular-nums whitespace-nowrap",
  date: "text-right font-mono tabular-nums whitespace-nowrap",
  status: "text-center whitespace-nowrap",
  actions: "text-right whitespace-nowrap",
};

const TYPE_STYLE: Record<ColType, React.CSSProperties> = {
  text: { maxWidth: 240 },
  name: { maxWidth: 220 },
  money: {},
  int: { width: "1%" },
  time: { width: 64 },
  date: { width: 104 },
  status: { width: 120 },
  actions: { width: "1%" },
};

interface DataTableProps extends React.TableHTMLAttributes<HTMLTableElement> {
  /** Auto-scroll horizontally when content overflows. Default true. */
  scroll?: boolean;
  /** Make the first column sticky on horizontal scroll. */
  stickyFirstColumn?: boolean;
  /** Hide outer border (for embedded usage). */
  bare?: boolean;
}

export const DataTable = React.forwardRef<HTMLTableElement, DataTableProps>(
  ({ className, scroll = true, stickyFirstColumn, bare, ...props }, ref) => (
    <div
      className={cn(
        "w-full",
        scroll && "overflow-x-auto",
        !bare && "rounded-lg border border-border",
        stickyFirstColumn && "[&_tbody_tr_td:first-child]:sticky [&_tbody_tr_td:first-child]:left-0 [&_tbody_tr_td:first-child]:bg-card [&_thead_tr_th:first-child]:sticky [&_thead_tr_th:first-child]:left-0 [&_thead_tr_th:first-child]:z-20 [&_thead_tr_th:first-child]:bg-muted",
      )}
    >
      <table
        ref={ref}
        className={cn(
          "w-full text-sm border-collapse",
          // dotted vertical dividers between cells
          "[&_th:not(:last-child)]:border-r [&_th:not(:last-child)]:border-dashed [&_th:not(:last-child)]:border-border/60",
          "[&_td:not(:last-child)]:border-r [&_td:not(:last-child)]:border-dashed [&_td:not(:last-child)]:border-border/40",
          className,
        )}
        style={{ tableLayout: "auto" }}
        {...props}
      />
    </div>
  ),
);
DataTable.displayName = "DataTable";

export const DTHead = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead
    ref={ref}
    className={cn(
      "sticky top-0 z-10 bg-muted [&_tr]:border-b border-border",
      className,
    )}
    {...props}
  />
));
DTHead.displayName = "DTHead";

export const DTBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody
    ref={ref}
    className={cn(
      "[&_tr:last-child]:border-0 [&_tr:nth-child(odd)]:bg-muted/20",
      className,
    )}
    {...props}
  />
));
DTBody.displayName = "DTBody";

// Memoized — table rows are the dominant render cost on long lists.
// Children passed as JSX still re-create on each parent render, so the
// memo only saves time when consumers pass stable children (typical:
// stringified cells). Worst case = identical perf as before.
export const DTRow = React.memo(
  React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
    ({ className, ...props }, ref) => (
      <tr
        ref={ref}
        className={cn(
          "border-b border-border transition-colors hover:bg-muted/40",
          className,
        )}
        {...props}
      />
    ),
  ),
);
DTRow.displayName = "DTRow";

interface CellProps extends React.TdHTMLAttributes<HTMLTableCellElement> {
  align?: "left" | "right" | "center";
  numeric?: boolean;
  /** Column semantic type — controls width/alignment/numerals. */
  type?: ColType;
}

function mergeStyle(
  base: React.CSSProperties | undefined,
  extra: React.CSSProperties | undefined,
): React.CSSProperties | undefined {
  if (!base && !extra) return undefined;
  return { ...(extra ?? {}), ...(base ?? {}) };
}

export const DTHeader = React.forwardRef<HTMLTableCellElement, CellProps>(
  ({ className, align, numeric, type, style, ...props }, ref) => (
    <th
      ref={ref}
      className={cn(
        "h-9 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap",
        type && TYPE_TH[type],
        align === "right" && "text-right",
        align === "center" && "text-center",
        align === "left" && "text-left",
        numeric && "font-mono tabular-nums text-right",
        className,
      )}
      style={mergeStyle(style, type ? TYPE_STYLE[type] : undefined)}
      {...props}
    />
  ),
);
DTHeader.displayName = "DTHeader";

export const DTCell = React.forwardRef<HTMLTableCellElement, CellProps>(
  ({ className, align, numeric, type, style, ...props }, ref) => (
    <td
      ref={ref}
      className={cn(
        "h-10 px-3 align-middle text-foreground",
        type && TYPE_TD[type],
        align === "right" && "text-right",
        align === "center" && "text-center",
        align === "left" && "text-left",
        numeric && "font-mono tabular-nums text-right whitespace-nowrap",
        className,
      )}
      style={mergeStyle(style, type ? TYPE_STYLE[type] : undefined)}
      {...props}
    />
  ),
);
DTCell.displayName = "DTCell";

export type { ColType };
