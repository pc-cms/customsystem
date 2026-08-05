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
  useFinWallets,
} from "@/hooks/use-fin";
import { useOtherIncomes, useAddOtherIncome } from "@/hooks/use-other-incomes";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCasino } from "@/lib/casino-context";
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

type RowState = { tables: string; slots: string; cards: string; comment: string };

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

type DayAgg = { tables: number; slots: number; missChips: number; missCards: number };

function useMonthAggregates(year: number, month: number) {
  const { activeCasinoId } = useCasino();
  return useQuery({
    queryKey: ["day-closings-month-agg", activeCasinoId, year, month],
    enabled: !!activeCasinoId,
    queryFn: async () => {
      // Build bounds from local YYYY-MM-DD strings to avoid the toISOString()
      // TZ shift that dropped the last business day of the month for UTC+ clients.
      const pad = (n: number) => String(n).padStart(2, "0");
      const lastDay = new Date(year, month, 0).getDate();
      const startDate = `${year}-${pad(month)}-01`;
      const endDateIncl = `${year}-${pad(month)}-${pad(lastDay)}`;
      const nextYear = month === 12 ? year + 1 : year;
      const nextMonth = month === 12 ? 1 : month + 1;
      const startIso = `${startDate}T04:00:00.000Z`;
      const endIso = `${nextYear}-${pad(nextMonth)}-01T04:00:00.000Z`;

      const [shifts, slots] = await Promise.all([
        supabase
          .from("shifts")
          .select("opened_at, tables_result, miss_total")
          .eq("casino_id", activeCasinoId)
          .gte("opened_at", startIso)
          .lt("opened_at", endIso),
        supabase
          .from("cage_slots_shifts")
          .select("business_date, system_shift_result, cards_miss")
          .eq("casino_id", activeCasinoId)
          .gte("business_date", startDate)
          .lte("business_date", endDateIncl),
      ]);

      const map = new Map<string, DayAgg>();
      const get = (d: string) => {
        let v = map.get(d);
        if (!v) { v = { tables: 0, slots: 0, missChips: 0, missCards: 0 }; map.set(d, v); }
        return v;
      };
      (shifts.data || []).forEach((r: any) => {
        // business day = opened_at (EAT) shifted back 7h; simpler: subtract 4h from UTC.
        const t = new Date(r.opened_at).getTime() - 4 * 3600 * 1000;
        const bd = new Date(t).toISOString().slice(0, 10);
        const g = get(bd);
        g.tables += Number(r.tables_result || 0);
        g.missChips += Number(r.miss_total || 0);
      });
      (slots.data || []).forEach((r: any) => {
        const g = get(r.business_date);
        g.slots += Number(r.system_shift_result || 0);
        g.missCards += Number(r.cards_miss || 0);
      });
      return map;
    },
  });
}

