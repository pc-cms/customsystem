import { useEffect, useMemo, useState } from "react";
import { ClipboardPen, Lock, Unlock, Check, AlertTriangle, ChevronLeft, ChevronRight } from "lucide-react";
import { PageShell, PageSection } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import FinanceCasinoSwitcher from "@/components/finances/FinanceCasinoSwitcher";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ResponsiveDialog, ResponsiveDialogFooter } from "@/components/ui/responsive-dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  useDayClosingList,
  useUpsertDayClosing,
  useLockDayClosing,
  useShiftsTablesResultForDate,
  useSlotsAutoForDate,
} from "@/hooks/use-fin";
import { formatNumberSpaces } from "@/lib/currency";
import { fmtDate } from "@/lib/format-date";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function buildMonthDates(year: number, month: number): string[] {
  // month is 1-12; returns descending list of YYYY-MM-DD for that month, capped to today.
  const out: string[] = [];
  const last = new Date(year, month, 0).getDate();
  const today = new Date(); today.setHours(0,0,0,0);
  for (let d = last; d >= 1; d--) {
    const dt = new Date(year, month - 1, d);
    if (dt > today) continue;
    const iso = `${year}-${String(month).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
    out.push(iso);
  }
  return out;
}

type RowState = { tables: string; slots: string; comment: string };

const parseAmountInput = (value: string): number => {
  const raw = value.replace(/\s+/g, "").replace(",", ".");
  if (!raw || raw === "-" || raw === "." || raw === "-.") return 0;
  return Number(raw) || 0;
};

const formatAmountInput = (value: string): string => {
  const trimmed = value.trimStart();
  const sign = trimmed.startsWith("-") ? "-" : "";
  const cleaned = trimmed.replace(/[^\d.,]/g, "").replace(",", ".");
  const [integer = "", decimal] = cleaned.split(".");
  const digits = integer.replace(/\D/g, "");
  const formattedInteger = digits.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const suffix = decimal !== undefined ? `.${decimal.replace(/\D/g, "")}` : "";
  return `${sign}${formattedInteger}${suffix}`;
};

const amountToneClass = (value: number) =>
  value > 0 ? "cms-amount-positive" : value < 0 ? "cms-amount-negative" : "text-muted-foreground";

export default function DayClosingsTab() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const dates = useMemo(() => buildMonthDates(year, month), [year, month]);
  const { data: list = [] } = useDayClosingList();
  const { isManager } = useAuth() as any;

  const byDate = useMemo(() => {
    const m = new Map<string, any>();
    (list as any[]).forEach((r) => m.set(r.business_date, r));
    return m;
  }, [list]);

  const shiftMonth = (delta: number) => {
    const d = new Date(year, month - 1 + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth() + 1);
  };

  return (
    <PageShell>
      <PageHeader
        icon={ClipboardPen}
        title="Day Closings"
        subtitle="Manual entry per business day · auto values shown in grey"
      >
        <FinanceCasinoSwitcher allowNetwork={false} />
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => shiftMonth(-1)}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Input
            type="month"
            value={`${year}-${String(month).padStart(2,"0")}`}
            onChange={(e) => {
              const [y, m] = e.target.value.split("-").map(Number);
              if (y && m) { setYear(y); setMonth(m); }
            }}
            className="h-8 w-[150px]"
          />
          <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => shiftMonth(1)}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </PageHeader>

      <PageSection bodyClassName="p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left px-3 py-2 w-32">Date</th>
              <th className="text-right px-3 py-2 w-48">Tables</th>
              <th className="text-right px-3 py-2 w-48">Slots</th>
              <th className="text-left px-3 py-2">Comment</th>
              <th className="text-right px-3 py-2 w-32"></th>
            </tr>
          </thead>
          <tbody>
            {dates.map((date) => (
              <DayRow
                key={date}
                date={date}
                existing={byDate.get(date)}
                managerOverride={!!isManager}
              />
            ))}
          </tbody>
        </table>
      </PageSection>
    </PageShell>
  );
}

function DayRow({
  date,
  existing,
  managerOverride,
}: {
  date: string;
  existing: any;
  managerOverride: boolean;
}) {
  const { data: tablesAuto = 0 } = useShiftsTablesResultForDate(date);
  const { data: slotsAuto = 0 } = useSlotsAutoForDate(date);
  const upsert = useUpsertDayClosing();
  const lock = useLockDayClosing();

  const locked = !!existing?.locked_at;
  const [unlocked, setUnlocked] = useState(false);
  const editable = !locked || (managerOverride && unlocked);

  const [state, setState] = useState<RowState>(() => ({
    tables: existing?.tables_result != null ? formatNumberSpaces(existing.tables_result) : "",
    slots: existing?.slots_result != null ? formatNumberSpaces(existing.slots_result) : "",
    comment: existing?.notes ?? "",
  }));

  // Re-sync when `existing` arrives/changes from the query (initial undefined → loaded).
  useEffect(() => {
    setState({
      tables: existing?.tables_result != null ? formatNumberSpaces(existing.tables_result) : "",
      slots: existing?.slots_result != null ? formatNumberSpaces(existing.slots_result) : "",
      comment: existing?.notes ?? "",
    });
  }, [existing?.id, existing?.tables_result, existing?.slots_result, existing?.notes]);

  const tablesNum = state.tables === "" ? tablesAuto : parseAmountInput(state.tables);
  const slotsNum = state.slots === "" ? slotsAuto : parseAmountInput(state.slots);

  const dT = Math.abs(tablesNum - tablesAuto);
  const dS = Math.abs(slotsNum - slotsAuto);
  const needsNote = dT > 1 || dS > 1;

  const [varianceOpen, setVarianceOpen] = useState(false);
  const [varianceNote, setVarianceNote] = useState("");

  const doSave = async (noteOverride?: string) => {
    const finalComment = noteOverride ?? state.comment;
    try {
      await upsert.mutateAsync({
        id: existing?.id,
        business_date: date,
        tables_result: tablesNum,
        slots_result: slotsNum,
        notes: finalComment || null,
      });
      if (existing?.id) {
        await lock.mutateAsync({
          id: existing.id,
          varianceNote: needsNote ? (finalComment || "").trim() : null,
        });
        toast.success("Day closed");
      } else {
        toast.success("Saved — press OK again to lock");
      }
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const onOk = () => {
    if (needsNote && (state.comment || "").trim().length < 3) {
      setVarianceNote(state.comment || "");
      setVarianceOpen(true);
      return;
    }
    doSave();
  };

  return (
    <>
    <tr className={cn("border-t border-border", locked && !unlocked && "bg-muted/30", needsNote && editable && "bg-amber-500/5")}>
      <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">{fmtDate(date)}</td>

      <td className="px-3 py-2 text-right">
        <Input
          type="text"
          inputMode="decimal"
          disabled={!editable}
          placeholder={formatNumberSpaces(tablesAuto)}
          value={state.tables}
          onChange={(e) => setState((s) => ({ ...s, tables: formatAmountInput(e.target.value) }))}
          className={cn("text-right font-mono h-8", state.tables !== "" && amountToneClass(tablesNum))}
        />
        <div className={cn("text-[10px] mt-0.5 text-right pr-1", amountToneClass(tablesAuto))}>
          auto {formatNumberSpaces(tablesAuto)}
        </div>
      </td>

      <td className="px-3 py-2 text-right">
        <Input
          type="text"
          inputMode="decimal"
          disabled={!editable}
          placeholder={formatNumberSpaces(slotsAuto)}
          value={state.slots}
          onChange={(e) => setState((s) => ({ ...s, slots: formatAmountInput(e.target.value) }))}
          className={cn("text-right font-mono h-8", state.slots !== "" && amountToneClass(slotsNum))}
        />
        <div className={cn("text-[10px] mt-0.5 text-right pr-1", amountToneClass(slotsAuto))}>
          auto {formatNumberSpaces(slotsAuto)}
        </div>
      </td>

      <td className="px-3 py-2">
        <Input
          disabled={!editable}
          value={state.comment}
          placeholder="Optional"
          onChange={(e) => setState((s) => ({ ...s, comment: e.target.value }))}
          className="h-8 text-xs"
        />
      </td>

      <td className="px-3 py-2 text-right">
        {locked && !unlocked && (
          <div className="flex items-center justify-end gap-1">
            <span className="text-[10px] text-muted-foreground">
              Locked {existing?.locked_at ? fmtDate(existing.locked_at) : ""}
            </span>
            {managerOverride && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0"
                onClick={() => setUnlocked(true)}
                title="Manager unlock"
              >
                <Unlock className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>
        )}
        {editable && (
          <Button
            size="sm"
            variant="default"
            className="h-8"
            onClick={onOk}
            disabled={upsert.isPending || lock.isPending}
          >
            {existing?.id ? <Lock className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />}
            <span className="ml-1">OK</span>
          </Button>
        )}
      </td>
    </tr>

    <ResponsiveDialog
      open={varianceOpen}
      onOpenChange={setVarianceOpen}
      size="md"
      title={
        <span className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-500" />
          Variance vs auto
        </span>
      }
      description={`Tables Δ ${formatNumberSpaces(dT)} · Slots Δ ${formatNumberSpaces(dS)}. Please explain why entered values differ from cage actuals.`}
    >
      <Textarea
        value={varianceNote}
        onChange={(e) => setVarianceNote(e.target.value)}
        placeholder="Reason (min 3 characters)…"
        rows={3}
        autoFocus
      />
      <ResponsiveDialogFooter>
        <Button variant="outline" onClick={() => setVarianceOpen(false)}>Cancel</Button>
        <Button
          disabled={varianceNote.trim().length < 3 || upsert.isPending || lock.isPending}
          onClick={() => {
            setState((s) => ({ ...s, comment: varianceNote.trim() }));
            setVarianceOpen(false);
            doSave(varianceNote.trim());
          }}
        >
          Save &amp; Lock
        </Button>
      </ResponsiveDialogFooter>
    </ResponsiveDialog>
    </>
  );
}
