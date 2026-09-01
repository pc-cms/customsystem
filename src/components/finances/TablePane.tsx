import { ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * TablePane — unified scroll container for finance tables.
 *
 * Contract (used by Import Statement / Rates / Inter-Casino):
 *  - vertical scrolling bounded to the viewport (sticky headers anchor here),
 *  - horizontal scrolling when columns overflow,
 *  - single border + card background so the inner SmartTable renders `bare`.
 *
 * Usage:
 *   <TablePane>
 *     <SmartTable bare scroll={false} stickyHeader ... />
 *   </TablePane>
 */
export function TablePane({
  children,
  className,
  maxHeight = "max-h-[70vh]",
}: {
  children: ReactNode;
  className?: string;
  /** Tailwind max-height class; pass "" to let content grow freely. */
  maxHeight?: string;
}) {
  return (
    <div
      className={cn(
        "relative w-full overflow-auto rounded-md border border-border bg-card",
        maxHeight,
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * ErrorPane — consistent inline error state for failed list queries.
 * Renders a compact destructive banner with an optional Retry action.
 */
export function ErrorPane({
  message = "Failed to load data",
  onRetry,
  className,
}: {
  message?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex items-center gap-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2",
        className,
      )}
    >
      <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
      <span className="flex-1 text-xs text-destructive">{message}</span>
      {onRetry && (
        <Button
          size="sm"
          variant="outline"
          className="h-7 border-destructive/40 text-destructive hover:bg-destructive/10"
          onClick={onRetry}
        >
          <RotateCcw className="h-3.5 w-3.5" /> Retry
        </Button>
      )}
    </div>
  );
}