export default function DayClosingsTab() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const dates = useMemo(() => buildMonthDates(year, month), [year, month]);
  const { data: list = [] } = useDayClosingList();
  const { data: aggMap } = useMonthAggregates(year, month);
  const { isManager } = useAuth() as any;

  // JP is booked as an "other income" (source = jp) on the business date.
  const pad = (n: number) => String(n).padStart(2, "0");
  const monthFrom = `${year}-${pad(month)}-01`;
  const monthTo = `${year}-${pad(month)}-${pad(new Date(year, month, 0).getDate())}`;
  const { data: incomes = [] } = useOtherIncomes(monthFrom, monthTo);
  const { data: wallets = [] } = useFinWallets();
  // Default JP wallet: main TZS cash wallet.
  const jpWalletId = useMemo(() => {
    const w = (wallets as any[]).filter((x) => (x.currency || "TZS") === "TZS");
    return (w.find((x) => x.kind === "cash") || w[0])?.id || "";
  }, [wallets]);

  const jpByDate = useMemo(() => {
    const m = new Map<string, number>();
    (incomes as any[])
      .filter((r) => r.source === "jp")
      .forEach((r) => m.set(r.business_date, (m.get(r.business_date) || 0) + Number(r.amount || 0)));
    return m;
  }, [incomes]);

  const byDate = useMemo(() => {
    const m = new Map<string, any>();
    (list as any[]).forEach((r) => m.set(r.business_date, r));
    return m;
  }, [list]);

  const totals = useMemo(() => {
    const t = { tables: 0, slots: 0, missChips: 0, missCards: 0, cards: 0, jp: 0 };
    // dates are descending → the first non-zero card balance is the latest one.
    let cardsFound = false;
    dates.forEach((d) => {
      const existing = byDate.get(d);
      const agg = aggMap?.get(d);
      t.tables += Number(existing?.tables_result ?? agg?.tables ?? 0);
      t.slots += Number(existing?.slots_result ?? agg?.slots ?? 0);
      t.missChips += Number(agg?.missChips ?? 0);
      t.missCards += Number(agg?.missCards ?? 0);
      t.jp += Number(jpByDate.get(d) || 0);
      const cb = Math.abs(Number(existing?.players_card_balance ?? 0));
      if (!cardsFound && cb > 0) { t.cards = cb; cardsFound = true; }
    });
    return t;
  }, [dates, byDate, aggMap, jpByDate]);



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
              <th className="text-right px-3 py-2 w-44">Tables</th>
              <th className="text-right px-3 py-2 w-44">Slots</th>
              <th className="text-right px-3 py-2 w-40" title="Deposits held on player cards. Subtracted from the Slots result; the cash itself stays in the desk.">Card Balance</th>
              <th className="text-right px-3 py-2 w-36" title="Jackpot contribution booked as income (IN) on this business day.">JP (IN)</th>
              <th className="text-right px-3 py-2 w-32">Miss Chips</th>
              <th className="text-right px-3 py-2 w-32">Miss Cards</th>
              <th className="text-left px-3 py-2">Comment</th>
              <th className="text-right px-3 py-2 w-28"></th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-border bg-primary/5 font-semibold">
              <td className="px-3 py-2 text-xs uppercase tracking-wider">Totals · {MONTH_NAMES[month-1]}</td>
              <td className={cn("px-3 py-2 text-right font-mono", amountToneClass(totals.tables))}>{formatNumberSpaces(totals.tables)}</td>
              <td className={cn("px-3 py-2 text-right font-mono", amountToneClass(totals.slots - totals.cards))}>{formatNumberSpaces(totals.slots - totals.cards)}</td>
              <td className={cn("px-3 py-2 text-right font-mono", totals.cards ? "cms-amount-negative" : "text-muted-foreground")}>{totals.cards ? `− ${formatNumberSpaces(totals.cards)}` : "·"}</td>
              <td className={cn("px-3 py-2 text-right font-mono", amountToneClass(totals.jp))}>{totals.jp ? formatNumberSpaces(totals.jp) : "·"}</td>
              <td className={cn("px-3 py-2 text-right font-mono", amountToneClass(totals.missChips))}>{formatNumberSpaces(totals.missChips)}</td>
              <td className={cn("px-3 py-2 text-right font-mono", amountToneClass(totals.missCards))}>{formatNumberSpaces(totals.missCards)}</td>
              <td colSpan={2} className="px-3 py-2 text-right text-xs text-muted-foreground">
                Result: <span className={cn("font-mono", amountToneClass(totals.tables + totals.slots - totals.cards))}>{formatNumberSpaces(totals.tables + totals.slots - totals.cards)}</span>
              </td>
            </tr>
            {dates.map((date) => {

              const agg = aggMap?.get(date) || { tables: 0, slots: 0, missChips: 0, missCards: 0 };
              return (
                <DayRow
                  key={date}
                  date={date}
                  existing={byDate.get(date)}
                  managerOverride={!!isManager}
                  agg={agg}
                  jpPosted={Number(jpByDate.get(date) || 0)}
                  jpWalletId={jpWalletId}
                />
              );
            })}

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
  agg,
}: {
  date: string;
  existing: any;
  managerOverride: boolean;
  agg: DayAgg;
}) {
  const tablesAuto = agg.tables;
  const slotsAuto = agg.slots;
  const upsert = useUpsertDayClosing();
  const lock = useLockDayClosing();

  const locked = !!existing?.locked_at;
  const [unlocked, setUnlocked] = useState(false);
  const editable = !locked || (managerOverride && unlocked);

  const [state, setState] = useState<RowState>(() => ({
    tables: existing?.tables_result != null ? formatNumberSpaces(existing.tables_result) : "",
    slots: existing?.slots_result != null ? formatNumberSpaces(existing.slots_result) : "",
    cards: existing?.players_card_balance ? formatNumberSpaces(existing.players_card_balance) : "",
    comment: existing?.notes ?? "",
  }));

  useEffect(() => {
    setState({
      tables: existing?.tables_result != null ? formatNumberSpaces(existing.tables_result) : "",
      slots: existing?.slots_result != null ? formatNumberSpaces(existing.slots_result) : "",
      cards: existing?.players_card_balance ? formatNumberSpaces(existing.players_card_balance) : "",
      comment: existing?.notes ?? "",
    });
  }, [existing?.id, existing?.tables_result, existing?.slots_result, existing?.players_card_balance, existing?.notes]);

  const tablesNum = state.tables === "" ? tablesAuto : parseAmountInput(state.tables);
  const slotsNum = state.slots === "" ? slotsAuto : parseAmountInput(state.slots);
  // Players Card Balance: deposits held on player cards — always >= 0.
  const cardsNum = Math.abs(state.cards === "" ? 0 : parseAmountInput(state.cards));

  const dT = Math.abs(tablesNum - tablesAuto);
  const dS = Math.abs(slotsNum - slotsAuto);
  const needsNote = dT > 1 || dS > 1;


  const [varianceOpen, setVarianceOpen] = useState(false);
  const [varianceNote, setVarianceNote] = useState("");

  const doSave = async (noteOverride?: string) => {
    const finalComment = noteOverride ?? state.comment;
    const tid = `day-${date}`;
    try {
      const saved = await upsert.mutateAsync({
        id: existing?.id,
        business_date: date,
        tables_result: tablesNum,
        slots_result: slotsNum,
        players_card_balance: cardsNum,
        notes: finalComment || null,
      });
      const rowId = existing?.id ?? (saved as any)?.id;
      if (rowId) {
        await lock.mutateAsync({
          id: rowId,
          varianceNote: needsNote ? (finalComment || "").trim() : null,
        });
        toast.success("Day closed", { id: tid });
      } else {
        toast.success("Saved", { id: tid });
      }
    } catch (e: any) {
      toast.error(e.message, { id: tid });
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
          {cardsNum > 0 && <span className="cms-amount-negative"> · net {formatNumberSpaces(slotsNum - cardsNum)}</span>}
        </div>
      </td>

      <td className="px-3 py-2 text-right">
        <Input
          type="text"
          inputMode="decimal"
          disabled={!editable}
          placeholder="0"
          title="Deposits held on player cards (end-of-day balance). Subtracted from the Slots result."
          value={state.cards}
          onChange={(e) => setState((s) => ({ ...s, cards: formatAmountInput(e.target.value).replace("-", "") }))}
          className={cn("text-right font-mono h-8", cardsNum > 0 && "cms-amount-negative")}
        />
      </td>



      <td className={cn("px-3 py-2 text-right font-mono text-xs", amountToneClass(agg.missChips))}>
        {formatNumberSpaces(agg.missChips)}
      </td>
      <td className={cn("px-3 py-2 text-right font-mono text-xs", amountToneClass(agg.missCards))}>
        {formatNumberSpaces(agg.missCards)}
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

