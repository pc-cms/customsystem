import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CreditCard, CheckCircle, Plus, X } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { getBusinessDate } from "@/lib/business-day";
import { useEffectiveBusinessDate } from "@/hooks/use-business-day-closure";

import {
  useCashless, useCreateCashless, useApproveCashless,
  type CashlessDirection, type CashlessProvider, type CashlessSource,
} from "@/hooks/use-cashless";
import { useActiveShift } from "@/hooks/use-shift";
import { useActiveCageSlotsShift } from "@/hooks/use-cage-slots";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import ManagerOverrideDialog from "@/components/ManagerOverrideDialog";
import PlayerSearch from "@/components/cage/PlayerSearch";
import { usePlayers } from "@/hooks/use-players";
import { formatCurrency } from "@/lib/currency";

const PROVIDERS: { value: CashlessProvider; label: string }[] = [
  { value: "AIRTEL", label: "AirTel" },
  { value: "MPESA", label: "M-Pesa" },
  { value: "TIGO", label: "Tigo" },
  { value: "HALOTEL", label: "Halotel" },
];

const PROVIDER_COLORS: Record<CashlessProvider, string> = {
  AIRTEL: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400",
  MPESA: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  TIGO: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400",
  HALOTEL: "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400",
};

interface DraftRow {
  uid: string;
  direction: CashlessDirection;
  provider: CashlessProvider | "";
  player_id: string;
  player_name: string;
  amount: string;
  reference: string;
}

const newDraft = (): DraftRow => ({
  uid: Math.random().toString(36).slice(2),
  direction: "IN",
  provider: "",
  player_id: "",
  player_name: "",
  amount: "",
  reference: "",
});

const shiftDate = (d: string, days: number): string => {
  const dt = new Date(d + "T00:00:00Z");
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
};

