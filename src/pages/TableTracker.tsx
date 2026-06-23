import { useEffect, useState, useCallback, useMemo } from "react";
import { useSessionState } from "@/hooks/use-session-state";
import { getBusinessDate, nowEAT } from "@/lib/business-day";
import { useEffectiveBusinessDate } from "@/hooks/use-business-day-closure";
import { useGamingTables, useTableTracker, useSetTableTrackerValue } from "@/hooks/use-casino-data";
import { Input } from "@/components/ui/input";
import { DateNavigator } from "@/components/ui/date-navigator";
import { formatCurrency, formatInputWithSpaces } from "@/lib/currency";

// Sign-aware variants for tracker (negative table results are valid)
const formatSignedInput = (value: string): string => {
  const neg = value.trim().startsWith("-");
  const body = formatInputWithSpaces(value);
  if (!body) return neg ? "-" : "";
  return (neg ? "-" : "") + body;
};
const parseSignedNumber = (str: string): number => {
  const s = str.replace(/\s/g, "").trim();
  if (s === "" || s === "-") return 0;
  const n = Number(s);
  return isNaN(n) ? 0 : n;
};
import { PageShell, PageSection } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Target, Lock, Hash, Coins } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { ChipCountPanel } from "@/components/tables/ChipCountPanel";
import { TableAnalyticsChart } from "@/components/tables/TableAnalyticsChart";
import { Button } from "@/components/ui/button";

// 19:00 → 05:00, 1-hour intervals
const generateSlots = () => {
  const slots: string[] = [];
  for (let h = 19; h <= 29; h++) { // 29 = 05:00 next day
    const hour = h % 24;
    slots.push(`${String(hour).padStart(2, "0")}:00`);
  }
  return slots;
};

const SLOTS = generateSlots();

