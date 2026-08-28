/**
 * Compact period selector used by the Office / Budget toolbar.
 * Arrows step month by month; the label opens month / year / custom range.
 */
import { ChevronLeft, ChevronRight, CalendarRange } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { fmtDateOnly } from "@/lib/format-date";

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
  const shift = (delta: number) => {
    const d = new Date(value.year, value.month - 1 + delta, 1);
    onChange(monthPeriod(d.getFullYear(), d.getMonth() + 1));
  };

  const nowRef = new Date();
  const isCurrentMonth =
    value.mode === "month" &&
    value.year === nowRef.getFullYear() &&
    value.month === nowRef.getMonth() + 1;

  const label =
    value.mode === "custom"
      ? `${fmtDateOnly(value.from)} — ${fmtDateOnly(value.to)}`
      : `${MONTH_NAMES[value.month - 1]} ${value.year}`;


  return (
    <div className="flex items-center gap-1">
      <Button
        variant="outline"
        size="sm"
        className="h-8 w-8 p-0"
        onClick={() => shift(-1)}
        aria-label="Previous month"
        disabled={value.mode === "custom"}
      >
        <ChevronLeft className="w-4 h-4" />
      </Button>

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

      <Button
        variant="outline"
        size="sm"
        className="h-8 w-8 p-0"
        onClick={() => shift(1)}
        aria-label="Next month"
        disabled={value.mode === "custom"}
      >
        <ChevronRight className="w-4 h-4" />
      </Button>

      {!isCurrentMonth && (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2 text-xs"
          onClick={() => onChange(currentMonthPeriod())}
        >
          This month
        </Button>
      )}
    </div>
  );
}