const Cashless = () => {
  const { isManager, roles } = useAuth();
  const isCashierLive = roles.includes("cashier") && !roles.includes("cashier_slots");
  const isCashierSlots = roles.includes("cashier_slots") && !roles.includes("cashier");
  const sourceLocked = !isManager && (isCashierLive || isCashierSlots);
  const roleDefaultSource: CashlessSource = isCashierSlots ? "slots" : "live_game";

  const [source, setSource] = useState<CashlessSource>(
    sourceLocked ? roleDefaultSource : (isManager ? "all" : roleDefaultSource)
  );

  const { data: serverBusinessDate } = useEffectiveBusinessDate();
  const businessDate = serverBusinessDate || getBusinessDate();
  const [viewDate, setViewDate] = useState<string>(businessDate);
  const isToday = viewDate === businessDate;
  const { data: rows = [] } = useCashless(viewDate, source);

  const { data: liveShift } = useActiveShift();
  const { data: slotsShift } = useActiveCageSlotsShift();

  const create = useCreateCashless();
  const approve = useApproveCashless();
  const [pendingApproveId, setPendingApproveId] = useState<string | null>(null);

  const [drafts, setDrafts] = useState<DraftRow[]>([newDraft()]);

  const updateDraft = (uid: string, patch: Partial<DraftRow>) =>
    setDrafts(d => d.map(r => (r.uid === uid ? { ...r, ...patch } : r)));

  const removeDraft = (uid: string) =>
    setDrafts(d => (d.length > 1 ? d.filter(r => r.uid !== uid) : d));

  // Source used when writing new rows: managers viewing "all" must explicitly pick;
  // cashiers always write to their own scope.
  const writeSource: "live_game" | "slots" =
    source === "all" ? roleDefaultSource : source;

  const submitDraft = async (uid: string) => {
    const row = drafts.find(r => r.uid === uid);
    if (!row) return;
    if (!row.provider) return toast.error("Choose provider");
    if (!row.player_name.trim()) return toast.error("Enter player name");
    const amt = Number(row.amount);
    if (!amt || amt <= 0) return toast.error("Amount must be > 0");
    if (writeSource === "slots" && !slotsShift?.id) {
      return toast.error("No open Slots shift");
    }
    try {
      await create.mutateAsync({
        direction: row.direction,
        provider: row.provider as CashlessProvider,
        player_name: row.player_name.trim(),
        amount: amt,
        reference: row.reference,
        business_date: businessDate,
        source: writeSource,
        cage_slots_shift_id: writeSource === "slots" ? slotsShift?.id ?? null : null,
      });
      setDrafts(d => [...d.filter(r => r.uid !== uid), newDraft()]);
      toast.success(row.direction === "OUT" ? "Withdrawal → pending" : "Deposit recorded");
    } catch {/* toast handled */}
  };

  const summary = useMemo(() => {
    const s: Record<CashlessProvider, { in: number; out: number; pending: number }> = {
      AIRTEL: { in: 0, out: 0, pending: 0 },
      MPESA: { in: 0, out: 0, pending: 0 },
      TIGO: { in: 0, out: 0, pending: 0 },
      HALOTEL: { in: 0, out: 0, pending: 0 },
    };
    let totalIn = 0, totalOut = 0, pendingCount = 0;
    rows.forEach(r => {
      const amt = Number(r.amount);
      if (r.direction === "IN") { s[r.provider].in += amt; totalIn += amt; }
      else { s[r.provider].out += amt; totalOut += amt; }
      if (r.status === "pending") { s[r.provider].pending += amt; pendingCount += 1; }
    });
    return { perProvider: s, totalIn, totalOut, net: totalIn - totalOut, pendingCount };
  }, [rows]);

  return (
    <div>
      <PageHeader
        icon={CreditCard}
        title="Cashless"
        subtitle={`Mobile money · ${rows.length} records · ${summary.pendingCount} pending${sourceLocked ? ` · ${writeSource === "slots" ? "Slots" : "Live"}` : ""}`}
        date
      />

      {/* Source filter — Live / Slots / All (locked for single-source cashiers) */}
      <div className="mb-4 flex items-center gap-2">
        <span className="text-[10px] uppercase text-muted-foreground tracking-wider">Source</span>
        <div className="inline-flex rounded-md border border-border overflow-hidden h-8">
          {(["all", "live_game", "slots"] as CashlessSource[]).map(s => (
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
        {source === "all" && !sourceLocked && (
          <span className="text-[10px] text-muted-foreground">New rows go to <b>{writeSource === "slots" ? "Slots" : "Live"}</b> (active shift).</span>
        )}
      </div>

      {/* KPI cards — Deposit / Withdrawal / Net (no IN/OUT terminology) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        <div className="cms-panel p-3">
          <p className="text-[10px] uppercase text-muted-foreground tracking-wider">Total Deposit</p>
          <p className="font-mono text-lg font-bold cms-amount-positive">{formatCurrency(summary.totalIn)}</p>
        </div>
        <div className="cms-panel p-3">
          <p className="text-[10px] uppercase text-muted-foreground tracking-wider">Total Withdrawal</p>
          <p className="font-mono text-lg font-bold cms-amount-negative">{formatCurrency(summary.totalOut)}</p>
        </div>
        <div className="cms-panel p-3">
          <p className="text-[10px] uppercase text-muted-foreground tracking-wider">Net</p>
          <p className={`font-mono text-lg font-bold ${summary.net >= 0 ? "cms-amount-positive" : "cms-amount-negative"}`}>
            {summary.net >= 0 ? "+" : ""}{formatCurrency(summary.net)}
          </p>
        </div>
      </div>

      {/* Per provider — Deposit / Withdrawal / Net */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-6">
        {PROVIDERS.map(p => {
          const v = summary.perProvider[p.value];
          const net = v.in - v.out;
          return (
            <div key={p.value} className="cms-panel p-2">
              <div className="flex items-center justify-between mb-1">
                <span className={`text-[10px] font-mono uppercase px-1.5 py-0.5 rounded ${PROVIDER_COLORS[p.value]}`}>{p.label}</span>
              </div>
              <p className="font-mono text-[10px] text-muted-foreground">Deposit: <span className="cms-amount-positive">{formatCurrency(v.in)}</span></p>
              <p className="font-mono text-[10px] text-muted-foreground">Withdrawal: <span className="cms-amount-negative">{formatCurrency(v.out)}</span></p>
              <p className="font-mono text-[10px] text-muted-foreground">Net: <span className={net >= 0 ? "cms-amount-positive" : "cms-amount-negative"}>{net >= 0 ? "+" : ""}{formatCurrency(net)}</span></p>
            </div>
          );
        })}
      </div>

      {/* Entry table — every OK adds a fresh row */}
      <div className="cms-panel overflow-hidden mb-6">
        <div className="px-4 py-2 border-b border-border flex items-center justify-between">
          <h3 className="text-sm font-semibold text-card-foreground">New entries</h3>
          <Button size="sm" variant="outline" onClick={() => setDrafts(d => [...d, newDraft()])} className="h-8 gap-1.5">
            <Plus className="w-3.5 h-3.5" /> Row
          </Button>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground">
              <th className="text-left px-3 py-2">Direction</th>
              <th className="text-left px-3 py-2">Provider</th>
              <th className="text-left px-3 py-2">Player</th>
              <th className="text-right px-3 py-2">Amount (TZS)</th>
              <th className="text-left px-3 py-2">Reference</th>
              <th className="text-center px-3 py-2 w-[140px]">Action</th>
            </tr>
          </thead>
          <tbody>
            {drafts.map(d => (
              <tr key={d.uid} className="border-b border-border last:border-0">
                <td className="px-2 py-1.5">
                  <div className="inline-flex rounded-md border border-border overflow-hidden h-8">
                    <button
                      type="button"
                      onClick={() => updateDraft(d.uid, { direction: "IN" })}
                      className={`px-3 text-xs font-medium ${d.direction === "IN" ? "bg-success/15 text-success" : "text-muted-foreground"}`}
                    >Deposit</button>
                    <button
                      type="button"
                      onClick={() => updateDraft(d.uid, { direction: "OUT" })}
                      className={`px-3 text-xs font-medium ${d.direction === "OUT" ? "bg-destructive/15 text-destructive" : "text-muted-foreground"}`}
                    >Withdrawal</button>
                  </div>
                </td>
                <td className="px-2 py-1.5">
                  <Select value={d.provider} onValueChange={v => updateDraft(d.uid, { provider: v as CashlessProvider })}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Provider" /></SelectTrigger>
                    <SelectContent>
                      {PROVIDERS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </td>
                <td className="px-2 py-1.5">
                  <PlayerNameAutocomplete
                    placeholder="Search any player"
                    value={d.player_name}
                    onChange={v => updateDraft(d.uid, { player_name: v })}
                  />

                </td>
                <td className="px-2 py-1.5">
                  <NumberInput placeholder="0" value={d.amount} onChange={v => updateDraft(d.uid, { amount: v })} className="h-8 text-xs text-right" />
                </td>
                <td className="px-2 py-1.5">
                  <Input placeholder="Ref / receipt" value={d.reference} onChange={e => updateDraft(d.uid, { reference: e.target.value })} className="h-8 text-xs" />
                </td>
                <td className="px-2 py-1.5 text-center">
                  <div className="inline-flex gap-1">
                    <Button size="sm" className="h-8 px-3" onClick={() => submitDraft(d.uid)} disabled={create.isPending}>
                      OK
                    </Button>
                    {drafts.length > 1 && (
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => removeDraft(d.uid)}>
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
              <th className="text-left px-3 py-2">Type</th>
              {source === "all" && <th className="text-left px-3 py-2">Src</th>}
              <th className="text-left px-3 py-2">Provider</th>
              <th className="text-left px-3 py-2">Player</th>
              <th className="text-right px-3 py-2">Amount</th>
              <th className="text-left px-3 py-2">Ref</th>
              <th className="text-center px-3 py-2">Status</th>
              <th className="text-center px-3 py-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={source === "all" ? 9 : 8} className="text-center text-muted-foreground text-sm py-8">No cashless transactions for {isToday ? "today" : viewDate}</td></tr>
            ) : rows.map(r => (
              <tr key={r.id} className="border-b border-border last:border-0">
                <td className="px-3 py-2 text-xs font-mono text-muted-foreground">
                  {new Date(r.created_at).toLocaleTimeString("en-GB", { timeZone: "Africa/Dar_es_Salaam", hour: "2-digit", minute: "2-digit" })}
                </td>
                <td className="px-3 py-2">
                  <Badge variant={r.direction === "IN" ? "default" : "secondary"} className="text-[10px]">{r.direction === "IN" ? "Deposit" : "Withdrawal"}</Badge>
                </td>
                {source === "all" && (
                  <td className="px-3 py-2 text-[10px] uppercase font-mono text-muted-foreground">{r.cage_type === "slots" ? "Slots" : "Live"}</td>
                )}
                <td className="px-3 py-2">
                  <span className={`text-[10px] font-mono uppercase px-1.5 py-0.5 rounded ${PROVIDER_COLORS[r.provider]}`}>{r.provider}</span>
                </td>
                <td className="px-3 py-2 text-sm text-card-foreground">
                  {r.players ? `${r.players.first_name} ${r.players.last_name}` : (r.player_name || "—")}
                </td>
                <td className={`px-3 py-2 text-right font-mono text-sm ${r.direction === "IN" ? "cms-amount-positive" : "cms-amount-negative"}`}>
                  {formatCurrency(Number(r.amount))}
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{r.reference || "—"}</td>
                <td className="px-3 py-2 text-center">
                  {r.status === "approved" ? (
                    <span className="cms-status-active text-xs"><CheckCircle className="w-3 h-3 inline mr-0.5" /> Approved</span>
                  ) : r.status === "pending" ? (
                    <Badge variant="secondary" className="text-[10px]">Pending</Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px]">Recorded</Badge>
                  )}
                </td>
                <td className="px-3 py-2 text-center">
                  {r.status === "pending" && isManager && (
                    <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => setPendingApproveId(r.id)}>Approve</Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ManagerOverrideDialog
        open={!!pendingApproveId}
        onClose={() => setPendingApproveId(null)}
        onConfirm={() => {
          if (pendingApproveId) {
            approve.mutate(pendingApproveId);
            setPendingApproveId(null);
          }
        }}
        title="Approve Cashless"
        description="Manager authentication required to approve this cashless transaction."
        actionType="APPROVE_EXPENSE"
        actionDetails={{ cashless_id: pendingApproveId }}
      />
    </div>
  );
};

export default Cashless;
