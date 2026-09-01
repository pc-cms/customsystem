/**
 * Compact period selector used by the Office / Budget toolbar.
 * A plain month dropdown — no popover, no custom range (Stage 2B, 2026-09-01).
 */
import { CalendarRange } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

/** 24 months back + 3 months ahead, newest first. */
const MONTH_OPTIONS: { key: string; year: number; month: number; label: string }[] = (() => {
  const now = new Date();
  const out: { key: string; year: number; month: number; label: string }[] = [];
  for (let i = 3; i >= -24; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1));
    const year = d.getUTCFullYear();
    const month = d.getUTCMonth() + 1;
    out.push({ key: `${year}-${pad(month)}`, year, month, label: `${MONTH_NAMES[month - 1]} ${year}` });
  }
  return out;
})();

export function PeriodPicker({
  value,
  onChange,
}: {
  value: OfficePeriod;
  onChange: (p: OfficePeriod) => void;
}) {
  const currentKey = `${value.year}-${pad(value.month)}`;
  const inList = MONTH_OPTIONS.some((o) => o.key === currentKey);
  // Legacy sessions may hold a custom range — show its label until a month is picked.
  const fallbackLabel =
    value.mode === "custom"
      ? `${fmtDateOnly(value.from)} — ${fmtDateOnly(value.to)}`
      : `${MONTH_NAMES[value.month - 1]} ${value.year}`;

  return (
    <Select
      value={value.mode === "month" && inList ? currentKey : ""}
      onValueChange={(key) => {
        const opt = MONTH_OPTIONS.find((o) => o.key === key);
        if (opt) onChange(monthPeriod(opt.year, opt.month));
      }}
    >
      <SelectTrigger className="h-8 w-auto min-w-[150px] shrink-0 gap-2 text-xs font-medium">
        <CalendarRange className="w-3.5 h-3.5 opacity-70" />
        <SelectValue placeholder={fallbackLabel} />
      </SelectTrigger>
      <SelectContent align="end">
        {value.mode === "month" && !inList && (
          <SelectItem value={currentKey}>{fallbackLabel}</SelectItem>
        )}
        {MONTH_OPTIONS.map((o) => (
          <SelectItem key={o.key} value={o.key}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
