import { useState, useMemo, lazy, Suspense } from "react";
import { useSessionState } from "@/hooks/use-session-state";
import { usePlayers, useTransactions, useExpenses, usePlayerGroups } from "@/hooks/use-casino-data";
import { useAuth } from "@/lib/auth-context";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table2, Users, Receipt, Landmark, UsersRound, ArrowUp, ArrowDown, ArrowUpDown,
  Coins, CalendarDays, Joystick, CreditCard, Printer, Check, BarChart3,
} from "lucide-react";
import MissChips from "@/pages/MissChips";
import Expenses from "@/pages/finances/FinancesExpensesPage";
import SlotsHistoryReport from "@/components/reports/SlotsHistoryReport";
import CashlessReport from "@/components/reports/CashlessReport";
import { PageShell } from "@/components/layout/PageShell";
import { presetRange, type DatePreset } from "@/components/ui/date-range-presets";
import { useMoneyMode, MoneyModeProvider, useFormatMoney } from "@/components/ui/data-table-toolbar";
import { fmtDate, fmtDateTime } from "@/lib/format-date";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { businessDayHourUTC } from "@/lib/business-day";
import ReprintShiftDialog from "@/components/cage/ReprintShiftDialog";
import { toast } from "sonner";
import {
  DataTable, DTHead, DTBody, DTRow, DTHeader, DTCell,
} from "@/components/ui/data-table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";


const TableResultsPage = lazy(() => import("@/pages/TableResults"));

// ----------- Sortable column helper -----------
type SortDir = "asc" | "desc";
type SortState = { key: string; dir: SortDir };

function useSorted<T extends Record<string, any>>(items: T[], initial: SortState) {
  const [sort, setSort] = useState<SortState>(initial);
  const sorted = useMemo(() => {
    const arr = [...items];
    arr.sort((a, b) => {
      const va = a[sort.key]; const vb = b[sort.key];
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === "number" && typeof vb === "number") return sort.dir === "asc" ? va - vb : vb - va;
      const sa = String(va); const sb = String(vb);
      return sort.dir === "asc" ? sa.localeCompare(sb) : sb.localeCompare(sa);
    });
    return arr;
  }, [items, sort]);
  const toggle = (key: string) => setSort(s => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }));
  return { sorted, sort, toggle };
}

/** Sortable DTHeader wrapper — single visual style for ALL Reports tables. */
const SortHeader = ({
  label, k, sort, toggle, type = "text",
}: { label: string; k: string; sort: SortState; toggle: (k: string) => void; type?: React.ComponentProps<typeof DTHeader>["type"] }) => {
  const active = sort.key === k;
  const Icon = !active ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <DTHeader type={type} className="cursor-pointer select-none hover:text-foreground" onClick={() => toggle(k)}>
      <span className="inline-flex items-center gap-1">
        {label}
        <Icon className={`w-3 h-3 ${active ? "text-foreground" : "opacity-40"}`} />
      </span>
    </DTHeader>
  );
};

