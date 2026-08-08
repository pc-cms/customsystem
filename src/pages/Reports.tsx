import { useState, useMemo, lazy, Suspense } from "react";
import { useSessionState } from "@/hooks/use-session-state";
import { useTransactions, useExpenses, usePlayerGroups } from "@/hooks/use-casino-data";
import { useAuth } from "@/lib/auth-context";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table2, Landmark, UsersRound, ArrowUp, ArrowDown, ArrowUpDown,
  Coins, Joystick, Printer, Check, BarChart3,
} from "lucide-react";

import MissChips from "@/pages/MissChips";
import SlotsHistoryReport from "@/components/reports/SlotsHistoryReport";
import { PageShell } from "@/components/layout/PageShell";
import { presetRange, type DatePreset } from "@/components/ui/date-range-presets";
import { useMoneyMode, MoneyModeProvider, useFormatMoney } from "@/components/ui/data-table-toolbar";
import { fmtDate } from "@/lib/format-date";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { businessDayHourUTC } from "@/lib/business-day";
import { useClosedBusinessDates } from "@/hooks/use-business-day-closure";
import { fetchPaged } from "@/lib/fetch-paged";
import ReprintShiftDialog from "@/components/cage/ReprintShiftDialog";
import { useNavigate } from "react-router-dom";
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
          <TabsTrigger value="daily" className="gap-1 text-xs"><Landmark className="w-3.5 h-3.5" /> Live Game</TabsTrigger>
          <TabsTrigger value="total" className="gap-1 text-xs"><BarChart3 className="w-3.5 h-3.5" /> Total</TabsTrigger>
          <TabsTrigger value="slots" className="gap-1 text-xs"><Joystick className="w-3.5 h-3.5" /> Slots</TabsTrigger>
          <TabsTrigger value="tables" className="gap-1 text-xs"><Table2 className="w-3.5 h-3.5" /> Tables</TabsTrigger>
          <TabsTrigger value="groups" className="gap-1 text-xs"><UsersRound className="w-3.5 h-3.5" /> Groups</TabsTrigger>
          <TabsTrigger value="miss-chips" className="gap-1 text-xs"><Coins className="w-3.5 h-3.5" /> Miss Chips</TabsTrigger>
          <TabsTrigger value="graphics" className="gap-1 text-xs"><LineChartIcon className="w-3.5 h-3.5" /> Graphics</TabsTrigger>
        </TabsList>

        <TabsContent value="daily"><DailyReport from={from} to={to} /></TabsContent>
        <TabsContent value="total"><TotalReport from={from} to={to} /></TabsContent>
        <TabsContent value="slots"><SlotsHistoryReport from={from} to={to} embedded /></TabsContent>
        <TabsContent value="tables">
          <Suspense fallback={<div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>}>
            <TableResultsPage embedded embeddedFrom={from} embeddedTo={to} />
          </Suspense>
        </TabsContent>
        <TabsContent value="groups"><GroupReport from={from} to={to} /></TabsContent>
        <TabsContent value="miss-chips"><MissChips embedded embeddedFrom={from} embeddedTo={to} /></TabsContent>

      </Tabs>
      </MoneyModeProvider>
    </PageShell>
  );
};

