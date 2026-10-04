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
  "[&_th]:border-b [&_th]:border-border/60 [&_th]:text-[10px] [&_th]:tracking-[0.08em] [&_td]:py-2 [&_td]:text-sm [&_td]:tabular-nums [&_td:first-child]:text-left [&_th:first-child]:text-left [&_td:first-child]:pl-4 [&_th:first-child]:pl-4 [&_tbody_tr]:transition-colors [&_tbody_tr:hover]:bg-primary/[0.06]";

/** Pinned TOTAL row — quiet contrast, hairline borders. */
export const statsTotalClass =
  "border-b border-border/60 bg-muted/40 [&_th]:h-9 [&_th]:text-[13px] [&_th]:tracking-normal [&_th]:normal-case [&_th]:font-semibold";

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** Date cell with weekday; Fri–Sun gently emphasised. */
export const DayLabel = ({ date }: { date: string }) => {
  const [y, m, d] = date.slice(0, 10).split("-").map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const weekend = wd === 0 || wd === 5 || wd === 6;
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap">
      <span className={cn("w-7 text-[10px] font-semibold uppercase tracking-wide", weekend ? "text-primary" : "text-muted-foreground")}>{WD[wd]}</span>
      <span className="font-mono tabular-nums">{`${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`}</span>
    </span>
  );
};
