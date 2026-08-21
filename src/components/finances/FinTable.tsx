import * as React from "react";
import { cn } from "@/lib/utils";
import { formatNumberSpaces } from "@/lib/currency";
import { fmtDate } from "@/lib/format-date";

/**
 * FinTable — dense financial-table primitives.
 *
 * Visual contract:
 *  - <thead>: h-8, text-[10px] uppercase tracking-wider muted bg, sticky top
 *  - <tbody> row: h-8, text-[12px], hover bg-muted/30
 *  - numeric cells: font-mono tabular-nums right-aligned
 *  - text-heavy cells: truncate with title-tooltip
 *
 * Column widths (use Tailwind w-[Npx] on <FinTH>/<FinTD>):
 *   date   88     ccy   44     pct   52
 *   amount 120    actions 40
 */

export function FinTable({
  className,
  sticky,
  ...props
}: React.TableHTMLAttributes<HTMLTableElement> & { sticky?: boolean }) {
  return (
    <div className="w-full overflow-x-auto rounded-md border border-border bg-card">
      <table
        className={cn("w-full border-collapse text-[12px]", className)}
        {...props}
      />
    </div>
  );
}

export function FinTHead({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={cn(
        "bg-muted/40 [&_th]:h-8 [&_th]:px-2 [&_th]:font-semibold [&_th]:uppercase [&_th]:tracking-wider [&_th]:text-[10px] [&_th]:text-muted-foreground [&_th]:whitespace-nowrap",
        className,
      )}
      {...props}
    />
  );
}

export function FinTBody({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn("", className)} {...props} />;
}

export function FinTR({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn(
        "border-t border-border hover:bg-muted/30 [&>td]:h-8 [&>td]:px-2 [&>td]:align-middle",
        className,
      )}
      {...props}
    />
  );
}

type CellProps = React.TdHTMLAttributes<HTMLTableCellElement> & {
  align?: "left" | "right" | "center";
  numeric?: boolean;
  sticky?: boolean;
};

export function FinTH({ className, align = "left", numeric, sticky, ...props }: CellProps & React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        align === "right" && "text-right",
        align === "center" && "text-center",
        align === "left" && "text-left",
        numeric && "font-mono tabular-nums text-right",
        sticky && "sticky left-0 z-10 bg-muted/40",
        className,
      )}
      {...props}
    />
  );
}

export function FinTD({ className, align = "left", numeric, sticky, ...props }: CellProps) {
  return (
    <td
      className={cn(
        align === "right" && "text-right",
        align === "center" && "text-center",
        numeric && "font-mono tabular-nums text-right",
        sticky && "sticky left-0 z-10 bg-card",
        className,
      )}
      {...props}
    />
  );
}

/* ---------- Cell helpers ---------- */

export function FinAmount({
  value,
  ccy,
  signed = true,
  className,
  hint,
}: {
  value: number | null | undefined;
  ccy?: string;
  signed?: boolean;
  className?: string;
  hint?: string;
}) {
  const v = Number(value || 0);
  const tone = signed ? (v < 0 ? "cms-amount-negative" : v > 0 ? "cms-amount-positive" : "text-muted-foreground") : "text-foreground";
  return (
    <span className={cn("font-mono tabular-nums text-[12px]", tone, className)}>
      {formatNumberSpaces(v)}
      {ccy && ccy !== "TZS" && (
        <span className="ml-1 text-[10px] text-muted-foreground">{ccy}</span>
      )}
      {hint && <span className="ml-1 text-[10px] text-muted-foreground">{hint}</span>}
    </span>
  );
}

export function FinDate({ value, className }: { value: any; className?: string }) {
  return (
    <span className={cn("font-mono tabular-nums text-[11px] text-muted-foreground whitespace-nowrap", className)}>
      {fmtDate(value)}
    </span>
  );
}

export function FinTrunc({
  children,
  max = "max-w-[260px]",
  muted,
  className,
}: {
  children: React.ReactNode;
  max?: string;
  muted?: boolean;
  className?: string;
}) {
  const text = typeof children === "string" ? children : undefined;
  return (
    <span
      title={text}
      className={cn(
        "block truncate",
        max,
        muted && "text-muted-foreground",
        className,
      )}
    >
      {children || (muted ? "—" : null)}
    </span>
  );
}

export function FinPct({ value, className }: { value: number | null | undefined; className?: string }) {
  if (value == null || !Number.isFinite(value)) {
    return <span className="font-mono tabular-nums text-[11px] text-muted-foreground">—</span>;
  }
  const v = Math.round(value * 100);
  return (
    <span className={cn("font-mono tabular-nums text-[11px]", className)}>{v}%</span>
  );
}

export function FinEmpty({ msg = "No data", colSpan }: { msg?: string; colSpan: number }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-3 py-6 text-center text-[11px] text-muted-foreground">
        {msg}
      </td>
    </tr>
  );
}

/* Standard widths to reuse on <FinTH>/<FinTD> via className */
export const FW = {
  date: "w-[88px]",
  ccy: "w-[44px]",
  pct: "w-[56px]",
  amount: "w-[120px]",
  actions: "w-[40px]",
  wallet: "w-[140px]",
} as const;
