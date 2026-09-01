/**
 * Compact period selector used by the Office / Budget toolbar.
 * A single dropdown: the label opens month / year / custom range.
 * (Prev/next arrows and "This month" removed in Stage 2A, 2026-09-01.)
 */
import { ChevronLeft, ChevronRight, CalendarRange } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { fmtDateOnly } from "@/lib/format-date";
import { businessDateOf } from "@/lib/business-day";

export type OfficePeriod = {
  mode: "month" | "custom";
  year: number;
  month: number; // 1-12
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
};

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const pad = (n: number) => String(n).padStart(2, "0");

export function monthRange(year: number, month: number) {
  const last = new Date(year, month, 0).getDate();
  return { from: `${year}-${pad(month)}-01`, to: `${year}-${pad(month)}-${pad(last)}` };
}

export function currentMonthPeriod(): OfficePeriod {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  return { mode: "month", year, month, ...monthRange(year, month) };
}

/**
 * Accounting month = the month of the business day currently being closed.
 * Closing always happens the next morning, so on 01/09 the accounting month
 * is still August. Office screens default to this month, never to the raw
 * calendar month, otherwise the 1st of a month shows an empty period while
 * yesterday's figures are still being entered.
 */
export function accountingMonthPeriod(now: Date = new Date()): OfficePeriod {
  const today = businessDateOf(now.toISOString());
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return monthPeriod(d.getUTCFullYear(), d.getUTCMonth() + 1);
}

/** Month of a YYYY-MM-DD business date. */
export function monthOfDate(date: string): { year: number; month: number } {
  return { year: Number(date.slice(0, 4)), month: Number(date.slice(5, 7)) };
}

export function nextMonthPeriod(year: number, month: number): OfficePeriod {
  const d = new Date(Date.UTC(year, month, 1));
  return monthPeriod(d.getUTCFullYear(), d.getUTCMonth() + 1);
}

export function monthPeriod(year: number, month: number): OfficePeriod {
  return { mode: "month", year, month, ...monthRange(year, month) };
}


export function PeriodPicker({
  value,
  onChange,
}: {
  value: OfficePeriod;
  onChange: (p: OfficePeriod) => void;
}) {
  const label =
    value.mode === "custom"
      ? `${fmtDateOnly(value.from)} — ${fmtDateOnly(value.to)}`
      : `${MONTH_NAMES[value.month - 1]} ${value.year}`;


  return (
    <div className="flex items-center gap-1 shrink-0">
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 min-w-[170px] justify-center gap-2 text-xs font-medium">
            <CalendarRange className="w-3.5 h-3.5 opacity-70" />
            {label}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 p-3 space-y-3">
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => onChange(monthPeriod(value.year - 1, value.month))}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-sm font-semibold tabular-nums">{value.year}</span>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => onChange(monthPeriod(value.year + 1, value.month))}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>

          <div className="grid grid-cols-3 gap-1">
            {MONTH_NAMES.map((m, i) => {
              const active = value.mode === "month" && value.month === i + 1;
              return (
                <Button
                  key={m}
                  size="sm"
                  variant={active ? "default" : "ghost"}
                  className="h-7 text-xs"
                  onClick={() => onChange(monthPeriod(value.year, i + 1))}
                >
                  {m.slice(0, 3)}
                </Button>
              );
            })}
          </div>

          <div className="pt-2 border-t border-border space-y-2">
            <div className="text-xs text-muted-foreground">Custom range</div>
            <div className="flex items-center gap-2">
              <Input
                type="date"
                className="h-8 text-xs"
                value={value.from}
                onChange={(e) =>
                  onChange({ ...value, mode: "custom", from: e.target.value })
                }
              />
              <Input
                type="date"
                className="h-8 text-xs"
                value={value.to}
                onChange={(e) => onChange({ ...value, mode: "custom", to: e.target.value })}
              />
            </div>
            {value.mode === "custom" && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 w-full text-xs"
                onClick={() => onChange(monthPeriod(value.year, value.month))}
              >
                Back to month
              </Button>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

