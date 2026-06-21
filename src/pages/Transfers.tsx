// ============================================================
// Unified TRANSFERS page — reads union of cage_transfers (Live)
// + cage_slots_transfers (Slots), filtered by business date and
// source. Read-only history; new entries are recorded inside the
// respective Cage workspace (Live Game / Cage Slots) where chip
// + table context is available.
// ============================================================
import { useMemo, useState } from "react";
import { useSessionState } from "@/hooks/use-session-state";
import { ArrowLeftRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { getBusinessDate, businessDayHourUTC } from "@/lib/business-day";
import { useEffectiveBusinessDate } from "@/hooks/use-business-day-closure";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageSection } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/currency";
import { useActiveCageSlotsShift } from "@/hooks/use-cage-slots";
import { useActiveShift } from "@/hooks/use-shift";
import SlotsTransfersForm from "@/components/cage-slots/SlotsTransfersForm";

type Source = "all" | "live_game" | "slots";

type UnifiedRow = {
  id: string;
  source: "live_game" | "slots";
  transfer_type: string;
  amount: number;
  direction: string;
  note: string;
  created_at: string;
};

const LABELS: Record<string, string> = {
  add_float: "Add Float",
  collection: "Collection",
  fill: "Fill",
  credit: "Credit",
  slots_out: "Slots Cage Out",
  slots_in: "Slots Cage In",
  lg_in: "Cage LG IN",
  lg_out: "Cage LG OUT",
};

const TYPE_COLORS: Record<string, string> = {
  add_float: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  collection: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
  fill: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400",
  credit: "bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-400",
  slots_in: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  slots_out: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400",
  lg_in: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  lg_out: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400",
};

const shiftDate = (d: string, days: number): string => {
  const dt = new Date(d + "T00:00:00Z");
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
};

// ============= Hook: union of both transfer tables, filtered by business_date.
const useUnifiedTransfers = (businessDate: string, source: Source) => {
  const { casinoId } = useAuth();
  return useQuery({
    queryKey: ["transfers-unified", casinoId, businessDate, source],
    queryFn: async (): Promise<UnifiedRow[]> => {
      if (!casinoId) return [];
      // The transfers tables themselves don't carry business_date — they are
      // joined via parent shifts which expose business_date. Easiest: filter
      // by created_at falling inside the business day window [bd 07:00 EAT, bd+1 07:00 EAT).
      const fromUtc = businessDayHourUTC(businessDate, 7);
      const toUtc = new Date(new Date(fromUtc).getTime() + 24 * 60 * 60 * 1000).toISOString();

      const acc: UnifiedRow[] = [];

      if (source === "all" || source === "live_game") {
        const { data, error } = await (supabase as any)
          .from("cage_transfers")
          .select("id, transfer_type, amount, direction, note, created_at")
          .eq("casino_id", casinoId)
          .gte("created_at", fromUtc)
          .lt("created_at", toUtc)
          .order("created_at", { ascending: false });
        if (error) throw error;
        (data || []).forEach((r: any) => acc.push({
          id: r.id, source: "live_game",
          transfer_type: r.transfer_type, amount: Number(r.amount),
          direction: r.direction, note: r.note || "", created_at: r.created_at,
        }));
      }

      if (source === "all" || source === "slots") {
        const { data, error } = await (supabase as any)
          .from("cage_slots_transfers")
          .select("id, transfer_type, amount, direction, note, created_at")
          .eq("casino_id", casinoId)
          .gte("created_at", fromUtc)
          .lt("created_at", toUtc)
          .order("created_at", { ascending: false });
        if (error) throw error;
        (data || []).forEach((r: any) => acc.push({
          id: r.id, source: "slots",
          transfer_type: r.transfer_type, amount: Number(r.amount),
          direction: r.direction, note: r.note || "", created_at: r.created_at,
        }));
      }

      acc.sort((a, b) => b.created_at.localeCompare(a.created_at));
      return acc;
    },
    enabled: !!casinoId,
    staleTime: 30_000,
  });
};