const getCurrentSlot = () => {
  const now = nowEAT();
  const h = now.getHours();
  const m = Math.floor(now.getMinutes() / 30) * 30;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

interface TableTrackerProps { embedded?: boolean }
const TableTracker = ({ embedded = false }: TableTrackerProps) => {
  const { data: serverBusinessDate } = useEffectiveBusinessDate();
  const today = serverBusinessDate || getBusinessDate();
  const [date, setDate] = useSessionState<string>("date", today);
  const [mode, setMode] = useSessionState<"numbers" | "chips">("mode", "numbers");
  const { isManager } = useAuth();
  const { data: tables = [] } = useGamingTables();
  const { data: trackerData = [] } = useTableTracker(date);
  const setValue = useSetTableTrackerValue();

  // Include closed tables that still have tracker data for the selected date,
  // so a stool closed mid-shift doesn't disappear from Numbers/Final view.
  const tablesWithData = useMemo(() => new Set(trackerData.map(t => t.table_id)), [trackerData]);
  const openTables = tables.filter(t => t.status === "open" || tablesWithData.has(t.id));
  const isToday = date === today;
  const currentSlot = useMemo(() => getCurrentSlot(), []);
  const readOnly = !isToday && !isManager;

  useEffect(() => {
    if (!today) return;
    const marker = "cms:table-tracker:last-auto-business-day";
    try {
      const lastAutoDay = window.sessionStorage.getItem(marker);
      if (lastAutoDay === today) return;
      window.sessionStorage.setItem(marker, today);
      if (date !== today) setDate(today);
    } catch {
      if (date !== today) setDate(today);
    }
  }, [today, date, setDate]);

  const getVal = useCallback((tableId: string, slot: string) => {
    const entry = trackerData.find(t => t.table_id === tableId && t.time_slot === slot);
    return entry ? Number(entry.value) : null;
  }, [trackerData]);

  const handleSave = (tableId: string, slot: string, val: string) => {
    if (readOnly) return;
    const trimmed = val.trim();
    // Empty input = no value (skip save)
    if (trimmed === "" || trimmed === "-") return;
    const numVal = parseSignedNumber(val);
    if (isNaN(numVal)) return;
    const current = getVal(tableId, slot);
    if (current === numVal) return;
    setValue.mutate({ table_id: tableId, date, time_slot: slot, value: numVal });
  };

  const getSlotTotal = (slot: string) =>
    trackerData.filter(t => t.time_slot === slot).reduce((s, t) => s + Number(t.value), 0);

  const grandTotal = trackerData.reduce((s, t) => s + Number(t.value), 0);

  const focusCell = (ti: number, si: number) => {
    const id = `cell-${ti}-${si}`;
    setTimeout(() => document.getElementById(id)?.focus(), 10);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, tableIdx: number, slotIdx: number) => {
    if (e.key === "Enter" || (e.key === "Tab" && !e.shiftKey)) {
      e.preventDefault();
      (e.target as HTMLInputElement).blur();
      if (slotIdx + 1 < SLOTS.length) focusCell(tableIdx, slotIdx + 1);
      else if (tableIdx + 1 < openTables.length) focusCell(tableIdx + 1, 0);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      if (slotIdx + 1 < SLOTS.length) focusCell(tableIdx, slotIdx + 1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      if (slotIdx > 0) focusCell(tableIdx, slotIdx - 1);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (tableIdx + 1 < openTables.length) focusCell(tableIdx + 1, slotIdx);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (tableIdx > 0) focusCell(tableIdx - 1, slotIdx);
    }
  };

  const Wrapper: any = embedded ? "div" : PageShell;
  return (
    <Wrapper>
      {!embedded && (
        <PageHeader
          icon={Target}
          title="Table Check"
          subtitle={mode === "numbers" ? "Enter values · auto-saves on blur/Enter" : "Count chips on tables · save snapshot"}
          date={isManager ? false : date}
        >
          <div className="inline-flex rounded-md border border-border overflow-hidden h-9">
            <Button
              type="button"
              variant={mode === "numbers" ? "default" : "ghost"}
              size="sm"
              onClick={() => setMode("numbers")}
              className="rounded-none gap-1.5 h-9 px-3"
            >
              <Hash className="h-4 w-4" /> Numbers
            </Button>
            <Button
              type="button"
              variant={mode === "chips" ? "default" : "ghost"}
              size="sm"
              onClick={() => setMode("chips")}
              className="rounded-none gap-1.5 h-9 px-3"
            >
              <Coins className="h-4 w-4" /> Chips
            </Button>
          </div>
          {isManager ? (
            <DateNavigator
              value={date}
              onChange={(iso) => setDate(iso || today)}
              maxDate={nowEAT()}
            />

          ) : date !== today ? (
            <button
              type="button"
              onClick={() => setDate(today)}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-border text-xs font-mono text-muted-foreground hover:bg-muted"
              title="Return to today"
            >
              <Lock className="h-3.5 w-3.5" />
              Today
            </button>
          ) : null}
        </PageHeader>
      )}

      {embedded && (
        <div className="mb-2 inline-flex rounded-md border border-border overflow-hidden h-8">
          <Button type="button" variant={mode === "numbers" ? "default" : "ghost"} size="sm" onClick={() => setMode("numbers")} className="rounded-none gap-1.5 h-8 px-3">
            <Hash className="h-3.5 w-3.5" /> Numbers
          </Button>
          <Button type="button" variant={mode === "chips" ? "default" : "ghost"} size="sm" onClick={() => setMode("chips")} className="rounded-none gap-1.5 h-8 px-3">
            <Coins className="h-3.5 w-3.5" /> Chips
          </Button>
        </div>
      )}

      {mode === "chips" ? (
        <PageSection card={false}>
          <ChipCountPanel date={date} />
        </PageSection>
      ) : (
      <>

      <PageSection card={false}>
        <div className="rounded-md border border-border bg-card overflow-x-auto">
          <table className="border-collapse" style={{ minWidth: "100%" }}>
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground px-3 py-2 sticky left-0 bg-card z-10 min-w-[110px]">
                    Table
                  </th>
                  {SLOTS.map((slot) => {
                    const isActive = isToday && slot === currentSlot;
                    return (
                      <th
                        key={slot}
                        className={`text-center text-xs font-mono px-2 py-2 min-w-[130px] whitespace-nowrap ${
                          isActive
                            ? "bg-primary/20 text-primary font-bold"
                            : "text-muted-foreground"
                        }`}
                      >
                        {slot === "05:00" ? "Final" : slot}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {openTables.map((table, ti) => (
                  <tr
                    key={table.id}
                    className={`border-b border-border last:border-0 ${ti % 2 === 1 ? "bg-muted/10" : ""}`}
                  >
                    <td
                      className={`px-3 py-1 text-xs font-medium text-card-foreground sticky left-0 z-10 ${ti % 2 === 1 ? "bg-card/95" : "bg-card"}`}
                    >
                      {table.name}
                    </td>
                    {SLOTS.map((slot, si) => {
                      const val = getVal(table.id, slot);
                      const isActive = isToday && slot === currentSlot;
                      return (
                        <td key={slot} className={`px-1 py-0.5 ${isActive ? "bg-primary/5" : ""}`}>
                          <input
                            id={`cell-${ti}-${si}`}
                            type="text"
                            inputMode="numeric"
                            defaultValue={val !== null && val !== undefined ? formatSignedInput(String(val)) : ""}
                            key={`${table.id}-${slot}-${val}`}
                            readOnly={readOnly}
                            onChange={(e) => {
                              if (readOnly) return;
                              e.target.value = formatSignedInput(e.target.value);
                              const n = parseSignedNumber(e.target.value);
                              e.target.classList.remove("cms-amount-positive", "cms-amount-negative", "text-card-foreground");
                              if (n > 0) e.target.classList.add("cms-amount-positive");
                              else if (n < 0) e.target.classList.add("cms-amount-negative");
                              else e.target.classList.add("text-card-foreground");
                            }}
                            onBlur={(e) => handleSave(table.id, slot, e.target.value)}
                            onKeyDown={(e) => handleKeyDown(e, ti, si)}
                            className={`w-full h-9 text-center text-sm font-mono tabular-nums whitespace-nowrap bg-transparent border border-border rounded-md px-1 focus:border-primary focus:outline-none ${
                              val && val > 0 ? "cms-amount-positive" : val && val < 0 ? "cms-amount-negative" : "text-card-foreground"
                            } ${isActive ? "border-primary/30" : ""} ${readOnly ? "cursor-not-allowed opacity-70" : ""}`}
                            placeholder="·"
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
                <tr className="border-t-2 border-primary/30 bg-muted/30">
                  <td className="px-3 py-2 text-xs font-bold text-card-foreground uppercase sticky left-0 bg-muted/30 z-10">
                    Total
                  </td>
                  {SLOTS.map((slot) => {
                    const isActive = isToday && slot === currentSlot;
                    const tot = getSlotTotal(slot);
                    const colorClass = tot > 0 ? "cms-amount-positive" : tot < 0 ? "cms-amount-negative" : "text-card-foreground";
                    return (
                      <td
                        key={slot}
                        className={`px-2 py-2 text-center font-mono tabular-nums text-sm font-bold whitespace-nowrap ${colorClass} ${isActive ? "bg-primary/10" : ""}`}
                      >
                        {tot ? formatCurrency(tot) : "·"}
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
        </div>
        {openTables.length === 0 && (
          <p className="text-muted-foreground text-sm text-center py-8 mt-4">
            No open tables to track
          </p>
        )}
      </PageSection>

      <PageSection card title="Per-table result · 30-min slots (18:00 → 05:00)">
        <TableAnalyticsChart date={date} />
      </PageSection>
      </>
      )}
    </Wrapper>
  );
};

export default TableTracker;
