/**
 * Skeleton — animated placeholder blocks rendered while data loads.
 * Feels much faster than a spinner because the layout is already in place.
 *
 *   <Skeleton className="h-4 w-32" />
 *   <SkeletonRow cols={5} />
 *   <SkeletonTable rows={10} cols={5} />
 */
import { cn } from "@/lib/utils";

export const Skeleton = ({ className }: { className?: string }) => (
  <div
    className={cn(
      "animate-pulse rounded-md bg-muted/60",
      className,
    )}
  />
);

export const SkeletonRow = ({ cols = 4 }: { cols?: number }) => (
  <tr className="border-b border-border">
    {Array.from({ length: cols }).map((_, i) => (
      <td key={i} className="px-3 py-2">
        <Skeleton className="h-3.5 w-full" />
      </td>
    ))}
  </tr>
);

export const SkeletonTable = ({
  rows = 8,
  cols = 5,
}: {
  rows?: number;
  cols?: number;
}) => (
  <tbody>
    {Array.from({ length: rows }).map((_, i) => (
      <SkeletonRow key={i} cols={cols} />
    ))}
  </tbody>
);

/**
 * Generic full-page skeleton: header bar + filter bar + table. Drop-in
 * replacement for the old centered spinner used by AppLayout Suspense.
 */
export const PageSkeleton = () => (
  <div className="space-y-4">
    <div className="flex items-center justify-between border-b border-border pb-3">
      <div className="flex items-center gap-3">
        <Skeleton className="h-9 w-9 rounded-md" />
        <div className="space-y-1.5">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-56" />
        </div>
      </div>
      <Skeleton className="h-9 w-24" />
    </div>
    <div className="flex items-center gap-2">
      <Skeleton className="h-9 w-64" />
      <Skeleton className="h-9 w-32" />
    </div>
    <div className="rounded-md border border-border overflow-hidden">
      <table className="w-full">
        <SkeletonTable rows={10} cols={6} />
      </table>
    </div>
  </div>
);
