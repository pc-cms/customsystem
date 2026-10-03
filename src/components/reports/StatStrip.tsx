import { cn } from "@/lib/utils";

export interface StatItem {
  label: string;
  value: string;
  cls?: string;
}

/** Compact analytics bar — one panel, hairline dividers, no empty tiles. */
export const StatStrip = ({ items }: { items: StatItem[] }) => (
  <div className="flex flex-wrap items-stretch rounded-lg border border-border/60 bg-card overflow-hidden">
    {items.map((c, i) => (
      <div
        key={`${c.label}-${i}`}
        className="flex-1 min-w-[140px] px-4 py-2.5 border-r border-border/40 last:border-r-0"
      >
        <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{c.label}</p>
        <p className={cn("mt-0.5 font-mono tabular-nums text-[15px] font-semibold text-foreground", c.cls)}>{c.value}</p>
      </div>
    ))}
  </div>
);

/** Shared Statistics table look: denser numbers, calm header, left-aligned dates. */
export const statsTableClass =
  "[&_th]:border-b [&_th]:border-border/60 [&_th]:text-[10px] [&_th]:tracking-[0.08em] [&_td]:py-2 [&_td]:text-[13px] [&_td:first-child]:text-left [&_th:first-child]:text-left [&_td:first-child]:pl-4 [&_th:first-child]:pl-4 [&_tbody_tr]:hover:bg-muted/30";

/** Pinned TOTAL row — quiet contrast, hairline borders. */
export const statsTotalClass =
  "border-b border-border/60 bg-muted/40 [&_th]:h-9 [&_th]:text-[13px] [&_th]:tracking-normal [&_th]:normal-case [&_th]:font-semibold";
