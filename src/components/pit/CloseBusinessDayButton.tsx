import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NumberInput } from "@/components/ui/number-input";
import { ResponsiveDialog, ResponsiveDialogFooter } from "@/components/ui/responsive-dialog";
import {
  Lock, AlertTriangle, CheckCircle2, XCircle, ChevronDown, ChevronRight,
} from "lucide-react";
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
import { cn } from "@/lib/utils";

/**
 * Close the current business day — the ONE canonical way a day is closed.
 *
 * The operator enters the four mandatory day figures (Drop Slots, Net Win,
 * CashDesk Win, Client Balance) plus optional JP, and sees a live checklist of
 * blocking conditions (cage shift, slots shift, tables, sessions/visits).
 * Confirmation always requires manager credentials.
 *
 * Roles here MUST match the DB check inside close_business_day_with_figures:
 * manage.ops (manager / shift_manager / general_manager / super_admin) OR pit.
 */

/** Roles that are actually allowed to close the day (mirrors the DB check). */
export const CLOSE_DAY_ROLES = [
  "manager",
  "shift_manager",
  "general_manager",
  "super_admin",
  "pit",
] as const;

export function useCanCloseBusinessDay() {
  const { roles } = useAuth();
  return roles.some((r) => (CLOSE_DAY_ROLES as readonly string[]).includes(r));
}

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

const FIELD_CLASS =
  "flex h-[var(--density-input,2.5rem)] w-full rounded-md border border-input bg-background px-3 py-2 " +
  "text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none " +
  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 font-mono tabular-nums text-right";

function FigureField({
  id, label, hint, value, onChange, allowNegative,
}: {
  id: string;
  label: string;
  hint: string;
  value: number | null;
  onChange: (v: number | null) => void;
  allowNegative?: boolean;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs" title={hint}>{label}</Label>
      <NumberInput
        id={id}
        value={value}
        onValueChange={onChange}
        allowNegative={allowNegative}
        placeholder="0"
        title={hint}
        className={FIELD_CLASS}
      />
    </div>
  );
}