const signCls = (n: number) => n > 0 ? "cms-amount-positive" : n < 0 ? "cms-amount-negative" : "text-card-foreground";

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

      const [liveData, slotsData, expData, dropData] = await Promise.all([
        fetchPaged<any>((f, t) => supabase.from("shifts").select("id, closed_at, tables_result")
          .eq("casino_id", casinoId).eq("status", "closed")
          .gte("closed_at", fromIso).lt("closed_at", toIso).range(f, t)),
        fetchPaged<any>((f, t) => supabase.from("cage_slots_shifts").select("id, business_date, status, slots_result, manual_drop_slots")
          .eq("casino_id", casinoId).eq("status", "closed")
          .gte("business_date", from).lt("business_date", toStr).range(f, t)),
        fetchPaged<any>((f, t) => supabase.from("expenses").select("amount, created_at")
          .eq("casino_id", casinoId)
          .gte("created_at", fromIso).lt("created_at", toIso).range(f, t)),
        // Drop Tables = Σ peak-NEP from player_day_drop_cache per business day.
        // SAME source as Player Statistics / Dashboard / Tables — keeps every
        // screen in sync. Paged so long periods (year / All) aren't truncated.
        fetchPaged<any>((f, t) => supabase.from("player_day_drop_cache").select("business_date, peak")
          .eq("casino_id", casinoId)
          .gte("business_date", from).lt("business_date", toStr).range(f, t)),
      ]);
      const liveRes = { data: liveData, error: null };
      const slotsRes = { data: slotsData, error: null };
      const expRes = { data: expData, error: null };
      const dropRes = { data: dropData, error: null };
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

  type K = "date" | "dropTables" | "tablesResult" | "holdTables" | "dropSlots" | "slotsResult" | "holdSlots" | "totalResults";
  const [sort, setSort] = useState<{ key: K; dir: SortDir }>({ key: "date", dir: "desc" });
  const toggle = (k: string) => setSort(s => s.key === k ? { key: k as K, dir: s.dir === "asc" ? "desc" : "asc" } : { key: k as K, dir: "desc" });

  const holdOf = (res: number, drop: number) => (drop > 0 ? (res / drop) * 100 : null);
  const fmtHold = (v: number | null) => (v == null ? "—" : `${v.toFixed(1)}%`);

  const sorted = useMemo(() => {
    const arr = [...rows] as any[];
    const val = (r: any) => {
      if (sort.key === "totalResults") return r.tablesResult + r.slotsResult;
      if (sort.key === "holdTables") return holdOf(r.tablesResult, r.dropTables) ?? -Infinity;
      if (sort.key === "holdSlots") return holdOf(r.slotsResult, r.dropSlots) ?? -Infinity;
      return r[sort.key];
    };
    arr.sort((a, b) => {
      const av = val(a); const bv = val(b);
      if (typeof av === "number" && typeof bv === "number") return sort.dir === "asc" ? av - bv : bv - av;
      return sort.dir === "asc" ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });
    return arr;
  }, [rows, sort]);

  const totals = useMemo(() => {
    const t = (rows as any[]).reduce((a, r) => ({
      dropTables: a.dropTables + Number(r.dropTables || 0),
      tablesResult: a.tablesResult + Number(r.tablesResult || 0),
      dropSlots: a.dropSlots + Number(r.dropSlots || 0),
      slotsResult: a.slotsResult + Number(r.slotsResult || 0),
    }), { dropTables: 0, tablesResult: 0, dropSlots: 0, slotsResult: 0 });
    const totalResult = t.tablesResult + t.slotsResult;
    const totalDrop = t.dropTables + t.dropSlots;
    return {
      ...t,
      totalResult,
      holdTables: holdOf(t.tablesResult, t.dropTables),
      holdSlots: holdOf(t.slotsResult, t.dropSlots),
      totalHold: holdOf(totalResult, totalDrop),
    };
  }, [rows]);

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
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-2">
        {[
          { label: "Drop Table", value: fmt(totals.dropTables), cls: "text-card-foreground" },
          { label: "Result Table", value: fmt(totals.tablesResult), cls: signCls(totals.tablesResult) },
          { label: "Hold", value: fmtHold(totals.holdTables), cls: "text-card-foreground" },
          { label: "Drop Slots", value: fmt(totals.dropSlots), cls: "text-card-foreground" },
          { label: "Result Slots", value: fmt(totals.slotsResult), cls: signCls(totals.slotsResult) },
          { label: "Hold", value: fmtHold(totals.holdSlots), cls: "text-card-foreground" },
          { label: "Total Result", value: fmt(totals.totalResult), cls: signCls(totals.totalResult) },
          { label: "Total Hold", value: fmtHold(totals.totalHold), cls: "text-card-foreground" },
        ].map((c, i) => (
          <div key={`${c.label}-${i}`} className="cms-panel p-2">
            <p className="uppercase text-muted-foreground tracking-wider text-[10px]">{c.label}</p>
            <p className={`font-mono text-sm font-bold ${c.cls}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <DataTable>
        <DTHead>
          <DTRow>
            <SortHeader label="Business Day" k="date" sort={sort as any} toggle={toggle} type="date" />
            <SortHeader label="Drop Table" k="dropTables" sort={sort as any} toggle={toggle} type="money" />
            <SortHeader label="Result Table" k="tablesResult" sort={sort as any} toggle={toggle} type="money" />
            <SortHeader label="Hold" k="holdTables" sort={sort as any} toggle={toggle} type="money" />
            <SortHeader label="Drop Slots" k="dropSlots" sort={sort as any} toggle={toggle} type="money" />
            <SortHeader label="Result Slots" k="slotsResult" sort={sort as any} toggle={toggle} type="money" />
            <SortHeader label="Hold" k="holdSlots" sort={sort as any} toggle={toggle} type="money" />
            <SortHeader label="Total Result" k="totalResults" sort={sort as any} toggle={toggle} type="money" />
          </DTRow>
        </DTHead>
        <DTBody>
          {isLoading ? (
            <DTRow><DTCell colSpan={8} className="text-center text-muted-foreground py-6">Loading…</DTCell></DTRow>
          ) : sorted.length === 0 ? (
            <DTRow><DTCell colSpan={8} className="text-center text-muted-foreground py-6">No closed shifts in range</DTCell></DTRow>
          ) : sorted.map((r: any) => {
            const totalResults = (r.tablesResult || 0) + (r.slotsResult || 0);
            const slotsShiftIds: string[] = Array.isArray(r.slotsShiftIds) ? r.slotsShiftIds : [];
            return (
              <DTRow key={r.date}>
                <DTCell type="date">{fmtDate(r.date)}</DTCell>
                <DTCell type="money" className="text-muted-foreground">{fmt(r.dropTables || 0)}</DTCell>
                <DTCell type="money"><span className={`font-semibold ${signCls(r.tablesResult || 0)}`}>{fmt(r.tablesResult || 0)}</span></DTCell>
                <DTCell type="money"><span className="text-muted-foreground">{fmtHold(holdOf(r.tablesResult || 0, r.dropTables || 0))}</span></DTCell>
                <DTCell type="money">
                  <DropSlotsCell
                    value={r.dropSlots || 0}
                    canEdit={canEditDrop && slotsShiftIds.length > 0}
                    onSave={(v) => updateDropSlots.mutate({ shiftIds: slotsShiftIds, value: v })}
                  />
                </DTCell>
                <DTCell type="money"><span className={`font-semibold ${signCls(r.slotsResult || 0)}`}>{fmt(r.slotsResult || 0)}</span></DTCell>
                <DTCell type="money"><span className="text-muted-foreground">{fmtHold(holdOf(r.slotsResult || 0, r.dropSlots || 0))}</span></DTCell>
                <DTCell type="money"><span className={`font-bold ${signCls(totalResults)}`}>{fmt(totalResults)}</span></DTCell>
              </DTRow>
            );
          })}
          {sorted.length > 0 && (
            <DTRow className="border-t-2 border-primary/40 bg-primary/10 font-bold text-[120%]">
              <DTCell type="date" className="uppercase text-primary">Total</DTCell>
              <DTCell type="money">{fmt(totals.dropTables)}</DTCell>
              <DTCell type="money"><span className={signCls(totals.tablesResult)}>{fmt(totals.tablesResult)}</span></DTCell>
              <DTCell type="money">{fmtHold(totals.holdTables)}</DTCell>
              <DTCell type="money">{fmt(totals.dropSlots)}</DTCell>
              <DTCell type="money"><span className={signCls(totals.slotsResult)}>{fmt(totals.slotsResult)}</span></DTCell>
              <DTCell type="money">{fmtHold(totals.holdSlots)}</DTCell>
              <DTCell type="money"><span className={signCls(totals.totalResult)}>{fmt(totals.totalResult)}</span></DTCell>
            </DTRow>
          )}
        </DTBody>
      </DataTable>
    </div>
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

// =================== GROUP REPORT ===================
const GroupReport = ({ from, to }: { from: string; to: string }) => {
  const fmt = useFormatMoney();
  const { casinoId } = useAuth();
  const { data: groups = [] } = usePlayerGroups();
  const { data: transactions = [] } = useTransactions();
  const { data: expenses = [] } = useExpenses();

  const fromIso = useMemo(() => businessDayHourUTC(from, 7), [from]);
  const toIso = useMemo(() => {
    const d = new Date(to + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + 1);
    return businessDayHourUTC(d.toISOString().slice(0, 10), 7);
  }, [to]);

  // Authoritative per-player peak-NEP for the range — shared with Player tab.
  const { data: dropByPlayer = {} } = useQuery({
    queryKey: ["reports-groups-drop-cache", casinoId, from, to],
    queryFn: async (): Promise<Record<string, number>> => {
      if (!casinoId || !from || !to) return {};
      const rows = await fetchPaged<any>((f, t) => supabase
        .from("player_day_drop_cache")
        .select("player_id, peak")
        .eq("casino_id", casinoId)
        .gte("business_date", from).lte("business_date", to)
        .range(f, t));
      const rec: Record<string, number> = {};
      rows.forEach((r) => {
        if (!r?.player_id) return;
        rec[r.player_id] = (rec[r.player_id] || 0) + (Number(r.peak) || 0);
      });
      return rec;
    },
    enabled: !!casinoId,
    staleTime: 30_000,
  });

  const groupData = useMemo(() => {
    // Business-day scoped (matches Drop from player_day_drop_cache).
    const filteredTx = transactions.filter((t: any) => {
      const d = t.business_date || (t.created_at ? t.created_at.split("T")[0] : "");
      return d >= from && d <= to;
    });
    const filteredExp = expenses.filter((e: any) => {
      const d = e.business_date || (e.created_at ? e.created_at.split("T")[0] : "");
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
      // Drop = Σ peak-NEP per member (sum of daily peaks across the range).
      const drop = memberIds.reduce((s: number, pid: string) => s + (dropByPlayer[pid] || 0), 0);
      const cashout = gTx.filter(t => (t.type === "cashout" || t.type === "out")).reduce((s, t) => s + Number(t.amount), 0);
      const expTotal = gExp.reduce((s: number, e: any) => s + Number(e.amount), 0);
      return { id: g.id, name: g.name, members: memberIds.length, drop, cashout, result: cashout - drop, realResult: cashout - drop - expTotal, expTotal };
    }).filter(g => g.members > 0);
  }, [groups, transactions, expenses, from, to, dropByPlayer]);


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

// =================== LIVE GAME (daily) REPORT ===================
const eatBizDate = (iso: string) => {
  const d = new Date(iso);
  const hh = parseInt(d.toLocaleString("en-GB", { timeZone: "Africa/Dar_es_Salaam", hour: "2-digit", hour12: false }), 10);
  const tgt = hh < 7 ? new Date(d.getTime() - 86400_000) : d;
  return tgt.toLocaleDateString("en-CA", { timeZone: "Africa/Dar_es_Salaam" });
};
const eatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-GB", {
    timeZone: "Africa/Dar_es_Salaam", hour: "2-digit", minute: "2-digit", hour12: false,
  });

const DailyReport = ({ from, to }: { from: string; to: string }) => {
  const fmt = useFormatMoney();
  const { casinoId } = useAuth();
  const navigate = useNavigate();
  const [reprintId, setReprintId] = useState<string | null>(null);
  const { data: closedSet } = useClosedBusinessDates(from, to);

  const { data: rawRows = [], isLoading } = useQuery({
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

  /* Closed live shift per business day — powers the Closed time column and
     the Print / Edit&Print actions (moved here from the old Live Game tab). */
  const { data: shiftByDate = {} } = useQuery({
    queryKey: ["daily-diff-shifts", casinoId, from, to],
    queryFn: async (): Promise<Record<string, { id: string; closed_at: string }>> => {
      if (!casinoId || !from || !to) return {};
      const fromIso = businessDayHourUTC(from, 7);
      const toDate = new Date(to + "T00:00:00Z");
      toDate.setUTCDate(toDate.getUTCDate() + 1);
      const toIso = businessDayHourUTC(toDate.toISOString().slice(0, 10), 7);
      const { data, error } = await supabase
        .from("shifts")
        .select("id, closed_at")
        .eq("casino_id", casinoId)
        .not("closed_at", "is", null)
        .gte("closed_at", fromIso).lt("closed_at", toIso)
        .order("closed_at", { ascending: true })
        .limit(1000);
      if (error) throw error;
      const rec: Record<string, { id: string; closed_at: string }> = {};
      (data || []).forEach((s: any) => { rec[eatBizDate(s.closed_at)] = { id: s.id, closed_at: s.closed_at }; });
      return rec;
    },
    enabled: !!casinoId,
    staleTime: 30_000,
  });

  // Rule: show only CLOSED business days. Open (not-yet-closed) day is hidden
  // from the list, totals and KPIs.
  const rows = useMemo(
    () => (closedSet ? rawRows.filter((r: any) => closedSet.has(r.date)) : []),
    [rawRows, closedSet],
  );

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
    return {
      ...t,
      hold: t.drop > 0 ? (t.result / t.drop) * 100 : null,
      avgDrop: rows.length ? t.drop / rows.length : 0,
    };
  }, [rows]);

  const fmtHold = (v: number | null) => v == null ? "—" : `${v.toFixed(1)}%`;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <div className="cms-panel p-2">
          <p className="uppercase text-muted-foreground tracking-wider text-[10px]">Days</p>
          <p className="font-mono text-sm font-bold text-card-foreground">{rows.length}</p>
        </div>
        {[
          { label: "AVG Drop", value: fmt(totals.avgDrop), cls: "text-card-foreground" },
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
            <DTHeader type="time">Closed</DTHeader>
            <SortHeader label="Drop" k="drop" sort={sort} toggle={toggle} type="money" />
            <SortHeader label="Table Result" k="result" sort={sort} toggle={toggle} type="money" />
            <SortHeader label="Hold %" k="hold" sort={sort} toggle={toggle} type="money" />
            <SortHeader label="Player Result" k="playerResult" sort={sort} toggle={toggle} type="money" />
            <SortHeader label="Chip Difference" k="miss" sort={sort} toggle={toggle} type="money" />
            <SortHeader label="Gaming Balance" k="balance" sort={sort} toggle={toggle} type="money" />
            <DTHeader type="actions" />
          </DTRow>
        </DTHead>
        <DTBody>
          {isLoading ? (
            <DTRow><DTCell colSpan={9} className="text-center text-muted-foreground py-6">Loading…</DTCell></DTRow>
          ) : sorted.length === 0 ? (
            <DTRow><DTCell colSpan={9} className="text-center text-muted-foreground py-6">No closed business days in range</DTCell></DTRow>
          ) : sorted.map((r) => {
            const sh = (shiftByDate as any)[r.date] as { id: string; closed_at: string } | undefined;
            return (
              <DTRow key={r.date}>
                <DTCell type="date">{fmtDate(r.date)}</DTCell>
                <DTCell type="time" className="text-muted-foreground font-mono">{sh ? eatTime(sh.closed_at) : "·"}</DTCell>
                <DTCell type="money">{fmt(r.drop)}</DTCell>
                <DTCell type="money"><span className={`font-bold ${signCls(r.result)}`}>{fmt(r.result)}</span></DTCell>
                <DTCell type="money"><span className="text-muted-foreground">{fmtHold(r.hold)}</span></DTCell>
                <DTCell type="money"><span className={signCls(r.playerResult)}>{fmt(r.playerResult)}</span></DTCell>
                <DTCell type="money"><span className={signCls(r.miss)}>{fmt(r.miss)}</span></DTCell>
                <DTCell type="money"><span className={`font-bold ${signCls(r.balance)}`}>{fmt(r.balance)}</span></DTCell>
                <DTCell type="actions">
                  <div className="flex gap-1 justify-end">
                    <Button
                      size="sm" variant="outline" className="h-7 gap-1 text-[11px]"
                      disabled={!sh} onClick={() => sh && setReprintId(sh.id)}
                    >
                      <Printer className="w-3 h-3" /> Print
                    </Button>
                    <Button
                      size="sm" variant="outline" className="h-7 gap-1 text-[11px]"
                      disabled={!sh} onClick={() => sh && navigate(`/cage/shift/${sh.id}/edit-reprint`)}
                    >
                      <Printer className="w-3 h-3" /> Edit&Print
                    </Button>
                  </div>
                </DTCell>
              </DTRow>
            );
          })}
          {sorted.length > 0 && (
            <DTRow className="border-t-2 border-primary/40 bg-primary/10 font-bold text-[120%]">
              <DTCell type="date" className="uppercase text-primary">Total</DTCell>
              <DTCell type="time" />
              <DTCell type="money">{fmt(totals.drop)}</DTCell>
              <DTCell type="money"><span className={signCls(totals.result)}>{fmt(totals.result)}</span></DTCell>
              <DTCell type="money">{fmtHold(totals.hold)}</DTCell>
              <DTCell type="money"><span className={signCls(totals.playerResult)}>{fmt(totals.playerResult)}</span></DTCell>
              <DTCell type="money"><span className={signCls(totals.miss)}>{fmt(totals.miss)}</span></DTCell>
              <DTCell type="money"><span className={signCls(totals.balance)}>{fmt(totals.balance)}</span></DTCell>
              <DTCell type="actions" />
            </DTRow>
          )}
        </DTBody>
      </DataTable>
      {reprintId && casinoId && (
        <ReprintShiftDialog open onClose={() => setReprintId(null)} shiftId={reprintId} casinoId={casinoId} />
      )}
    </div>
  );
};

export default Reports;

