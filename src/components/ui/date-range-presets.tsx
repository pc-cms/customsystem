import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtDateOnly } from "@/lib/format-date";

export type DatePreset = "day" | "week" | "month" | "year" | "all" | "custom";

const todayMinus = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
};

export const presetRange = (p: DatePreset): { from: string; to: string } => {
  const today = todayMinus(0);
  switch (p) {
    case "day": return { from: today, to: today };
    case "week": return { from: todayMinus(6), to: today };
    case "month": return { from: todayMinus(29), to: today };
    case "year": return { from: todayMinus(364), to: today };
    case "all": return { from: "1970-01-01", to: today };
    default: return { from: todayMinus(29), to: today };
  }
};

const PRESET_LABELS: Record<Exclude<DatePreset, "custom">, string> = {
  day: "Day", week: "Week", month: "Month", year: "Year", all: "All",
};

const isoToDate = (iso: string): Date | undefined => {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return undefined;
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? undefined : d;
};

const dateToIso = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

interface DateRangePresetsProps {
  preset: DatePreset;
  from: string;
  to: string;
  onChange: (next: { preset: DatePreset; from: string; to: string }) => void;
  className?: string;
}

interface DatePickerButtonProps {
  value: string;
  onChange: (iso: string) => void;
  placeholder?: string;
}

const DatePickerButton = ({ value, onChange, placeholder = "Pick date" }: DatePickerButtonProps) => {
  const selected = isoToDate(value);
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
          onSelect={(d) => d && onChange(dateToIso(d))}
          initialFocus
          className={cn("p-3 pointer-events-auto")}
        />
      </PopoverContent>
    </Popover>
  );
};

export const DateRangePresets = ({ preset, from, to, onChange, className }: DateRangePresetsProps) => {
  const setPreset = (p: DatePreset) => {
    if (p === "custom") {
      onChange({ preset: p, from, to });
    } else {
      const r = presetRange(p);
      onChange({ preset: p, from: r.from, to: r.to });
    }
  };
  return (
    <div className={`flex items-center gap-2 flex-wrap ${className ?? ""}`}>
      <div className="flex gap-1">
        {(Object.keys(PRESET_LABELS) as Array<keyof typeof PRESET_LABELS>).map((p) => (
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
        <Button
          size="sm"
          variant={preset === "custom" ? "default" : "outline"}
          onClick={() => setPreset("custom")}
          className="h-9"
        >
          Custom
        </Button>
      </div>
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
