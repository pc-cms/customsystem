import { memo, type ReactNode } from "react";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtDate } from "@/lib/format-date";
import { getBusinessDate } from "@/lib/business-day";
import { useEffectiveBusinessDate } from "@/hooks/use-business-day-closure";

interface PageHeaderProps {
  icon?: LucideIcon;
  title: string;
  subtitle?: string;
  /** Optional context shown to the right of the title (e.g. casino badge, role, period). */
  context?: ReactNode;
  /** Content rendered centered between the title block and the actions/date slot. */
  centerSlot?: ReactNode;
  /** Action buttons rendered on the right side of the header (left of date). */
  children?: ReactNode;
  /**
   * Date displayed in the far-right slot. Pass `true` for today's business date,
   * a Date/string for a specific date, or `false`/omit to hide.
   * Always rendered with the same size/font on every page.
   */
  date?: Date | string | boolean;
  /** Optional row rendered immediately below the header (filters, tabs, segmented control). */
  belowHeader?: ReactNode;
  className?: string;
}

/**
 * Unified page header used across ALL pages.
 *
 * Layout:
 *   [icon] Title  [context]      [centerSlot]      [actions] [DATE]
 *          subtitle
 *   [belowHeader (filters/tabs)]
 */
export const PageHeader = memo(function PageHeader({
  icon: Icon,
  title,
  subtitle,
  context,
  centerSlot,
  children,
  date,
  belowHeader,
  className,
}: PageHeaderProps) {
  const { data: serverBusinessDate } = useEffectiveBusinessDate();
  const dateValue: Date | string | null =
    date === true ? (serverBusinessDate || getBusinessDate()) : date && typeof date !== "boolean" ? date : null;

  return (
    <div className={cn("mb-4 pb-3 border-b border-border space-y-3", className)}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0 shrink-0 text-xs">
          {Icon && (
            <div className="w-9 h-9 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Icon className="w-5 h-5" />
            </div>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <h1 className="text-lg font-semibold tracking-tight text-foreground truncate">
                {title}
              </h1>
              {context && <div className="shrink-0 flex items-center gap-2">{context}</div>}
            </div>
            {subtitle && (
              <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
            )}
          </div>
        </div>
        {centerSlot && (
          <div className="flex-1 flex items-center justify-center min-w-0">
            {centerSlot}
          </div>
        )}
        {!centerSlot && <div className="flex-1" />}
        {(children || dateValue) && (
          <div className="flex items-center gap-3 shrink-0">
            {children && <div className="flex items-center gap-2">{children}</div>}
            {dateValue && (
              <span className="inline-flex items-center h-9 px-3 rounded-md border border-border bg-background text-base font-bold font-mono tabular-nums text-foreground whitespace-nowrap">
                {fmtDate(dateValue as Date | string)}
              </span>
            )}
          </div>
        )}
      </div>
      {belowHeader && <div className="flex items-center gap-2 flex-wrap">{belowHeader}</div>}
    </div>
  );
});