// Hook: fetch all shifts
const useShifts = () => {
  const { casinoId } = useAuth();
  return useQuery({
    queryKey: ["shifts", casinoId],
    queryFn: async () => {
      if (!casinoId) return [];
      const { data, error } = await supabase.from("shifts").select("*").eq("casino_id", casinoId).order("opened_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!casinoId,
  });
};

const toIsoDate = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

const Reports = () => {
  const now = new Date();
  const monthStart = toIsoDate(new Date(now.getFullYear(), now.getMonth(), 1));
  const today = toIsoDate(now);
  const [from, setFrom] = useSessionState<string>("from", monthStart);
  const [to, setTo] = useSessionState<string>("to", today);
  const [preset, setPreset] = useSessionState<DatePreset>("preset", "custom");
  const initialTab = (typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("tab")
    : null) || "daily";
  const [mode, MoneyToggle] = useMoneyMode("reports-global");

  const handleMonthChange = (year: number, month: number) => {
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0);
    setPreset("custom");
    setFrom(toIsoDate(start));
    setTo(toIsoDate(end));
  };

  const fromDate = new Date(from + "T00:00:00");
  const monthPickerYear = fromDate.getFullYear();
  const monthPickerMonth = fromDate.getMonth() + 1;

  const YEARS = useMemo(() => {
    const y = new Date().getFullYear();
    return Array.from({ length: 5 }, (_, i) => y - 2 + i);
  }, []);

  const applyPreset = (p: DatePreset) => {
    if (p === "custom") {
      setPreset("custom");
      return;
    }
    let r = presetRange(p);
    if (p === "month") {
      const start = new Date(monthPickerYear, monthPickerMonth - 1, 1);
      const end = new Date(monthPickerYear, monthPickerMonth, 0);
      r = { from: toIsoDate(start), to: toIsoDate(end) };
    } else if (p === "year") {
      const start = new Date(monthPickerYear, 0, 1);
      const end = new Date(monthPickerYear, 11, 31);
      r = { from: toIsoDate(start), to: toIsoDate(end) };
    }
    setPreset(p);
    setFrom(r.from);
    setTo(r.to);
  };

  return (
    <PageShell>
      <div className="cms-panel p-3 mb-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={preset} onValueChange={(v) => applyPreset(v as DatePreset)}>
            <SelectTrigger className="w-[110px] h-9">
              <SelectValue placeholder="Period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="day">Day</SelectItem>
              <SelectItem value="week">Week</SelectItem>
              <SelectItem value="month">Month</SelectItem>
              <SelectItem value="year">Year</SelectItem>
              
              <SelectItem value="custom">Custom</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={String(monthPickerMonth)}
            onValueChange={(v) => handleMonthChange(monthPickerYear, Number(v))}
          >
            <SelectTrigger className="w-[140px] h-9">
              <SelectValue placeholder="Month" />
            </SelectTrigger>
            <SelectContent>
              {MONTHS.map((name, i) => (
                <SelectItem key={i + 1} value={String(i + 1)}>{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={String(monthPickerYear)}
            onValueChange={(v) => handleMonthChange(Number(v), monthPickerMonth)}
          >
            <SelectTrigger className="w-[100px] h-9">
              <SelectValue placeholder="Year" />
            </SelectTrigger>
            <SelectContent>
              {YEARS.map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {preset === "custom" && (
            <>
              <Input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="w-[150px] h-9"
              />
              <Input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="w-[150px] h-9"
              />
            </>
          )}
        </div>
        <MoneyToggle />
      </div>

      <MoneyModeProvider value={mode}>
      <Tabs defaultValue={initialTab} className="space-y-3">
        <TabsList className="flex-wrap">
          <TabsTrigger value="daily" className="gap-1 text-xs"><CalendarDays className="w-3.5 h-3.5" /> Daily Balance</TabsTrigger>
          <TabsTrigger value="total" className="gap-1 text-xs"><BarChart3 className="w-3.5 h-3.5" /> Total</TabsTrigger>
          <TabsTrigger value="shifts" className="gap-1 text-xs"><Landmark className="w-3.5 h-3.5" /> Shifts</TabsTrigger>
          <TabsTrigger value="live" className="gap-1 text-xs"><Landmark className="w-3.5 h-3.5" /> Live Game</TabsTrigger>
          <TabsTrigger value="slots" className="gap-1 text-xs"><Joystick className="w-3.5 h-3.5" /> Slots</TabsTrigger>
          <TabsTrigger value="tables" className="gap-1 text-xs"><Table2 className="w-3.5 h-3.5" /> Tables</TabsTrigger>
          <TabsTrigger value="players" className="gap-1 text-xs"><Users className="w-3.5 h-3.5" /> Players</TabsTrigger>
          <TabsTrigger value="groups" className="gap-1 text-xs"><UsersRound className="w-3.5 h-3.5" /> Groups</TabsTrigger>
          <TabsTrigger value="expenses" className="gap-1 text-xs"><Receipt className="w-3.5 h-3.5" /> Expenses</TabsTrigger>
          <TabsTrigger value="cashless" className="gap-1 text-xs"><CreditCard className="w-3.5 h-3.5" /> Cashless</TabsTrigger>
          <TabsTrigger value="miss-chips" className="gap-1 text-xs"><Coins className="w-3.5 h-3.5" /> Miss Chips</TabsTrigger>
        </TabsList>

        <TabsContent value="daily"><DailyReport from={from} to={to} /></TabsContent>
        <TabsContent value="total"><TotalReport from={from} to={to} /></TabsContent>
        <TabsContent value="shifts"><ShiftReport from={from} to={to} /></TabsContent>
        <TabsContent value="live"><LiveGameReport from={from} to={to} /></TabsContent>
        <TabsContent value="slots"><SlotsHistoryReport from={from} to={to} embedded /></TabsContent>
        <TabsContent value="tables">
          <Suspense fallback={<div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>}>
            <TableResultsPage embedded embeddedFrom={from} embeddedTo={to} />
          </Suspense>
        </TabsContent>
        <TabsContent value="players"><PlayerReport from={from} to={to} /></TabsContent>
        <TabsContent value="groups"><GroupReport from={from} to={to} /></TabsContent>
        <TabsContent value="expenses"><Expenses embedded embeddedFrom={from} embeddedTo={to} /></TabsContent>
        <TabsContent value="cashless"><CashlessReport from={from} to={to} embedded /></TabsContent>
        <TabsContent value="miss-chips"><MissChips embedded embeddedFrom={from} embeddedTo={to} /></TabsContent>
      </Tabs>
      </MoneyModeProvider>
    </PageShell>
  );
};

const signCls = (n: number) => n > 0 ? "cms-amount-positive" : n < 0 ? "cms-amount-negative" : "text-card-foreground";

// =================== SHIFT REPORT ===================
const ShiftReport = ({ from, to }: { from: string; to: string }) => {
  const fmt = useFormatMoney();
  const { data: shifts = [] } = useShifts();
  const { data: expenses = [] } = useExpenses();

  const filtered = useMemo(() => shifts.filter(s => {
    const d = s.opened_at.split("T")[0];
    return d >= from && d <= to;
  }), [shifts, from, to]);

  const shiftData = useMemo(() => filtered.map(s => {
    const sExp = expenses.filter((e: any) => e.shift_id === s.id && e.approved);
    const expTotal = sExp.reduce((sum: number, e: any) => sum + Number(e.amount), 0);
    const openTotals = (s.opening_float as any)?.totals || {};
    const closeTotals = (s.closing_count as any)?.totals || {};
    const openingCashOnly = Math.max(Number(openTotals.total_tzs || 0) - Number(openTotals.chips_tzs || 0), 0);
    const hasClosing = s.status === "closed" && (s.closing_count != null);
    const closingCashOnly = hasClosing
      ? Number(closeTotals.total_tzs || 0) - Number(closeTotals.chips_tzs || 0)
      : null;
    const cashChange = closingCashOnly != null ? closingCashOnly - openingCashOnly : null;
    const tablesResult = Number((s as any).shift_result || 0);
    const slotsResult = 0;
    const result = tablesResult + slotsResult;
    const missTotal = Number((s as any).miss_total || 0);
    const totalCash = result - missTotal - expTotal;
    const balance = cashChange != null ? cashChange - totalCash : null;
    return {
      ...s,
      opened_date: s.opened_at.split("T")[0],
      expTotal, tablesResult, slotsResult, result, missTotal, totalCash,
      balance: balance ?? 0,
      balanceRaw: balance,
    };
  }), [filtered, expenses]);

  const { sorted, sort, toggle } = useSorted(shiftData, { key: "opened_date", dir: "desc" });

  const totals = useMemo(() => ({
    tables: shiftData.reduce((s, d) => s + d.tablesResult, 0),
    slots: shiftData.reduce((s, d) => s + d.slotsResult, 0),
    result: shiftData.reduce((s, d) => s + d.result, 0),
    expenses: shiftData.reduce((s, d) => s + d.expTotal, 0),
    miss: shiftData.reduce((s, d) => s + d.missTotal, 0),
    totalCash: shiftData.reduce((s, d) => s + d.totalCash, 0),
  }), [shiftData]);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
        {[
          { label: "Shifts", value: String(shiftData.length), cls: "text-card-foreground" },
          { label: "Tables", value: fmt(totals.tables), cls: signCls(totals.tables) },
          { label: "Slots", value: fmt(totals.slots), cls: signCls(totals.slots) },
          { label: "Result", value: fmt(totals.result), cls: signCls(totals.result) },
          { label: "Miss Chips", value: fmt(totals.miss), cls: "text-warning" },
          { label: "Total Cash", value: fmt(totals.totalCash), cls: signCls(totals.totalCash) },
        ].map(c => (
          <div key={c.label} className="cms-panel p-2">
            <p className="uppercase text-muted-foreground tracking-wider text-[10px]">{c.label}</p>
            <p className={`font-mono text-sm font-bold ${c.cls}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <DataTable>
        <DTHead>
          <DTRow>
            <SortHeader label="Date" k="opened_date" sort={sort} toggle={toggle} type="date" />
            <SortHeader label="Status" k="status" sort={sort} toggle={toggle} type="status" />
            <SortHeader label="Tables" k="tablesResult" sort={sort} toggle={toggle} type="money" />
            <SortHeader label="Slots" k="slotsResult" sort={sort} toggle={toggle} type="money" />
            <SortHeader label="Result" k="result" sort={sort} toggle={toggle} type="money" />
            <SortHeader label="Expenses" k="expTotal" sort={sort} toggle={toggle} type="money" />
            <SortHeader label="Miss Chips" k="missTotal" sort={sort} toggle={toggle} type="money" />
            <SortHeader label="Total Cash" k="totalCash" sort={sort} toggle={toggle} type="money" />
            <SortHeader label="Balance" k="balance" sort={sort} toggle={toggle} type="money" />
          </DTRow>
        </DTHead>
        <DTBody>
          {sorted.length === 0 ? (
            <DTRow><DTCell colSpan={9} className="text-center text-muted-foreground py-6">No shifts in range</DTCell></DTRow>
          ) : sorted.map(s => (
            <DTRow key={s.id}>
              <DTCell type="date">{fmtDate(s.opened_at)}</DTCell>
              <DTCell type="status">
                <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${s.status === "open" ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>
                  {s.status}
                </span>
              </DTCell>
              <DTCell type="money"><span className={signCls(s.tablesResult)}>{fmt(s.tablesResult)}</span></DTCell>
              <DTCell type="money" className="text-muted-foreground">{fmt(s.slotsResult)}</DTCell>
              <DTCell type="money"><span className={`font-bold ${signCls(s.result)}`}>{fmt(s.result)}</span></DTCell>
              <DTCell type="money" className="text-warning">{fmt(s.expTotal)}</DTCell>
              <DTCell type="money" className="text-warning">{fmt(s.missTotal)}</DTCell>
              <DTCell type="money"><span className={`font-bold ${signCls(s.totalCash)}`}>{fmt(s.totalCash)}</span></DTCell>
              <DTCell type="money">
                <span className={`font-bold ${s.balanceRaw == null ? "text-muted-foreground" : s.balanceRaw === 0 ? "text-success" : "text-destructive"}`}>
                  {s.balanceRaw != null ? `${s.balanceRaw >= 0 ? "+" : ""}${fmt(s.balanceRaw)}` : "—"}
                </span>
              </DTCell>
            </DTRow>
          ))}
        </DTBody>
      </DataTable>
    </div>
  );
};

// =================== LIVE GAME REPORT ===================
const LiveGameReport = ({ from, to }: { from: string; to: string }) => {
  const fmt = useFormatMoney();
  const { casinoId } = useAuth();
  const [reprintId, setReprintId] = useState<string | null>(null);

  const { data: shifts = [], isLoading } = useQuery({
    queryKey: ["reports-live", casinoId, from, to],
    queryFn: async () => {
      if (!casinoId || !from || !to) return [];
      const fromIso = businessDayHourUTC(from, 7);
      // exclusive end: +1 day at 07:00 EAT
      const toDate = new Date(to + "T00:00:00Z");
      toDate.setUTCDate(toDate.getUTCDate() + 1);
      const toIso = businessDayHourUTC(toDate.toISOString().slice(0, 10), 7);
      const { data, error } = await supabase
        .from("shifts")
        .select("id, opened_at, closed_at, cash_result, miss_total, tables_result, balance, notes")
        .eq("casino_id", casinoId)
        .eq("status", "closed")
        .gte("closed_at", fromIso)
        .lt("closed_at", toIso)
        .limit(1000);
      if (error) throw error;
      return data || [];
    },
    enabled: !!casinoId,
  });

  type K = "opened" | "closed" | "cash" | "miss" | "tables" | "balance";
  const [sort, setSort] = useState<{ key: K; dir: SortDir }>({ key: "closed", dir: "desc" });
  const toggle = (k: string) => setSort(s => s.key === k ? { key: k as K, dir: s.dir === "asc" ? "desc" : "asc" } : { key: k as K, dir: "desc" });

  const sorted = useMemo(() => {
    const getter: Record<K, (s: any) => any> = {
      opened: s => s.opened_at, closed: s => s.closed_at,
      cash: s => Number(s.cash_result || 0), miss: s => Number(s.miss_total || 0),
      tables: s => Number(s.tables_result || 0), balance: s => Number(s.balance || 0),
    };
    const g = getter[sort.key];
    return [...shifts].sort((a, b) => {
      const va = g(a), vb = g(b);
      if (typeof va === "number" && typeof vb === "number") return sort.dir === "asc" ? va - vb : vb - va;
      return sort.dir === "asc" ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
    });
  }, [shifts, sort]);

  return (
    <div className="space-y-3">
      <DataTable>
        <DTHead>
          <DTRow>
            <SortHeader label="Opened" k="opened" sort={sort as any} toggle={toggle} type="date" />
            <SortHeader label="Closed" k="closed" sort={sort as any} toggle={toggle} type="date" />
            <SortHeader label="Cash" k="cash" sort={sort as any} toggle={toggle} type="money" />
            <SortHeader label="Miss" k="miss" sort={sort as any} toggle={toggle} type="money" />
            <SortHeader label="Tables" k="tables" sort={sort as any} toggle={toggle} type="money" />
            <SortHeader label="Balance" k="balance" sort={sort as any} toggle={toggle} type="money" />
            <DTHeader type="actions" />
          </DTRow>
        </DTHead>
        <DTBody>
          {isLoading ? (
            <DTRow><DTCell colSpan={7} className="text-center text-muted-foreground py-6">Loading…</DTCell></DTRow>
          ) : sorted.length === 0 ? (
            <DTRow><DTCell colSpan={7} className="text-center text-muted-foreground py-6">No closings in range</DTCell></DTRow>
          ) : sorted.map((s: any) => {
            const cash = Number(s.cash_result || 0);
            const tables = Number(s.tables_result || 0);
            const balance = Number(s.balance || 0);
            const miss = Number(s.miss_total || 0);
            return (
              <DTRow key={s.id}>
                <DTCell type="date">{s.opened_at ? fmtDateTime(s.opened_at) : "—"}</DTCell>
                <DTCell type="date">{s.closed_at ? fmtDateTime(s.closed_at) : "—"}</DTCell>
                <DTCell type="money"><span className={signCls(cash)}>{fmt(cash)}</span></DTCell>
                <DTCell type="money" className="text-muted-foreground">{fmt(miss)}</DTCell>
                <DTCell type="money"><span className={`font-bold ${signCls(tables)}`}>{fmt(tables)}</span></DTCell>
                <DTCell type="money"><span className={signCls(balance)}>{fmt(balance)}</span></DTCell>
                <DTCell type="actions">
                  <Button size="sm" variant="outline" className="h-7 gap-1 text-[11px]" onClick={() => setReprintId(s.id)}>
                    <Printer className="w-3 h-3" /> Print
                  </Button>
                </DTCell>
              </DTRow>
            );
          })}
        </DTBody>
      </DataTable>
      {reprintId && casinoId && (
        <ReprintShiftDialog open onClose={() => setReprintId(null)} shiftId={reprintId} casinoId={casinoId} />
      )}
    </div>
  );
};

// =================== TOTAL REPORT (per business day rollup) ===================
const TotalReport = ({ from, to }: { from: string; to: string }) => {
  const fmt = useFormatMoney();
  const { casinoId, roles } = useAuth();
  const qc = useQueryClient();
  const canEditDrop = roles.includes("super_admin") || roles.includes("manager") ||
                      roles.includes("shift_manager") || roles.includes("finance_manager");

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["reports-total", casinoId, from, to],
    queryFn: async () => {
      if (!casinoId || !from || !to) return [];
      const fromIso = businessDayHourUTC(from, 7);
      const toDate = new Date(to + "T00:00:00Z");
      toDate.setUTCDate(toDate.getUTCDate() + 1);
      const toStr = toDate.toISOString().slice(0, 10);
      const toIso = businessDayHourUTC(toStr, 7);

      const [liveRes, slotsRes, expRes, dropRes] = await Promise.all([
        supabase.from("shifts").select("id, closed_at, tables_result")
          .eq("casino_id", casinoId).eq("status", "closed")
          .gte("closed_at", fromIso).lt("closed_at", toIso).limit(1000),
        supabase.from("cage_slots_shifts").select("id, business_date, status, slots_result, manual_drop_slots")
          .eq("casino_id", casinoId).eq("status", "closed")
          .gte("business_date", from).lt("business_date", toStr).limit(1000),
        supabase.from("expenses").select("amount, created_at")
          .eq("casino_id", casinoId)
          .gte("created_at", fromIso).lt("created_at", toIso).limit(10000),
        // Drop Tables = Σ peak-NEP from player_day_drop_cache per business day.
        // SAME source as Player Statistics / Dashboard / Tables — keeps every
        // screen in sync. Replaces the previous raw `Σ transactions(buy/in)`
        // which double-counted recycled buy-ins.
        supabase.from("player_day_drop_cache").select("business_date, peak")
          .eq("casino_id", casinoId)
          .gte("business_date", from).lt("business_date", toStr).limit(50000),
      ]);
      if (liveRes.error) throw liveRes.error;
      if (slotsRes.error) throw slotsRes.error;
      if (expRes.error) throw expRes.error;
      if (dropRes.error) throw dropRes.error;

      const eatDate = (iso: string) => {
        const d = new Date(iso);
        const hh = parseInt(d.toLocaleString("en-GB", { timeZone: "Africa/Dar_es_Salaam", hour: "2-digit", hour12: false }), 10);
        const tgt = hh < 7 ? new Date(d.getTime() - 86400_000) : d;
        return tgt.toLocaleDateString("en-CA", { timeZone: "Africa/Dar_es_Salaam" });
      };
      const map: Record<string, any> = {};
      const row = (d: string) => (map[d] ||= {
        date: d, dropTables: 0, tablesResult: 0, dropSlots: 0, slotsResult: 0, expenses: 0,
        slotsShiftIds: [] as string[],
      });
      (liveRes.data || []).forEach((s: any) => {
        if (!s.closed_at) return;
        const r = row(eatDate(s.closed_at));
        r.tablesResult += Number(s.tables_result || 0);
      });
      (slotsRes.data || []).forEach((s: any) => {
        const r = row(s.business_date);
        r.slotsResult += Number(s.slots_result || 0);
        r.dropSlots += Number(s.manual_drop_slots || 0);
        r.slotsShiftIds.push(s.id);
      });
      (expRes.data || []).forEach((e: any) => {
        const r = row(eatDate(e.created_at));
        r.expenses += Number(e.amount || 0);
      });
      (dropRes.data || []).forEach((t: any) => {
        if (!t.business_date) return;
        const r = row(t.business_date);
        r.dropTables += Number(t.peak || 0);
      });
      return Object.values(map);
    },
    enabled: !!casinoId,
  });

  type K = "date" | "dropTables" | "tablesResult" | "dropSlots" | "slotsResult" | "expenses" | "totalResults";
  const [sort, setSort] = useState<{ key: K; dir: SortDir }>({ key: "date", dir: "desc" });
  const toggle = (k: string) => setSort(s => s.key === k ? { key: k as K, dir: s.dir === "asc" ? "desc" : "asc" } : { key: k as K, dir: "desc" });

  const sorted = useMemo(() => {
    const arr = [...rows] as any[];
    arr.sort((a, b) => {
      const av = sort.key === "totalResults" ? a.tablesResult + a.slotsResult : a[sort.key];
      const bv = sort.key === "totalResults" ? b.tablesResult + b.slotsResult : b[sort.key];
      if (typeof av === "number" && typeof bv === "number") return sort.dir === "asc" ? av - bv : bv - av;
      return sort.dir === "asc" ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });
    return arr;
  }, [rows, sort]);

  const updateDropSlots = useMutation({
    mutationFn: async ({ shiftIds, value }: { shiftIds: string[]; value: number }) => {
      if (!shiftIds.length) throw new Error("No closed slots shift for this day yet");
      const [first, ...rest] = shiftIds;
      const r1 = await supabase.from("cage_slots_shifts").update({ manual_drop_slots: value } as any).eq("id", first);
      if (r1.error) throw r1.error;
      if (rest.length) {
        const r2 = await supabase.from("cage_slots_shifts").update({ manual_drop_slots: 0 } as any).in("id", rest);
        if (r2.error) throw r2.error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["reports-total"] }); toast.success("Drop Slots updated"); },
    onError: (e: any) => toast.error(e.message || "Failed to update"),
  });

  return (
    <DataTable>
      <DTHead>
        <DTRow>
          <SortHeader label="Business Day" k="date" sort={sort as any} toggle={toggle} type="date" />
          <SortHeader label="Drop Tables" k="dropTables" sort={sort as any} toggle={toggle} type="money" />
          <SortHeader label="Tables Result" k="tablesResult" sort={sort as any} toggle={toggle} type="money" />
          <SortHeader label="Drop Slots" k="dropSlots" sort={sort as any} toggle={toggle} type="money" />
          <SortHeader label="Slots Result" k="slotsResult" sort={sort as any} toggle={toggle} type="money" />
          <SortHeader label="Expenses" k="expenses" sort={sort as any} toggle={toggle} type="money" />
          <SortHeader label="Total Results" k="totalResults" sort={sort as any} toggle={toggle} type="money" />
        </DTRow>
      </DTHead>
      <DTBody>
        {isLoading ? (
          <DTRow><DTCell colSpan={7} className="text-center text-muted-foreground py-6">Loading…</DTCell></DTRow>
        ) : sorted.length === 0 ? (
          <DTRow><DTCell colSpan={7} className="text-center text-muted-foreground py-6">No closed shifts in range</DTCell></DTRow>
        ) : sorted.map((r: any) => {
          const totalResults = (r.tablesResult || 0) + (r.slotsResult || 0);
          const slotsShiftIds: string[] = Array.isArray(r.slotsShiftIds) ? r.slotsShiftIds : [];
          return (
            <DTRow key={r.date}>
              <DTCell type="date">{fmtDate(r.date)}</DTCell>
              <DTCell type="money" className="text-muted-foreground">{fmt(r.dropTables || 0)}</DTCell>
              <DTCell type="money"><span className={`font-semibold ${signCls(r.tablesResult || 0)}`}>{fmt(r.tablesResult || 0)}</span></DTCell>
              <DTCell type="money">
                <DropSlotsCell
                  value={r.dropSlots || 0}
                  canEdit={canEditDrop && slotsShiftIds.length > 0}
                  onSave={(v) => updateDropSlots.mutate({ shiftIds: slotsShiftIds, value: v })}
                />
              </DTCell>
              <DTCell type="money"><span className={`font-semibold ${signCls(r.slotsResult || 0)}`}>{fmt(r.slotsResult || 0)}</span></DTCell>
              <DTCell type="money" className="text-muted-foreground">{fmt(r.expenses || 0)}</DTCell>
              <DTCell type="money"><span className={`font-bold ${signCls(totalResults)}`}>{fmt(totalResults)}</span></DTCell>
            </DTRow>
          );
        })}
      </DTBody>
    </DataTable>
  );
};

const DropSlotsCell = ({ value, canEdit, onSave }: { value: number; canEdit: boolean; onSave: (v: number) => void }) => {
  const fmt = useFormatMoney();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  if (!canEdit) {
    return <span className="text-muted-foreground">{value ? fmt(value) : "·"}</span>;
  }
  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => { setDraft(String(value || "")); setEditing(true); }}
        className="hover:bg-muted/50 rounded px-1.5 py-0.5 -my-0.5 transition-colors"
      >
        {value ? fmt(value) : <span className="text-muted-foreground/50">+ add</span>}
      </button>
    );
  }
  const save = () => { onSave(Number(draft) || 0); setEditing(false); };
  return (
    <span className="inline-flex items-center gap-1">
      <Input
        type="number" value={draft} autoFocus
        onChange={(e) => setDraft(e.target.value)} onBlur={save}
        onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
        className="h-7 w-24 text-right font-mono text-xs"
      />
      <Check className="w-3 h-3 text-muted-foreground" />
    </span>
  );
};

// =================== PLAYER REPORT ===================
// Drop is peak-NEP per business day, summed across the range. Authoritative
// source: `compute_players_drop_split` RPC — same formula as Player
// Statistics, Tables and Dashboard. Cashout / expenses stay local sums.
const PlayerReport = ({ from, to }: { from: string; to: string }) => {
  const fmt = useFormatMoney();
  const { casinoId } = useAuth();
  const { data: players = [] } = usePlayers();
  const { data: transactions = [] } = useTransactions();
  const { data: expenses = [] } = useExpenses();

  const fromIso = useMemo(() => businessDayHourUTC(from, 7), [from]);
  const toIso = useMemo(() => {
    const d = new Date(to + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + 1);
    return businessDayHourUTC(d.toISOString().slice(0, 10), 7);
  }, [to]);

  const { data: dropByPlayer = {} } = useQuery({
    queryKey: ["reports-players-drop-split", casinoId, from, to],
    queryFn: async (): Promise<Record<string, number>> => {
      if (!casinoId || !from || !to) return {};
      const { data, error } = await supabase.rpc("compute_players_drop_split" as any, {
        _casino_id: casinoId, _from: fromIso, _to: toIso,
      });
      if (error) throw error;
      const rec: Record<string, number> = {};
      (data || []).forEach((r: any) => { if (r?.player_id) rec[r.player_id] = Number(r.drop_r) || 0; });
      return rec;
    },
    enabled: !!casinoId,
    staleTime: 30_000,
  });

  const playerData = useMemo(() => {
    const filteredTx = transactions.filter(t => {
      const d = t.created_at.split("T")[0];
      return d >= from && d <= to;
    });
    const filteredExp = expenses.filter((e: any) => {
      const d = e.created_at.split("T")[0];
      return d >= from && d <= to && e.approved;
    });
    return players.filter(p => p.status === "active").map(p => {
      const pTx = filteredTx.filter(t => t.player_id === p.id);
      const pExp = filteredExp.filter((e: any) => e.player_id === p.id);
      const drop = dropByPlayer[p.id] || 0;
      const cashout = pTx.filter(t => (t.type === "cashout" || t.type === "out")).reduce((s, t) => s + Number(t.amount), 0);
      const expTotal = pExp.reduce((s: number, e: any) => s + Number(e.amount), 0);
      const result = cashout - drop;
      const realResult = result - expTotal;
      return {
        ...p, player_name: `${p.first_name} ${p.last_name}`,
        drop, cashout, expTotal, result, realResult, txCount: pTx.length,
      };
    }).filter(p => p.txCount > 0 || (dropByPlayer[p.id] || 0) > 0);
  }, [players, transactions, expenses, from, to, dropByPlayer]);

  const { sorted, sort, toggle } = useSorted(playerData, { key: "drop", dir: "desc" });
  const totals = useMemo(() => sorted.reduce(
    (a, p) => ({
      drop: a.drop + p.drop, cashout: a.cashout + p.cashout, result: a.result + p.result,
      expTotal: a.expTotal + p.expTotal, realResult: a.realResult + p.realResult, txCount: a.txCount + p.txCount,
    }),
    { drop: 0, cashout: 0, result: 0, expTotal: 0, realResult: 0, txCount: 0 },
  ), [sorted]);

  return (
    <DataTable>
      <DTHead>
        <DTRow>
          <SortHeader label="Player" k="player_name" sort={sort} toggle={toggle} type="name" />
          <SortHeader label="Drop" k="drop" sort={sort} toggle={toggle} type="money" />
          <SortHeader label="Cashout" k="cashout" sort={sort} toggle={toggle} type="money" />
          <SortHeader label="Result" k="result" sort={sort} toggle={toggle} type="money" />
          <SortHeader label="Expenses" k="expTotal" sort={sort} toggle={toggle} type="money" />
          <SortHeader label="Real Result" k="realResult" sort={sort} toggle={toggle} type="money" />
          <SortHeader label="Txns" k="txCount" sort={sort} toggle={toggle} type="int" />
        </DTRow>
      </DTHead>
      <DTBody>
        {sorted.length === 0 ? (
          <DTRow><DTCell colSpan={7} className="text-center text-muted-foreground py-6">No player data</DTCell></DTRow>
        ) : sorted.map(p => (
          <DTRow key={p.id}>
            <DTCell type="name">
              <span className="font-medium">{p.first_name} {p.last_name}</span>
              {p.nickname && <span className="text-xs text-muted-foreground ml-1">({p.nickname})</span>}
            </DTCell>
            <DTCell type="money">{fmt(p.drop)}</DTCell>
            <DTCell type="money">{fmt(p.cashout)}</DTCell>
            <DTCell type="money"><span className={`font-bold ${signCls(p.result)}`}>{p.result >= 0 ? "+" : ""}{fmt(p.result)}</span></DTCell>
            <DTCell type="money" className="text-warning">{fmt(p.expTotal)}</DTCell>
            <DTCell type="money"><span className={`font-bold ${signCls(p.realResult)}`}>{p.realResult >= 0 ? "+" : ""}{fmt(p.realResult)}</span></DTCell>
            <DTCell type="int" className="text-muted-foreground">{p.txCount}</DTCell>
          </DTRow>
        ))}
        {sorted.length > 0 && (
          <DTRow className="border-t-2 border-primary/30 bg-muted/30 font-bold">
            <DTCell type="name" className="uppercase">Totals ({sorted.length})</DTCell>
            <DTCell type="money">{fmt(totals.drop)}</DTCell>
            <DTCell type="money">{fmt(totals.cashout)}</DTCell>
            <DTCell type="money"><span className={signCls(totals.result)}>{fmt(totals.result)}</span></DTCell>
            <DTCell type="money" className="text-warning">{fmt(totals.expTotal)}</DTCell>
            <DTCell type="money"><span className={signCls(totals.realResult)}>{fmt(totals.realResult)}</span></DTCell>
            <DTCell type="int" className="text-muted-foreground">{totals.txCount}</DTCell>
          </DTRow>
        )}
      </DTBody>
    </DataTable>
  );
};


// =================== GROUP REPORT ===================
const GroupReport = ({ from, to }: { from: string; to: string }) => {
  const fmt = useFormatMoney();
  const { data: groups = [] } = usePlayerGroups();
  const { data: transactions = [] } = useTransactions();
  const { data: expenses = [] } = useExpenses();

  const groupData = useMemo(() => {
    const filteredTx = transactions.filter(t => {
      const d = t.created_at.split("T")[0];
      return d >= from && d <= to;
    });
    const filteredExp = expenses.filter((e: any) => {
      const d = e.created_at.split("T")[0];
      return d >= from && d <= to && e.approved;
    });
    return groups.map((g: any) => {
      const memberIds = (g.group_members || [])
        .filter((m: any) => {
          const joined = m.joined_at.split("T")[0];
          const left = m.left_at ? m.left_at.split("T")[0] : "9999-12-31";
          return joined <= to && left >= from;
        })
        .map((m: any) => m.player_id);
      const gTx = filteredTx.filter(t => memberIds.includes(t.player_id));
      const gExp = filteredExp.filter((e: any) => e.player_id && memberIds.includes(e.player_id));
      const drop = gTx.filter(t => (t.type === "buy" || t.type === "in")).reduce((s, t) => s + Number(t.amount), 0);
      const cashout = gTx.filter(t => (t.type === "cashout" || t.type === "out")).reduce((s, t) => s + Number(t.amount), 0);
      const expTotal = gExp.reduce((s: number, e: any) => s + Number(e.amount), 0);
      return { id: g.id, name: g.name, members: memberIds.length, drop, cashout, result: cashout - drop, realResult: cashout - drop - expTotal, expTotal };
    }).filter(g => g.members > 0);
  }, [groups, transactions, expenses, from, to]);

  const { sorted, sort, toggle } = useSorted(groupData, { key: "drop", dir: "desc" });

  return (
    <DataTable>
      <DTHead>
        <DTRow>
          <SortHeader label="Group" k="name" sort={sort} toggle={toggle} type="name" />
          <SortHeader label="Members" k="members" sort={sort} toggle={toggle} type="int" />
          <SortHeader label="Drop" k="drop" sort={sort} toggle={toggle} type="money" />
          <SortHeader label="Cashout" k="cashout" sort={sort} toggle={toggle} type="money" />
          <SortHeader label="Result" k="result" sort={sort} toggle={toggle} type="money" />
          <SortHeader label="Expenses" k="expTotal" sort={sort} toggle={toggle} type="money" />
          <SortHeader label="Real Result" k="realResult" sort={sort} toggle={toggle} type="money" />
        </DTRow>
      </DTHead>
      <DTBody>
        {sorted.length === 0 ? (
          <DTRow><DTCell colSpan={7} className="text-center text-muted-foreground py-6">No group data</DTCell></DTRow>
        ) : sorted.map((g) => (
          <DTRow key={g.id}>
            <DTCell type="name" className="font-medium">{g.name}</DTCell>
            <DTCell type="int" className="text-muted-foreground">{g.members}</DTCell>
            <DTCell type="money">{fmt(g.drop)}</DTCell>
            <DTCell type="money">{fmt(g.cashout)}</DTCell>
            <DTCell type="money"><span className={`font-bold ${signCls(g.result)}`}>{g.result >= 0 ? "+" : ""}{fmt(g.result)}</span></DTCell>
            <DTCell type="money" className="text-warning">{fmt(g.expTotal)}</DTCell>
            <DTCell type="money"><span className={`font-bold ${signCls(g.realResult)}`}>{g.realResult >= 0 ? "+" : ""}{fmt(g.realResult)}</span></DTCell>
          </DTRow>
        ))}
      </DTBody>
    </DataTable>
  );
};

// =================== DAILY DIFF REPORT ===================
const DailyReport = ({ from, to }: { from: string; to: string }) => {
  const fmt = useFormatMoney();
  const { casinoId } = useAuth();

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["daily-diff", casinoId, from, to],
    queryFn: async () => {
      if (!casinoId || !from || !to || from > to) return [] as any[];
      const { data, error } = await (supabase as any).rpc("compute_daily_diff", {
        _casino_id: casinoId, _from: from, _to: to,
      });
      if (error) throw error;
      return (data || []).map((r: any) => {
        const drop = Number(r.drop_r || 0);
        const result = Number(r.result || 0);
        const playerResult = Number(r.player_result || 0);
        const miss = Number(r.miss || 0);
        return {
          date: r.business_date,
          drop,
          result,
          hold: drop > 0 ? (result / drop) * 100 : null,
          playerResult,
          miss,
          balance: result + playerResult - miss,
        };
      });
    },
    enabled: !!casinoId,
    staleTime: 30_000,
  });

  const { sorted, sort, toggle } = useSorted(rows, { key: "date", dir: "desc" });

  const totals = useMemo(() => {
    const t = rows.reduce(
      (a, r) => ({
        drop: a.drop + r.drop,
        result: a.result + r.result,
        playerResult: a.playerResult + r.playerResult,
        miss: a.miss + r.miss,
        balance: a.balance + r.balance,
      }),
      { drop: 0, result: 0, playerResult: 0, miss: 0, balance: 0 },
    );
    return { ...t, hold: t.drop > 0 ? (t.result / t.drop) * 100 : null };
  }, [rows]);

  const fmtHold = (v: number | null) => v == null ? "—" : `${v.toFixed(1)}%`;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <div className="cms-panel p-2">
          <p className="uppercase text-muted-foreground tracking-wider text-[10px]">Days</p>
          <p className="font-mono text-sm font-bold text-card-foreground">{rows.length}</p>
        </div>
        {[
          { label: "Drop", value: fmt(totals.drop), cls: "text-card-foreground" },
          { label: "Table Result", value: fmt(totals.result), cls: signCls(totals.result) },
          { label: "Hold %", value: fmtHold(totals.hold), cls: "text-card-foreground" },
        ].map((c) => (
          <div key={c.label} className="cms-panel p-2">
            <p className="uppercase text-muted-foreground tracking-wider text-[10px]">{c.label}</p>
            <p className={`font-mono text-sm font-bold ${c.cls}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <DataTable>
        <DTHead>
          <DTRow>
            <SortHeader label="Date" k="date" sort={sort} toggle={toggle} type="date" />
            <SortHeader label="Drop" k="drop" sort={sort} toggle={toggle} type="money" />
            <SortHeader label="Table Result" k="result" sort={sort} toggle={toggle} type="money" />
            <SortHeader label="Hold %" k="hold" sort={sort} toggle={toggle} type="money" />
            <SortHeader label="Player Result" k="playerResult" sort={sort} toggle={toggle} type="money" />
            <SortHeader label="Chip Difference" k="miss" sort={sort} toggle={toggle} type="money" />
            <SortHeader label="Gaming Balance" k="balance" sort={sort} toggle={toggle} type="money" />
          </DTRow>
        </DTHead>
        <DTBody>
          {isLoading ? (
            <DTRow><DTCell colSpan={7} className="text-center text-muted-foreground py-6">Loading…</DTCell></DTRow>
          ) : sorted.length === 0 ? (
            <DTRow><DTCell colSpan={7} className="text-center text-muted-foreground py-6">No data in range</DTCell></DTRow>
          ) : sorted.map((r) => (
            <DTRow key={r.date}>
              <DTCell type="date">{fmtDate(r.date)}</DTCell>
              <DTCell type="money">{fmt(r.drop)}</DTCell>
              <DTCell type="money"><span className={`font-bold ${signCls(r.result)}`}>{fmt(r.result)}</span></DTCell>
              <DTCell type="money"><span className="text-muted-foreground">{fmtHold(r.hold)}</span></DTCell>
              <DTCell type="money"><span className={signCls(r.playerResult)}>{fmt(r.playerResult)}</span></DTCell>
              <DTCell type="money"><span className={signCls(r.miss)}>{fmt(r.miss)}</span></DTCell>
              <DTCell type="money"><span className={`font-bold ${signCls(r.balance)}`}>{fmt(r.balance)}</span></DTCell>
            </DTRow>
          ))}
          {sorted.length > 0 && (
            <DTRow className="border-t-2 border-primary/40 bg-primary/10 font-bold text-[120%]">
              <DTCell type="date" className="uppercase text-primary">Total</DTCell>
              <DTCell type="money">{fmt(totals.drop)}</DTCell>
              <DTCell type="money"><span className={signCls(totals.result)}>{fmt(totals.result)}</span></DTCell>
              <DTCell type="money">{fmtHold(totals.hold)}</DTCell>
              <DTCell type="money"><span className={signCls(totals.playerResult)}>{fmt(totals.playerResult)}</span></DTCell>
              <DTCell type="money"><span className={signCls(totals.miss)}>{fmt(totals.miss)}</span></DTCell>
              <DTCell type="money"><span className={signCls(totals.balance)}>{fmt(totals.balance)}</span></DTCell>
            </DTRow>
          )}
        </DTBody>
      </DataTable>
    </div>
  );
};

export default Reports;
