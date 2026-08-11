import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ResponsiveDialog, ResponsiveDialogFooter } from "@/components/ui/responsive-dialog";
import { Lock, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import {
  useCloseBusinessDayWithFigures,
  useEffectiveBusinessDate,
  useLastBusinessDayClosure,
  useOpenCyclesForDay,
} from "@/hooks/use-business-day-closure";
import ManagerOverrideDialog from "@/components/ManagerOverrideDialog";
import { useShiftsTablesResultForDate } from "@/hooks/use-fin";
import { formatNumberSpaces } from "@/lib/currency";

/**
 * Close the current business day.
 *
 * Flow: the button is always clickable. Inside the dialog the operator enters
 * the four mandatory day figures (Drop Slots, Net Win, CashDesk Win, Client
 * Balance) and sees a live checklist of blocking conditions:
 *   - cage (tables) shift closed
 *   - cage slots shift closed
 *   - all gaming tables closed
 *   - no active player sessions / open visits
 * Confirmation always requires manager password. On success the four figures
 * are written into the day's closed slots shift (Statistics → Slots) and into
 * Day Closings; Table Result stays auto-computed from the closed table shifts.
 */


const parseNum = (s: string): number | null => {
  const clean = s.replace(/\s/g, "").replace(",", ".");
  if (clean === "" || clean === "-") return null;
  const n = Number(clean);
  return Number.isFinite(n) ? n : null;
};

function ConditionRow({ ok, label, detail }: { ok: boolean; label: string; detail?: string }) {
  return (
    <div className="flex items-start gap-2 text-sm">
      {ok ? (
        <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
      ) : (
        <XCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
      )}
      <span className={ok ? "text-muted-foreground" : "font-medium"}>
        {label}
        {!ok && detail ? <span className="text-muted-foreground font-normal"> — {detail}</span> : null}
      </span>
    </div>
  );
}

export function CloseBusinessDayButton() {
  const { roles } = useAuth();
  const { data: currentDate } = useEffectiveBusinessDate();
  const { data: lastClosure } = useLastBusinessDayClosure();
  const { data: openCycles } = useOpenCyclesForDay();
  const closeMut = useCloseBusinessDayWithFigures();
  const { data: tablesResultAuto = 0 } = useShiftsTablesResultForDate(currentDate);

  const [open, setOpen] = useState(false);
  const [askPassword, setAskPassword] = useState(false);

  const [dropSlots, setDropSlots] = useState("");
  const [netWin, setNetWin] = useState("");
  const [cashDeskWin, setCashDeskWin] = useState("");
  const [clientBalance, setClientBalance] = useState("");
  const [jpIn, setJpIn] = useState("");
  const [notes, setNotes] = useState("");


  const canSee = roles.some(r =>
    ["cashier", "cashier_slots", "manager", "pit", "finance_manager", "super_admin"].includes(r)
  );

  const figures = useMemo(() => ({
    dropSlots: parseNum(dropSlots),
    netWin: parseNum(netWin),
    cashDeskWin: parseNum(cashDeskWin),
    clientBalance: parseNum(clientBalance),
  }), [dropSlots, netWin, cashDeskWin, clientBalance]);

  if (!canSee) return null;

  const c = openCycles;
  const cageOk = !c?.open_cage_shifts?.length;
  const slotsOk = !c?.open_slots_shifts?.length;
  const tablesOk = !c?.open_tables?.length;
  const sessionsOk = !c?.active_sessions?.length && !c?.open_visits?.length;
  const figuresOk = Object.values(figures).every(v => v !== null);
  const canClose = cageOk && slotsOk && tablesOk && sessionsOk && figuresOk;

  const handleProceed = () => {
    setOpen(false);
    setAskPassword(true);
  };

  const handleManagerVerified = async () => {
    setAskPassword(false);
    try {
      await closeMut.mutateAsync({
        dropSlots: figures.dropSlots as number,
        netWin: figures.netWin as number,
        cashDeskWin: figures.cashDeskWin as number,
        clientBalance: figures.clientBalance as number,
        notes: notes.trim() || undefined,
      });
      setDropSlots(""); setNetWin(""); setCashDeskWin(""); setClientBalance(""); setNotes("");
    } catch {
      /* toast already shown */
    }
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} className="gap-1.5">
        <Lock className="h-3.5 w-3.5" />
        Close Day
      </Button>

      <ResponsiveDialog
        open={open}
        onOpenChange={setOpen}
        size="md"
        title={
          <span className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            Close business day {currentDate || ""}
          </span>
        }
      >
        <div className="space-y-4 text-sm">
          <div className="space-y-2">
            <p className="font-medium">Conditions</p>
            <ConditionRow ok={cageOk} label="Cage shift closed" detail={`${c?.open_cage_shifts?.length || 0} open`} />
            <ConditionRow ok={slotsOk} label="Cage Slots shift closed" detail={`${c?.open_slots_shifts?.length || 0} open`} />
            <ConditionRow
              ok={tablesOk}
              label="All gaming tables closed"
              detail={(c?.open_tables || []).map((t: any) => t.name).join(", ")}
            />
            <ConditionRow
              ok={sessionsOk}
              label="No active sessions / open visits"
              detail={`${c?.active_sessions?.length || 0} sessions, ${c?.open_visits?.length || 0} visits`}
            />
            <ConditionRow ok={figuresOk} label="All four figures entered" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cbd-drop-slots">Drop Slots</Label>
              <Input id="cbd-drop-slots" inputMode="decimal" value={dropSlots}
                onChange={e => setDropSlots(e.target.value)} placeholder="0" />
              <p className="text-[11px] text-muted-foreground">→ Statistics · Slots — Drop</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cbd-net-win">Net Win</Label>
              <Input id="cbd-net-win" inputMode="decimal" value={netWin}
                onChange={e => setNetWin(e.target.value)} placeholder="0" />
              <p className="text-[11px] text-muted-foreground">→ Statistics · Slots — Net Win</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cbd-cashdesk-win">CashDesk Win</Label>
              <Input id="cbd-cashdesk-win" inputMode="decimal" value={cashDeskWin}
                onChange={e => setCashDeskWin(e.target.value)} placeholder="0" />
              <p className="text-[11px] text-muted-foreground">→ Slots — Cashdesk · Day Closing</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cbd-client-balance">Client Balance</Label>
              <Input id="cbd-client-balance" inputMode="decimal" value={clientBalance}
                onChange={e => setClientBalance(e.target.value)} placeholder="0" />
              <p className="text-[11px] text-muted-foreground">→ Slots — Client Balance · Day Closing</p>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
            <span className="text-muted-foreground">Table Result (auto, from closed tables)</span>
            <span className="font-mono tabular-nums">{formatNumberSpaces(Math.round(tablesResultAuto))}</span>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cbd-notes">Notes (optional)</Label>
            <Textarea id="cbd-notes" rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
          </div>

          <ul className="list-disc pl-5 space-y-1 text-muted-foreground text-xs">
            <li>Figures overwrite the day's slots shift and Day Closings immediately.</li>
            <li>Table Result is never taken from this form — it is computed automatically.</li>
            <li>Operational filters (Pit, Cashier, Reception) advance to the next day.</li>
            <li>If you forget to close, an automatic close runs at 11:00 AM.</li>
          </ul>


          <p className="text-xs text-amber-700 dark:text-amber-400 font-medium">
            Manager password will be required to confirm.
          </p>
          {lastClosure && (
            <p className="text-xs text-muted-foreground">
              Last closure: {lastClosure.business_date} ({lastClosure.closed_method === "auto_11am" ? "auto" : "manual"})
            </p>
          )}
        </div>
        <ResponsiveDialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={closeMut.isPending}>
            Cancel
          </Button>
          <Button
            onClick={handleProceed}
            disabled={!canClose || closeMut.isPending}
            title={!canClose ? "Conditions not met" : undefined}
          >
            Continue
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialog>

      <ManagerOverrideDialog
        open={askPassword}
        onClose={() => setAskPassword(false)}
        onConfirm={handleManagerVerified}
        title="Confirm Close Business Day"
        description={`Enter manager credentials to close business day ${currentDate || ""}.`}
        actionType="BUSINESS_DAY_CLOSE_CONFIRM"
        actionDetails={{ business_date: currentDate, ...figures }}
      />
    </>
  );
}
