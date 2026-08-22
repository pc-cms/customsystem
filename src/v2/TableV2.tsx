/**
 * CMS Table V2 — canonical styling primitives for normal financial /
 * report / admin tables inside the UI V2 preview scope.
 *
 * Not a data component: no fetching, no business logic. Specialized
 * operational grids (Breaklist, Player Tracking, Rota, Chip Count)
 * intentionally do NOT use this.
 */
import * as React from "react";
import { cn } from "@/lib/utils";
import { v2Money, v2Int } from "./format";

export function TableV2Wrap({
  className,
  maxHeight,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { maxHeight?: string }) {
  return (
    <div
      className={cn("w-full overflow-x-auto overflow-y-auto rounded-lg border border-border bg-card", className)}
      style={maxHeight ? { maxHeight } : undefined}
      {...props}
    />
  );
}

export function TableV2({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return <table className={cn("w-full text-[12px]", className)} {...props} />;
}

export function TheadV2({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={cn(
        "[&_th]:h-9 [&_th]:px-2.5 [&_th]:text-[10px] [&_th]:font-semibold [&_th]:uppercase [&_th]:tracking-wider [&_th]:text-muted-foreground [&_th]:border-b [&_th]:border-border",
        className,
      )}
      {...props}
    />
  );
}

export function TrV2({
  className,
  total,
  ...props
}: React.HTMLAttributes<HTMLTableRowElement> & { total?: boolean }) {
  return (
    <tr
      data-total={total ? "true" : undefined}
      className={cn("border-b border-border/60 [&>td]:h-9 [&>td]:px-2.5 [&>td]:align-middle", className)}
      {...props}
    />
  );
}

type CellProps = React.TdHTMLAttributes<HTMLTableCellElement> & {
  num?: boolean;
  stickyLeft?: boolean;
};

export function ThV2({ className, num, stickyLeft, ...props }: CellProps & React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        num ? "text-right" : "text-left",
        stickyLeft && "sticky left-0 z-10 bg-muted",
        className,
      )}
      {...props}
    />
  );
}

export function TdV2({ className, num, stickyLeft, ...props }: CellProps) {
  return (
    <td
      className={cn(
        num && "text-right font-mono tabular-nums",
        stickyLeft && "sticky left-0 z-[4] bg-card",
        className,
      )}
      {...props}
    />
  );
}

/**
 * Money cell honouring the zero-vs-dot rule:
 * a calculated value of 0 renders `0`; null/undefined renders `·`.
 */
export function MoneyV2({
  value,
  signed = true,
  className,
}: {
  value: number | null | undefined;
  signed?: boolean;
  className?: string;
}) {
  const known = value !== null && value !== undefined && !Number.isNaN(Number(value));
  const v = known ? Number(value) : 0;
  const tone = !known
    ? "text-muted-foreground"
    : signed && v < 0
      ? "cms-amount-negative"
      : signed && v > 0
        ? "cms-amount-positive"
        : "text-foreground";
  return <span className={cn("font-mono tabular-nums", tone, className)}>{known ? v2Int(v) : v2Money(null)}</span>;
}
