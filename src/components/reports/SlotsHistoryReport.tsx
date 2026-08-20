/**
 * SlotsHistoryReport — read-only Slots cage shift history over an arbitrary
 * business-day range. Columns mirror the Live Game report layout:
 * Business Day / Closed / Drop / Net Win / Cashdesk / Client Balance /
 * Card Miss / Balance / Print — with a TOTAL row at the bottom.
 *
 * Drop, Net Win and Client Balance are manual entries on the slots shift
 * (`manual_drop_slots`, `manual_slots_result`, `manual_slots_deposits`),
 * editable inline by managers/finance.
 *
 * Cashdesk comes from the day closing (`fin_day_closing.cashdesk_win`, the
 * CashDesk Win entered in Close Day) whenever the day is closed; otherwise it
 * falls back to the shift's computed cash desk result.

 */
import { useMemo, useState } from "react";
import { Printer, Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { formatMoneyFull } from "@/lib/format-money";
import { fmtDate } from "@/lib/format-date";
import { useCageSlotsHistory } from "@/hooks/use-cage-slots";
import PrintSlotsShiftDialog from "@/components/cage-slots/PrintSlotsShiftDialog";

import {
  DataTable, DTHead, DTBody, DTRow, DTHeader, DTCell,
} from "@/components/ui/data-table";
import { MoneyCell } from "@/components/ui/money-cell";
import { useMoneyMode } from "@/components/ui/data-table-toolbar";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

type SortKey = "business_date" | "drop" | "netWin" | "cdr" | "clientBalance" | "miss" | "balance";
type SortDir = "asc" | "desc";

const eatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-GB", {
    timeZone: "Africa/Dar_es_Salaam", hour: "2-digit", minute: "2-digit", hour12: false,
  });

/** Inline-editable money cell (same interaction as Drop Slots in Reports → Total). */
const EditableMoney = ({
  value, canEdit, mode, onSave,
}: { value: number; canEdit: boolean; mode: any; onSave: (v: number) => void }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value || ""));
  if (!canEdit) return <MoneyCell value={value || null} mode={mode} empty="·" />;
  if (!editing) {
    return (
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setDraft(String(value || "")); setEditing(true); }}
        className="hover:bg-muted/50 rounded px-1.5 py-0.5 -my-0.5 transition-colors"
      >
        {value ? <MoneyCell value={value} mode={mode} /> : <span className="text-muted-foreground/50">+ add</span>}
      </button>
    );
  }
  const save = () => { onSave(Number(draft) || 0); setEditing(false); };
  return (
    <span className="inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
      <NumberInput
        decimals={0} value={draft === "" ? null : draft} autoFocus
        onValueChange={(v) => setDraft(v == null ? "" : String(v))} onBlur={save}
        onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
        className="h-7 w-28 text-right font-mono text-xs"
      />
      <Check className="w-3 h-3 text-muted-foreground" />
    </span>
  );
};

