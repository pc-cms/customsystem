/**
 * DateRangePresets — unified date range selector used across the app.
 *
 * Presets: Day · Week · Month · Year · Custom
 *  - Day   = today
 *  - Week  = current calendar week, Sunday → Saturday
 *  - Month = current calendar month (1st → last day)
 *  - Year  = current calendar year (Jan 1 → Dec 31)
 *  - Custom = two date pickers (From / To)
 *
 * Prev/Next chevrons shift the active period by one unit of its kind
 * (day / week / month / year). In Custom mode they shift both endpoints
 * by the range length.
 */
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtDateOnly } from "@/lib/format-date";
import {
  format, addDays, subDays, addWeeks, subWeeks, addMonths, subMonths, addYears, subYears,
  startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear, parseISO,
  differenceInCalendarDays,
} from "date-fns";

export type DatePreset = "day" | "week" | "month" | "year" | "all" | "custom";

/** Default lower bound for the "All" preset — earliest plausible business date. */
const DEFAULT_ALL_FROM = "2020-01-01";

const iso = (d: Date) => format(d, "yyyy-MM-dd");
const fromIso = (s: string): Date => {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date();
  const d = parseISO(s);
  return Number.isNaN(d.getTime()) ? new Date() : d;
};

export const presetRange = (p: DatePreset, anchor: Date = new Date()): { from: string; to: string } => {
  switch (p) {
    case "day":   return { from: iso(anchor), to: iso(anchor) };
    case "week":  return { from: iso(startOfWeek(anchor, { weekStartsOn: 0 })), to: iso(endOfWeek(anchor, { weekStartsOn: 0 })) };
    case "month": return { from: iso(startOfMonth(anchor)), to: iso(endOfMonth(anchor)) };
    case "year":  return { from: iso(startOfYear(anchor)), to: iso(endOfYear(anchor)) };
    default:      return { from: iso(startOfMonth(anchor)), to: iso(endOfMonth(anchor)) };
  }
};

const PRESET_LABELS: Record<Exclude<DatePreset, "custom" | "all">, string> = {
  day: "Day", week: "Week", month: "Month", year: "Year",
};

interface DateRangePresetsProps {
  preset: DatePreset;
  from: string;
  to: string;
  onChange: (next: { preset: DatePreset; from: string; to: string }) => void;
  className?: string;
  /** Hide the prev/next arrows. Default false. */
  hideNav?: boolean;
  /** Hide the Week button. Default false. */
  hideWeek?: boolean;
  /** Show the All button (after Year). Default false. */
  showAll?: boolean;
  /** Lower bound for "All" preset. Default 2020-01-01. */
  allFrom?: string;
}

interface DatePickerButtonProps {
  value: string;
  onChange: (iso: string) => void;
  placeholder?: string;
}

const DatePickerButton = ({ value, onChange, placeholder = "Pick date" }: DatePickerButtonProps) => {
  const selected = value ? fromIso(value) : undefined;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "h-9 w-[150px] justify-start gap-2 font-mono text-xs",
            !selected && "text-muted-foreground",
          )}
        >
          <CalendarIcon className="h-3.5 w-3.5 shrink-0" />
          {selected ? fmtDateOnly(value) : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 pointer-events-auto" align="start">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(d) => d && onChange(iso(d))}
          initialFocus
          weekStartsOn={0}
          className={cn("p-3 pointer-events-auto")}
        />
      </PopoverContent>
    </Popover>
  );
};

const shiftRange = (
  preset: DatePreset,
  from: string,
  to: string,
  direction: -1 | 1,
): { from: string; to: string } => {
  const anchorFrom = fromIso(from);
  switch (preset) {
    case "day": {
      const d = direction > 0 ? addDays(anchorFrom, 1) : subDays(anchorFrom, 1);
      return { from: iso(d), to: iso(d) };
    }
    case "week": {
      const ref = direction > 0 ? addWeeks(anchorFrom, 1) : subWeeks(anchorFrom, 1);
      return presetRange("week", ref);
    }
    case "month": {
      const ref = direction > 0 ? addMonths(anchorFrom, 1) : subMonths(anchorFrom, 1);
      return presetRange("month", ref);
    }
    case "year": {
      const ref = direction > 0 ? addYears(anchorFrom, 1) : subYears(anchorFrom, 1);
      return presetRange("year", ref);
    }
    case "all":
      // "All" is a single fixed span — prev/next don't shift it.
      return { from, to };
    case "custom":
    default: {
      // Shift both endpoints by (range length + 1) days.
      const span = Math.max(1, differenceInCalendarDays(fromIso(to), anchorFrom) + 1);
      const delta = direction * span;
      return { from: iso(addDays(anchorFrom, delta)), to: iso(addDays(fromIso(to), delta)) };
    }
  }
};

export const DateRangePresets = ({
  preset, from, to, onChange, className,
  hideNav = false, hideWeek = false, showAll = false, allFrom = DEFAULT_ALL_FROM,
}: DateRangePresetsProps) => {
  const setPreset = (p: DatePreset) => {
    if (p === "custom") {
      onChange({ preset: p, from, to });
    } else if (p === "all") {
      onChange({ preset: "all", from: allFrom, to: iso(new Date()) });
    } else {
      const r = presetRange(p);
      onChange({ preset: p, from: r.from, to: r.to });
    }
  };
  const shift = (dir: -1 | 1) => {
    if (preset === "all") return; // no-op for All
    const r = shiftRange(preset, from, to, dir);
    onChange({ preset, from: r.from, to: r.to });
  };
  const visiblePresets = (Object.keys(PRESET_LABELS) as Array<keyof typeof PRESET_LABELS>)
    .filter((p) => !(hideWeek && p === "week"));
  return (
    <div className={`flex items-center gap-2 flex-wrap ${className ?? ""}`}>
      {!hideNav && (
        <Button
          variant="outline" size="icon" className="h-9 w-9"
          onClick={() => shift(-1)} aria-label="Previous period"
          disabled={preset === "all"}
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>
      )}
      <div className="flex gap-1">
        {visiblePresets.map((p) => (
          <Button
            key={p}
            size="sm"
            variant={preset === p ? "default" : "outline"}
            onClick={() => setPreset(p)}
            className="h-9"
          >
            {PRESET_LABELS[p]}
          </Button>
        ))}
        {showAll && (
          <Button
            size="sm"
            variant={preset === "all" ? "default" : "outline"}
            onClick={() => setPreset("all")}
            className="h-9"
          >
            All
          </Button>
        )}
        <Button
          size="sm"
          variant={preset === "custom" ? "default" : "outline"}
          onClick={() => setPreset("custom")}
          className="h-9"
        >
          Custom
        </Button>
      </div>
      {!hideNav && (
        <Button
          variant="outline" size="icon" className="h-9 w-9"
          onClick={() => shift(1)} aria-label="Next period"
          disabled={preset === "all"}
        >
          <ChevronRight className="w-4 h-4" />
        </Button>
      )}
      {preset === "custom" && (
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground">From</Label>
          <DatePickerButton
            value={from}
            onChange={(v) => onChange({ preset: "custom", from: v, to })}
          />
          <Label className="text-xs text-muted-foreground">To</Label>
          <DatePickerButton
            value={to}
            onChange={(v) => onChange({ preset: "custom", from, to: v })}
          />
        </div>
      )}
    </div>
  );
};