export function CloseBusinessDayButton({ className }: { className?: string }) {
  const canSee = useCanCloseBusinessDay();
  const { data: currentDate } = useEffectiveBusinessDate();
  const { data: lastClosure } = useLastBusinessDayClosure();
  const { data: openCycles } = useOpenCyclesForDay();
  const closeMut = useCloseBusinessDayWithFigures();

  const [open, setOpen] = useState(false);
  const [askPassword, setAskPassword] = useState(false);
  const [showConditions, setShowConditions] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [targetDate, setTargetDate] = useState<string>("");

  const { data: tablesResultAuto = 0 } = useShiftsTablesResultForDate(targetDate || currentDate);


  const [dropSlots, setDropSlots] = useState<number | null>(null);
  const [netWin, setNetWin] = useState<number | null>(null);
  const [cashDeskWin, setCashDeskWin] = useState<number | null>(null);
  const [clientBalance, setClientBalance] = useState<number | null>(null);
  const [jpIn, setJpIn] = useState<number | null>(null);
  const [notes, setNotes] = useState("");

  const figures = useMemo(
    () => ({ dropSlots, netWin, cashDeskWin, clientBalance }),
    [dropSlots, netWin, cashDeskWin, clientBalance],
  );

  if (!canSee) return null;

  const effectiveDate = targetDate || currentDate || "";
  // Recording figures for an earlier (already closed) day never depends on
  // today's open cycles — it only writes into Day Closings.
  const isBackfill = !!currentDate && !!effectiveDate && effectiveDate !== currentDate;

  const c = openCycles;
  const cageOk = isBackfill || !c?.open_cage_shifts?.length;
  const slotsOk = isBackfill || !c?.open_slots_shifts?.length;
  const tablesOk = isBackfill || !c?.open_tables?.length;
  const sessionsOk = isBackfill || (!c?.active_sessions?.length && !c?.open_visits?.length);
  const figuresOk = Object.values(figures).every((v) => v !== null);
  const conditions = [cageOk, slotsOk, tablesOk, sessionsOk, figuresOk];
  const passed = conditions.filter(Boolean).length;
  const canClose = passed === conditions.length;
  const conditionsOpen = showConditions || !canClose;

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
        jpIn,
        notes: notes.trim() || undefined,
        businessDate: effectiveDate || null,
      });
      setDropSlots(null); setNetWin(null); setCashDeskWin(null); setClientBalance(null);
      setJpIn(null); setNotes(""); setTargetDate("");
    } catch {
      /* toast already shown by the mutation */
    }
  };


  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className={cn("gap-1.5", className)}
      >
        <Lock className="h-3.5 w-3.5" />
        Close Day
      </Button>

      <ResponsiveDialog
        open={open}
        onOpenChange={setOpen}
        size="table"
        title={
          <span className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            {isBackfill ? `Record day figures ${effectiveDate}` : `Close business day ${effectiveDate}`}
          </span>
        }
      >
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          {/* LEFT — conditions, table result, last closure */}
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="cbd-date" className="text-xs">Business date</Label>
              <input
                id="cbd-date"
                type="date"
                value={effectiveDate}
                max={currentDate || undefined}
                onChange={(e) => setTargetDate(e.target.value)}
                className={cn(FIELD_CLASS, "text-left")}
              />
              {isBackfill && (
                <p className="text-xs text-muted-foreground">
                  Day already closed — figures will be saved into Day Closings only.
                </p>
              )}
            </div>

            <button

              type="button"
              onClick={() => setShowConditions((v) => !v)}
              disabled={!canClose}
              className={cn(
                "flex w-full items-center justify-between rounded-md border px-3 py-2 text-sm",
                canClose
                  ? "border-emerald-600/40 text-emerald-600"
                  : "border-destructive/40 text-destructive",
              )}
            >
              <span className="flex items-center gap-2 font-medium">
                {canClose ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                Conditions {passed}/{conditions.length} {canClose ? "OK" : "blocked"}
              </span>
              {canClose && (conditionsOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />)}
            </button>

            {conditionsOpen && (
              <div className="space-y-2 rounded-md border border-border px-3 py-2">
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
            )}

            <div className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
              <span className="text-muted-foreground">Table Result (auto)</span>
              <span className="font-mono tabular-nums">{formatNumberSpaces(Math.round(tablesResultAuto))}</span>
            </div>

            <p className="text-xs text-amber-700 dark:text-amber-400 font-medium">
              Manager credentials are required to confirm.
            </p>
            {lastClosure && (
              <p className="text-xs text-muted-foreground">
                Last closure: {lastClosure.business_date} ({lastClosure.closed_method === "manual" ? "manual" : "auto"})
              </p>
            )}
          </div>

          {/* RIGHT — the figures */}
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <FigureField
                id="cbd-drop-slots" label="Drop Slots" hint="→ Statistics · Slots — Drop"
                value={dropSlots} onChange={setDropSlots}
              />
              <FigureField
                id="cbd-net-win" label="Net Win" hint="→ Statistics · Slots — Net Win"
                value={netWin} onChange={setNetWin} allowNegative
              />
              <FigureField
                id="cbd-cashdesk-win" label="CashDesk Win" hint="→ Slots — Cashdesk · Day Closing"
                value={cashDeskWin} onChange={setCashDeskWin} allowNegative
              />
              <FigureField
                id="cbd-client-balance" label="Card Balance" hint="→ Slots — Card Balance · Day Closing"
                value={clientBalance} onChange={setClientBalance} allowNegative
              />
              <FigureField
                id="cbd-jp-in" label="JP — optional" hint="→ Office · Day Closings — JP (income)"
                value={jpIn} onChange={setJpIn} allowNegative
              />
            </div>

            <button
              type="button"
              onClick={() => setShowNotes((v) => !v)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              {showNotes ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              Notes &amp; details
            </button>
            {showNotes && (
              <div className="space-y-2">
                <Textarea id="cbd-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes" />
                <ul className="list-disc pl-5 space-y-1 text-muted-foreground text-xs">
                  <li>Figures overwrite the day's slots shift and Day Closings immediately.</li>
                  <li>Table Result is never taken from this form — it is computed automatically.</li>
                  <li>Operational filters (Pit, Cashier, Reception) advance to the next day.</li>
                </ul>
              </div>
            )}
          </div>
        </div>

        <ResponsiveDialogFooter className="sticky bottom-0 z-10 -mx-6 -mb-6 mt-4 border-t border-border bg-background px-6 py-3 sm:-mx-6 sm:-mb-6">
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
        description={`Enter manager credentials to ${isBackfill ? "record figures for" : "close"} business day ${effectiveDate}.`}
        actionType="BUSINESS_DAY_CLOSE_CONFIRM"
        actionDetails={{ business_date: effectiveDate, ...figures }}
      />
    </>
  );
}