const SlotsHistoryReport = ({ from, to, embedded = false }: { from: string; to: string; embedded?: boolean }) => {
  const { data: allShifts = [], isLoading } = useCageSlotsHistory(500);
  const [mode, MoneyToggle] = useMoneyMode("slots-history-report");
  const { roles, casinoId } = useAuth() as any;
  const qc = useQueryClient();
  const canEdit = roles.includes("super_admin") || roles.includes("manager") ||
                  roles.includes("shift_manager") || roles.includes("finance_manager");

  // Cashdesk source of truth: the CashDesk Win entered in Close Day.
  const { data: closings = [] } = useQuery({
    queryKey: ["slots-report-day-closings", casinoId, from, to],
    queryFn: async () => {
      if (!casinoId || !from || !to) return [];
      const { data, error } = await supabase
        .from("fin_day_closing")
        .select("business_date, cashdesk_win, net_win, drop_slots")
        .eq("casino_id", casinoId)
        .gte("business_date", from)
        .lte("business_date", to);
      if (error) throw error;
      return data || [];
    },
    enabled: !!casinoId,
  });

  /** business_date -> Close Day figures. Presence of the row locks the cells. */
  const closingByDate = useMemo(() => {
    const m = new Map<string, { cashdesk: number; netWin: number; drop: number }>();
    (closings as any[]).forEach((r) => {
      m.set(r.business_date, {
        cashdesk: Number(r.cashdesk_win || 0),
        netWin: Number(r.net_win || 0),
        drop: Number(r.drop_slots || 0),
      });
    });
    return m;
  }, [closings]);

  const shifts = useMemo(() => {
    return allShifts.filter((s: any) => {
      if (s.status !== "closed" && s.status !== "reviewed") return false;
      const d = s.business_date;
      return d >= from && d <= to;
    });
  }, [allShifts, from, to]);

  const [printShiftId, setPrintShiftId] = useState<string | null>(null);
  
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: "business_date", dir: "desc" });

  const rows = useMemo(() => shifts.map((s: any) => {
    const c = closingByDate.get(s.business_date);
    const netWin = c ? c.netWin : 0;
    const cdr = c ? c.cashdesk : 0;
    return {
      s,
      // Drop: ACE Collector / Close Day figure wins over the manual cage entry.
      drop: c && c.drop !== 0 ? c.drop : Number(s.manual_drop_slots || 0),
      dropLocked: !!c && c.drop !== 0,
      // Net Win / Cashdesk come ONLY from Close Day. No fallback to shift figures.
      netWin,
      cdr,
      // A figure entered at Close Day is read-only; a zero (day closed without
      // figures, or no closing at all) can still be filled in manually.
      netWinLocked: netWin !== 0,
      cdrLocked: cdr !== 0,
      clientBalance: Number(s.manual_slots_deposits || 0),
      miss: Number(s.cards_miss || 0),
      balance: Number(s.balance || 0),
    };
  }), [shifts, closingByDate]);


  const totals = useMemo(() => {
    const t = rows.reduce((a, r) => ({
      drop: a.drop + r.drop,
      netWin: a.netWin + r.netWin,
      cdr: a.cdr + r.cdr,
      clientBalance: a.clientBalance + r.clientBalance,
      miss: a.miss + r.miss,
      balance: a.balance + r.balance,
    }), { drop: 0, netWin: 0, cdr: 0, clientBalance: 0, miss: 0, balance: 0 });
    return {
      ...t,
      shifts: rows.length,
      avgDrop: rows.length ? t.drop / rows.length : 0,
      hold: t.drop > 0 ? (t.netWin / t.drop) * 100 : null,
    };
  }, [rows]);

  const sorted = useMemo(() => {
    const arr = [...rows];
    const get = (r: typeof rows[number]): number | string =>
      sort.key === "business_date" ? r.s.business_date : (r as any)[sort.key];
    arr.sort((a, b) => {
      const va = get(a); const vb = get(b);
      if (typeof va === "number" && typeof vb === "number") return sort.dir === "asc" ? va - vb : vb - va;
      return sort.dir === "asc"
        ? String(va).localeCompare(String(vb))
        : String(vb).localeCompare(String(va));
    });
    return arr;
  }, [rows, sort]);

  const toggleSort = (k: SortKey) =>
    setSort(s => (s.key === k ? { key: k, dir: s.dir === "asc" ? "desc" : "asc" } : { key: k, dir: "desc" }));
  const sortArrow = (k: SortKey) => sort.key === k ? (sort.dir === "asc" ? " ↑" : " ↓") : "";

  const signCls = (n: number) => n > 0 ? "cms-amount-positive" : n < 0 ? "cms-amount-negative" : "";
  const fmtHold = (v: number | null) => v == null ? "—" : `${v.toFixed(1)}%`;

  const updateField = useMutation({
    mutationFn: async ({ id, field, value }: { id: string; field: string; value: number }) => {
      const { error } = await supabase
        .from("cage_slots_shifts")
        .update({ [field]: value } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cage-slots-history"] });
      qc.invalidateQueries({ queryKey: ["reports-total"] });
      toast.success("Updated");
    },
    onError: (e: any) => toast.error(e.message || "Failed to update"),
  });

  /**
   * Manual backfill for days that were never closed via Close Day.
   * Creates (or updates) the fin_day_closing row for that business date.
   * Once a Close Day row exists the cells become read-only.
   */
  const updateClosingField = useMutation({
    mutationFn: async ({ date, field, value }: { date: string; field: "net_win" | "cashdesk_win"; value: number }) => {
      const { error } = await supabase
        .from("fin_day_closing")
        .upsert({ casino_id: casinoId, business_date: date, [field]: value } as any,
                { onConflict: "casino_id,business_date" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["slots-report-day-closings"] });
      qc.invalidateQueries({ queryKey: ["reports-total"] });
      qc.invalidateQueries({ queryKey: ["cage-slots-history"] });
      toast.success("Updated");
    },
    onError: (e: any) => toast.error(e.message || "Failed to update"),
  });

  return (
    <div className="space-y-3">
      {/* KPI summary tiles */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        {[
          { label: "Shifts", value: String(totals.shifts), cls: "text-card-foreground" },
          { label: "AVG Drop", value: formatMoneyFull(totals.avgDrop), cls: "text-card-foreground" },
          { label: "Drop", value: formatMoneyFull(totals.drop), cls: "text-card-foreground" },
          { label: "Net Win", value: formatMoneyFull(totals.netWin), cls: signCls(totals.netWin) },
          { label: "Hold", value: fmtHold(totals.hold), cls: "text-card-foreground" },
        ].map((c) => (
          <div key={c.label} className="cms-panel p-2">
            <p className="uppercase text-muted-foreground tracking-wider text-[10px]">{c.label}</p>
            <p className={`font-mono text-sm font-bold ${c.cls}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {!embedded && (
        <div className="flex items-center justify-end">
          <MoneyToggle />
        </div>
      )}

      <DataTable>
        <DTHead>
          <DTRow>
            <DTHeader type="date" className="cursor-pointer select-none" onClick={() => toggleSort("business_date")}>
              Business Day{sortArrow("business_date")}
            </DTHeader>
            <DTHeader type="time">Closed</DTHeader>
            <DTHeader type="money" className="cursor-pointer select-none" onClick={() => toggleSort("drop")}>Drop{sortArrow("drop")}</DTHeader>
            <DTHeader type="money" className="cursor-pointer select-none" onClick={() => toggleSort("netWin")}>Net Win{sortArrow("netWin")}</DTHeader>
            <DTHeader type="money" className="cursor-pointer select-none" onClick={() => toggleSort("cdr")}>Cashdesk{sortArrow("cdr")}</DTHeader>
            <DTHeader type="money" className="cursor-pointer select-none" onClick={() => toggleSort("clientBalance")}>Client Balance{sortArrow("clientBalance")}</DTHeader>
            <DTHeader type="money" className="cursor-pointer select-none" onClick={() => toggleSort("miss")}>Card Miss{sortArrow("miss")}</DTHeader>
            <DTHeader type="money" className="cursor-pointer select-none" onClick={() => toggleSort("balance")}>Balance{sortArrow("balance")}</DTHeader>
            <DTHeader type="actions" />
          </DTRow>
        </DTHead>
        <DTBody>
          {isLoading && (
            <DTRow><DTCell colSpan={9} className="text-center text-muted-foreground py-4">Loading…</DTCell></DTRow>
          )}
          {!isLoading && sorted.length === 0 && (
            <DTRow><DTCell colSpan={9} className="text-center text-muted-foreground py-4">No closed slots shifts in range</DTCell></DTRow>
          )}
          {sorted.map(({ s, drop, dropLocked, netWin, cdr, clientBalance, miss, balance, netWinLocked, cdrLocked }) => {
            return (
              <DTRow key={s.id}>
                  <DTCell type="date">{fmtDate(s.business_date)}</DTCell>
                  <DTCell type="time" className="text-muted-foreground font-mono">
                    {s.closed_at ? eatTime(s.closed_at) : "·"}
                  </DTCell>
                  <DTCell type="money">
                    <EditableMoney
                      value={drop} canEdit={canEdit} mode={mode}
                      onSave={(v) => updateField.mutate({ id: s.id, field: "manual_drop_slots", value: v })}
                    />
                  </DTCell>
                  <DTCell type="money" title={netWinLocked ? "From Close Day" : undefined}>
                    <EditableMoney
                      value={netWin} canEdit={canEdit && !netWinLocked} mode={mode}
                      onSave={(v) => updateClosingField.mutate({ date: s.business_date, field: "net_win", value: v })}
                    />
                  </DTCell>
                  <DTCell type="money" title={cdrLocked ? "From Close Day" : undefined}>
                    <EditableMoney
                      value={cdr} canEdit={canEdit && !cdrLocked} mode={mode}
                      onSave={(v) => updateClosingField.mutate({ date: s.business_date, field: "cashdesk_win", value: v })}
                    />
                  </DTCell>
                  <DTCell type="money">
                    <EditableMoney
                      value={clientBalance} canEdit={canEdit} mode={mode}
                      onSave={(v) => updateField.mutate({ id: s.id, field: "manual_slots_deposits", value: v })}
                    />
                  </DTCell>
                  <DTCell type="money">
                    <MoneyCell value={miss || null} mode={mode} empty="·" className={miss < 0 ? "cms-amount-negative" : ""} />
                  </DTCell>
                  <DTCell type="money"><MoneyCell value={balance} mode={mode} signed /></DTCell>
                  <DTCell type="actions">
                    <Button variant="ghost" size="sm" onClick={() => setPrintShiftId(s.id)} className="gap-1 h-7">
                      <Printer className="w-3.5 h-3.5" /> Print
                    </Button>
                  </DTCell>
              </DTRow>
            );
          })}

          {sorted.length > 0 && (
            <DTRow className="border-t-2 border-primary/40 bg-primary/10 font-bold text-[120%]">
              <DTCell type="date" className="uppercase text-primary">Total</DTCell>
              <DTCell type="time" />
              <DTCell type="money"><MoneyCell value={totals.drop} mode={mode} /></DTCell>
              <DTCell type="money"><MoneyCell value={totals.netWin} mode={mode} signed /></DTCell>
              <DTCell type="money"><MoneyCell value={totals.cdr} mode={mode} signed /></DTCell>
              <DTCell type="money"><MoneyCell value={totals.clientBalance} mode={mode} /></DTCell>
              <DTCell type="money"><MoneyCell value={totals.miss} mode={mode} signed /></DTCell>
              <DTCell type="money"><MoneyCell value={totals.balance} mode={mode} signed /></DTCell>
              <DTCell type="actions" />
            </DTRow>
          )}
        </DTBody>
      </DataTable>

      {printShiftId && (
        <PrintSlotsShiftDialog open shiftId={printShiftId} onClose={() => setPrintShiftId(null)} />
      )}
    </div>
  );
};

export default SlotsHistoryReport;
