/**
 * /cage/closings — manager surface listing recent closed cage shifts with a
 * "Reopen" action. Reopening sets the shift back to status='open' so the
 * existing Close Shift wizard can be re-used to enter the corrected closing
 * counts. Manager password is required (audited via system_logs).
 */
import { useMemo, useState } from "react";
import { useSessionState } from "@/hooks/use-session-state";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { addDays } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Landmark, RotateCcw, AlertTriangle, Printer } from "lucide-react";
import { formatNumberSpaces } from "@/lib/currency";
import { fmtDate, fmtDateOnly } from "@/lib/format-date";
import ManagerOverrideDialog from "@/components/ManagerOverrideDialog";
import ReprintShiftDialog from "@/components/cage/ReprintShiftDialog";
import { toast } from "sonner";
import { DateRangePresets, type DatePreset, presetRange } from "@/components/ui/date-range-presets";

const CageClosingsPage = () => {
  const nav = useNavigate();
  const { casinoId, roles } = useAuth();
  const qc = useQueryClient();
  const [pendingShift, setPendingShift] = useState<any | null>(null);
  const [reprintShiftId, setReprintShiftId] = useState<string | null>(null);

  // Unified Day/Week/Month/Year/Custom picker.
  const initial = useMemo(() => presetRange("month"), []);
  const [preset, setPreset] = useSessionState<DatePreset>("preset", "month");
  const [from, setFrom] = useSessionState<string>("from", initial.from);
  const [to, setTo] = useSessionState<string>("to", initial.to);
  const periodLabel = `${fmtDateOnly(from)} – ${fmtDateOnly(to)}`;
  const rangeStartIso = new Date(from + "T00:00:00").toISOString();
  const rangeEndIso = addDays(new Date(to + "T00:00:00"), 1).toISOString();

  const isManager = roles.includes("manager") || roles.includes("super_admin") || roles.includes("finance_manager");

  const { data: shifts = [], isLoading } = useQuery({
    queryKey: ["closed-shifts", casinoId, rangeStartIso, rangeEndIso],
    queryFn: async () => {
      if (!casinoId) return [];
      const { data, error } = await supabase
        .from("shifts")
        .select("id, opened_at, closed_at, cash_result, miss_total, shift_result, tables_result, cash_desk_result, balance, notes, opened_by, closed_by, opening_float, closing_cash, closing_count")
        .eq("casino_id", casinoId)
        .eq("status", "closed")
        .gte("closed_at", rangeStartIso)
        .lt("closed_at", rangeEndIso)
        .order("closed_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data || [];
    },
    enabled: !!casinoId,
  });

  const reopen = useMutation({
    mutationFn: async ({ shiftId, reason }: { shiftId: string; reason: string }) => {
      const { data, error } = await (supabase as any).rpc("reopen_shift", {
        _shift_id: shiftId,
        _reason: reason,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["closed-shifts"] });
      qc.invalidateQueries({ queryKey: ["active-shift"] });
      toast.success("Shift reopened — re-enter closing in Cage");
      nav("/cage/close-shift");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <PageShell>
      <PageHeader
        icon={Landmark}
        title="Cage Closings"
        subtitle={`Manager-only · Reopen a closed shift to correct the closing count · ${periodLabel}`}
        centerSlot={
          <DateRangePresets
            preset={preset}
            from={from}
            to={to}
            onChange={(n) => { setPreset(n.preset); setFrom(n.from); setTo(n.to); }}
          />
        }
      >
        <Button variant="outline" size="sm" onClick={() => nav("/cage")}>Back to Cage</Button>
      </PageHeader>

      {!isManager && (
        <div className="flex items-center gap-2 p-3 rounded-lg border border-destructive/30 bg-destructive/5">
          <AlertTriangle className="w-4 h-4 text-destructive" />
          <p className="text-xs">Manager privileges required to reopen a closed shift.</p>
        </div>
      )}

      <div className="cms-panel">
        <div className="cms-header">Closed Shifts · {periodLabel} ({shifts.length})</div>
        <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-card z-10">
              <tr className="border-b border-border">
                {["Opened", "Closed", "Cash Result", "Miss", "Tables Result", "Balance", "Notes", ""].map(h => (
                  <th key={h} className={`px-3 py-2 font-medium text-muted-foreground uppercase ${["Cash Result","Miss","Tables Result","Balance"].includes(h) ? "text-right" : "text-left"}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={8} className="text-center text-muted-foreground py-6">Loading…</td></tr>
              ) : shifts.length === 0 ? (
                <tr><td colSpan={8} className="text-center text-muted-foreground py-6">No closed shifts</td></tr>
              ) : shifts.map((s: any) => {
                const closedDate = s.closed_at ? new Date(s.closed_at) : null;
                // Canonical values from the new DB trigger
                // (`compute_shift_balance` mirror). Fallback to legacy
                // inline math only if columns are NULL on very old rows.
                const cc = (s.closing_cash || {}) as any;
                const cashDeltaSnap = Number(cc.cash_delta);
                const rawCash = Number(s.cash_result || 0);
                const cash = Number.isFinite(cashDeltaSnap) ? cashDeltaSnap : rawCash;
                const miss = Number(s.miss_total || 0);
                const ccObj = (s.closing_count || {}) as any;
                const fallbackTbl = Number(ccObj.result_table);
                const tablesResult =
                  s.tables_result != null ? Number(s.tables_result) :
                  Number.isFinite(fallbackTbl) ? fallbackTbl :
                  Number(s.shift_result || 0);
                const cashDeskResult = s.cash_desk_result != null
                  ? Number(s.cash_desk_result)
                  : null;
                const balance = s.balance != null
                  ? Number(s.balance)
                  : (cashDeskResult != null
                      ? cashDeskResult - tablesResult - miss
                      : tablesResult - cash - miss);
                const cleanNotes = String(s.notes || "")
                  .split(/\s*\|\s*(?:TABLES|CASH|MISS|BALANCE|RESULT|DIFF|mgr)\b/i)[0]
                  .trim();
                return (
                  <tr key={s.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                    <td className="px-3 py-2 font-mono text-[11px] text-muted-foreground">
                      {s.opened_at ? new Date(s.opened_at).toLocaleString("en-GB", { timeZone: "Africa/Dar_es_Salaam", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}
                    </td>
                    <td className="px-3 py-2 font-mono">
                      {closedDate ? (
                        <div className="flex flex-col">
                          <span>{fmtDate(closedDate.toISOString().slice(0,10))}</span>
                          <span className="text-[10px] text-muted-foreground">{closedDate.toLocaleTimeString("en-GB", { timeZone: "Africa/Dar_es_Salaam", hour: "2-digit", minute: "2-digit" })}</span>
                        </div>
                      ) : "—"}
                    </td>
                    <td className={`px-3 py-2 text-right font-mono ${cash >= 0 ? "cms-amount-positive" : "cms-amount-negative"}`}>
                      {formatNumberSpaces(cash)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-muted-foreground">{formatNumberSpaces(miss)}</td>
                    <td className={`px-3 py-2 text-right font-mono font-semibold ${tablesResult >= 0 ? "cms-amount-positive" : "cms-amount-negative"}`}>
                      {formatNumberSpaces(tablesResult)}
                    </td>
                    <td
                      className={`px-3 py-2 text-right font-mono ${balance === 0 ? "text-muted-foreground" : "cms-amount-negative font-semibold"}`}
                      title="Cash Desk Result − Tables Result − Miss. Cash Desk Result = ΔCash + Expenses + Collection − AddFloat + SlotsOut − SlotsIn"
                    >
                      {balance === 0 ? "0" : `${balance > 0 ? "+" : ""}${formatNumberSpaces(balance)}`}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground truncate max-w-[280px]">{cleanNotes || "—"}</td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex justify-end gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1 h-7 text-[11px]"
                          onClick={() => setReprintShiftId(s.id)}
                        >
                          <Printer className="w-3 h-3" /> Print
                        </Button>
                        {isManager && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1 h-7 text-[11px]"
                            onClick={() => setPendingShift(s)}
                            disabled={reopen.isPending}
                          >
                            <RotateCcw className="w-3 h-3" /> Reopen
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {pendingShift && (
        <ManagerOverrideDialog
          open={true}
          onClose={() => setPendingShift(null)}
          title="Reopen Closed Shift"
          description={`This will set the shift back to OPEN so the closing count can be re-entered. The previous closing snapshot will be saved in the audit log.`}
          actionType="SHIFT_REOPEN_REQUEST"
          actionDetails={{ shift_id: pendingShift.id, closed_at: pendingShift.closed_at }}
          onConfirm={() => {
            const id = pendingShift.id;
            setPendingShift(null);
            reopen.mutate({ shiftId: id, reason: "Manager edit — reopen closed shift" });
          }}
        />
      )}

      {reprintShiftId && casinoId && (
        <ReprintShiftDialog
          open={true}
          onClose={() => setReprintShiftId(null)}
          shiftId={reprintShiftId}
          casinoId={casinoId}
        />
      )}
    </PageShell>
  );
};

export default CageClosingsPage;