const Transfers = () => {
  const { roles, isManager } = useAuth();
  const isCashierLive = roles.includes("cashier") && !roles.includes("cashier_slots");
  const isCashierSlots = roles.includes("cashier_slots") && !roles.includes("cashier");
  const sourceLocked = !isManager && (isCashierLive || isCashierSlots);
  const roleDefaultSource: Source = isCashierSlots ? "slots" : "live_game";

  const [source, setSource] = useSessionState<Source>(
    "source",
    sourceLocked ? roleDefaultSource : (isManager ? "all" : roleDefaultSource)
  );

  const { data: serverBusinessDate } = useEffectiveBusinessDate();
  const businessDate = serverBusinessDate || getBusinessDate();
  const [viewDate, setViewDate] = useSessionState<string>("viewDate", businessDate);
  const isToday = viewDate === businessDate;

  const { data: rows = [] } = useUnifiedTransfers(viewDate, source);

  // Inline transfer creation — render the slots/live form when the cashier (or manager)
  // has an open shift and the matching source is selected. Lets users record a transfer
  // straight from the Transfers screen instead of jumping back to the cage workspace.
  const { data: activeSlotsShift } = useActiveCageSlotsShift();
  const { data: activeLiveShift } = useActiveShift();
  const canCreateSlots = (source === "slots" || source === "all")
    && activeSlotsShift && activeSlotsShift.status === "open";
  const canCreateLive = (source === "live_game" || source === "all")
    && activeLiveShift && (activeLiveShift as any).status === "open";

  const summary = useMemo(() => {
    let live = 0, slots = 0, count = rows.length;
    rows.forEach(r => {
      if (r.source === "live_game") live += r.amount;
      else slots += r.amount;
    });
    return { live, slots, total: live + slots, count };
  }, [rows]);

  return (
    <div>
      <PageHeader
        icon={ArrowLeftRight}
        title="Transfers"
        subtitle={`Cage transfers · ${summary.count} records${sourceLocked ? ` · ${roleDefaultSource === "slots" ? "Slots" : "Live"}` : ""}`}
        date
      />

      {/* Source filter */}
      <div className="mb-4 flex items-center gap-2">
        <span className="text-[10px] uppercase text-muted-foreground tracking-wider">Source</span>
        <div className="inline-flex rounded-md border border-border overflow-hidden h-8">
          {(["all", "live_game", "slots"] as Source[]).map(s => (
            <button
              key={s}
              type="button"
              disabled={sourceLocked && s !== roleDefaultSource}
              onClick={() => setSource(s)}
              className={`px-3 text-xs font-medium transition-colors ${
                source === s ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
              } ${sourceLocked && s !== roleDefaultSource ? "opacity-40 cursor-not-allowed" : ""}`}
            >
              {s === "all" ? "All" : s === "live_game" ? "Live" : "Slots"}
            </button>
          ))}
        </div>
        <span className="text-[10px] text-muted-foreground">
          {canCreateSlots || canCreateLive
            ? "Record a new transfer below, or browse history."
            : "History only. Open the matching cage shift to record new transfers."}
        </span>
      </div>

      {/* Inline transfer creation — only when an open shift exists for that cage. */}
      {canCreateSlots && (
        <div className="mb-6">
          <PageSection title="New Slots Cage Transfer">
            <SlotsTransfersForm shiftId={activeSlotsShift!.id} />
          </PageSection>
        </div>
      )}

      {/* KPI tiles */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        <div className="cms-panel p-3">
          <p className="text-[10px] uppercase text-muted-foreground tracking-wider">Live Cage Volume</p>
          <p className="font-mono text-lg font-bold">{formatCurrency(summary.live)}</p>
        </div>
        <div className="cms-panel p-3">
          <p className="text-[10px] uppercase text-muted-foreground tracking-wider">Slots Cage Volume</p>
          <p className="font-mono text-lg font-bold">{formatCurrency(summary.slots)}</p>
        </div>
        <div className="cms-panel p-3">
          <p className="text-[10px] uppercase text-muted-foreground tracking-wider">Total Volume</p>
          <p className="font-mono text-lg font-bold">{formatCurrency(summary.total)}</p>
        </div>
      </div>

      {/* History */}
      <div className="cms-panel overflow-hidden">
        <div className="px-4 py-2 border-b border-border flex items-center justify-between gap-2 flex-wrap">
          <h3 className="text-sm font-semibold text-card-foreground">
            History {isToday ? "(today)" : `· ${viewDate}`}
          </h3>
          <div className="inline-flex items-center gap-1">
            <Button size="sm" variant="outline" className="h-8 px-2" onClick={() => setViewDate(d => shiftDate(d, -1))}>◀</Button>
            <Input
              type="date"
              value={viewDate}
              max={businessDate}
              onChange={e => setViewDate(e.target.value || businessDate)}
              className="h-8 w-[150px] text-xs"
            />
            <Button size="sm" variant="outline" className="h-8 px-2" disabled={isToday} onClick={() => setViewDate(d => shiftDate(d, 1) > businessDate ? businessDate : shiftDate(d, 1))}>▶</Button>
            <Button size="sm" variant={isToday ? "default" : "outline"} className="h-8" onClick={() => setViewDate(businessDate)}>Today</Button>
          </div>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground">
              <th className="text-left px-3 py-2">Time</th>
              {source === "all" && <th className="text-left px-3 py-2">Src</th>}
              <th className="text-left px-3 py-2">Type</th>
              <th className="text-left px-3 py-2">Direction</th>
              <th className="text-right px-3 py-2">Amount</th>
              <th className="text-left px-3 py-2">Note</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={source === "all" ? 6 : 5} className="text-center text-muted-foreground text-sm py-8">No transfers for {isToday ? "today" : viewDate}</td></tr>
            ) : rows.map(r => (
              <tr key={`${r.source}-${r.id}`} className="border-b border-border last:border-0">
                <td className="px-3 py-2 text-xs font-mono text-muted-foreground">
                  {new Date(r.created_at).toLocaleTimeString("en-GB", { timeZone: "Africa/Dar_es_Salaam", hour: "2-digit", minute: "2-digit" })}
                </td>
                {source === "all" && (
                  <td className="px-3 py-2 text-[10px] uppercase font-mono text-muted-foreground">{r.source === "slots" ? "Slots" : "Live"}</td>
                )}
                <td className="px-3 py-2">
                  <span className={`text-[10px] font-mono uppercase px-1.5 py-0.5 rounded ${TYPE_COLORS[r.transfer_type] || "bg-muted text-muted-foreground"}`}>
                    {LABELS[r.transfer_type] || r.transfer_type}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <Badge variant="outline" className="text-[10px]">{r.direction}</Badge>
                </td>
                <td className="px-3 py-2 text-right font-mono text-sm">{formatCurrency(r.amount)}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{r.note || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Transfers;
