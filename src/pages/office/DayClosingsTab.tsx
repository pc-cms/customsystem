import { useMemo, useState } from "react";
import {
  ClipboardPen, Lock, Unlock, Check, AlertTriangle,
  ChevronLeft, ChevronRight, Bot, CircleDashed,
} from "lucide-react";
import { PageShell, PageSection } from "@/components/layout/PageShell";
import { useOfficePeriod } from "@/components/office/office-shell";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Button } from "@/components/ui/button";
import { SmartTable, type ColumnDef } from "@/components/ui/smart-table";
import { ResponsiveDialog, ResponsiveDialogFooter } from "@/components/ui/responsive-dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  useDayClosingList,
  useUpsertDayClosing,
  useLockDayClosing,
  useFinWallets,
} from "@/hooks/use-fin";
import { useOtherIncomes, useAddOtherIncome, useUpdateOtherIncome } from "@/hooks/use-other-incomes";
import { useAceJackpotSlipOutByDate } from "@/hooks/use-ace-finance";

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCasino } from "@/lib/casino-context";
import { formatNumberSpaces } from "@/lib/currency";
import { fmtDate } from "@/lib/format-date";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { getBusinessDate } from "@/lib/business-day";

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

const pad = (n: number) => String(n).padStart(2, "0");

function buildMonthDates(year: number, month: number): string[] {
  const out: string[] = [];
  const last = new Date(year, month, 0).getDate();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  for (let d = last; d >= 1; d--) {
    const dt = new Date(year, month - 1, d);
    if (dt > today) continue;
    out.push(`${year}-${pad(month)}-${pad(d)}`);
  }
  return out;
}

const amountToneClass = (value: number) =>
  value > 0 ? "cms-amount-positive" : value < 0 ? "cms-amount-negative" : "text-muted-foreground";

type DayAgg = { tables: number; slots: number; missChips: number; missCards: number };
type Draft = { tables?: number | null; slots?: number | null; drop?: number | null; cash?: number | null; cards?: number | null; jp?: number | null; comment?: string };
type Row = {
  date: string;
  existing: any;
  agg: DayAgg;
  jpPosted: number;
  /** Existing JP contribution row of that day, edited in place. */
  jpRow?: any;
  jpRowsCount?: number;

  /** null = no business-day closure record, true = closed by a manager, false = auto-closed */
  closedByManager: boolean | null;
  hadActivity: boolean;
};

function useMonthAggregates(year: number, month: number) {
  const { activeCasinoId } = useCasino();
  return useQuery({
    queryKey: ["day-closings-month-agg", activeCasinoId, year, month],
    enabled: !!activeCasinoId,
    queryFn: async () => {
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

/** business_day_closures for the month — tells manual vs automatic closure. */
function useMonthClosures(year: number, month: number) {
  const { activeCasinoId } = useCasino();
  return useQuery({
    queryKey: ["day-closings-bdc", activeCasinoId, year, month],
    enabled: !!activeCasinoId,
    queryFn: async () => {
      const lastDay = new Date(year, month, 0).getDate();
      const { data } = await supabase
        .from("business_day_closures")
        .select("business_date, closed_by, closed_at")
        .eq("casino_id", activeCasinoId)
        .gte("business_date", `${year}-${pad(month)}-01`)
        .lte("business_date", `${year}-${pad(month)}-${pad(lastDay)}`);
      const m = new Map<string, boolean>();
      (data || []).forEach((r: any) => m.set(r.business_date, !!r.closed_by));
      return m;
    },
  });
}

export default function DayClosingsTab() {
  const { period } = useOfficePeriod();
  const year = period.year;
  const month = period.month;
  const dates = useMemo(() => buildMonthDates(year, month), [year, month]);

  const { data: list = [] } = useDayClosingList();
  const { data: aggMap } = useMonthAggregates(year, month);
  const { data: closureMap } = useMonthClosures(year, month);
  const { isManager } = useAuth() as any;

  const monthFrom = `${year}-${pad(month)}-01`;
  const monthTo = `${year}-${pad(month)}-${pad(new Date(year, month, 0).getDate())}`;
  const { data: incomes = [] } = useOtherIncomes(monthFrom, monthTo, { only: ["jp"] });
  const { data: wallets = [] } = useFinWallets();
  const { activeCasinoId: aceCasinoId } = useCasino();
  // Read-only ACE figure — never mixed with JP (IN).
  const { data: aceJpSlipOut } = useAceJackpotSlipOutByDate(aceCasinoId, monthFrom, monthTo);


  const jpWalletId = useMemo(() => {
    const w = (wallets as any[]).filter((x) => (x.currency || "TZS") === "TZS");
    return (w.find((x) => x.kind === "cash") || w[0])?.id || "";
  }, [wallets]);

  /**
   * JP (IN) of a day = contributions only. Payouts (negative rows, often for a
   * previous period) live on the JP tab and must never distort the day figure.
   */
  const jpPositive = useMemo(
    () =>
      (incomes as any[]).filter(
        (r) =>
          r.source === "jp" &&
          Number(r.amount || 0) > 0 &&
          // storno rows and the rows they cancel must never inflate the day figure
          !r.reverses_id &&
          !r.reversed_by_id,
      ),
    [incomes],
  );

  const jpByDate = useMemo(() => {
    const m = new Map<string, number>();
    jpPositive.forEach((r) => m.set(r.business_date, (m.get(r.business_date) || 0) + Number(r.amount || 0)));
    return m;
  }, [jpPositive]);

  /** Row that the JP cell edits: the one created here, otherwise the newest one. */
  const jpRowByDate = useMemo(() => {
    const m = new Map<string, any>();
    jpPositive.forEach((r) => {
      const cur = m.get(r.business_date);
      const fromHere = String(r.note || "").includes("Day Closings");
      if (!cur) m.set(r.business_date, r);
      else if (fromHere && !String(cur.note || "").includes("Day Closings")) m.set(r.business_date, r);
    });
    return m;
  }, [jpPositive]);

  const byDate = useMemo(() => {
    const m = new Map<string, any>();
    (list as any[]).forEach((r) => m.set(r.business_date, r));
    return m;
  }, [list]);

  const rows: Row[] = useMemo(() => dates.map((date) => {
    const agg = aggMap?.get(date) || { tables: 0, slots: 0, missChips: 0, missCards: 0 };
    return {
      date,
      existing: byDate.get(date),
      agg,
      jpPosted: Number(jpByDate.get(date) || 0),
      jpRow: jpRowByDate.get(date) || null,
      jpRowsCount: jpPositive.filter((r) => r.business_date === date).length,
      closedByManager: closureMap?.has(date) ? !!closureMap.get(date) : null,
      hadActivity: agg.tables !== 0 || agg.missChips !== 0 || agg.missCards !== 0,
    };
  }), [dates, byDate, aggMap, jpByDate, jpRowByDate, jpPositive, closureMap]);


  /* ---------- editing state (kept in the parent so row heights never shift) ---------- */
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [unlocked, setUnlocked] = useState<Record<string, boolean>>({});
  const setField = (date: string, patch: Draft) =>
    setDrafts((s) => ({ ...s, [date]: { ...s[date], ...patch } }));

  const upsert = useUpsertDayClosing();
  const lock = useLockDayClosing();
  const addIncome = useAddOtherIncome();
  const updateIncome = useUpdateOtherIncome();

  const { activeCasinoId } = useCasino();

  const val = (r: Row) => {
    const d = drafts[r.date] || {};
    const tables = d.tables ?? (r.existing?.tables_result != null ? Number(r.existing.tables_result) : r.agg.tables);
    // Slot fields NEVER prefill from a cage/slot cashier shift (open or closed).
    // Only ACE Collector or an explicit manual entry may populate them.
    const slots = d.slots ?? (r.existing?.slots_result != null
      ? Number(r.existing.slots_result)
      : Number(r.existing?.cashdesk_win ?? 0));

    const drop = d.drop ?? Number(r.existing?.drop_slots ?? 0);
    const cash = d.cash ?? Number(r.existing?.cashdesk_win ?? 0);
    const cards = d.cards ?? Number(r.existing?.players_card_balance ?? 0);
    const jp = d.jp ?? r.jpPosted;
    const comment = d.comment ?? (r.existing?.notes ?? "");
    return { tables, slots, drop, cash, cards, jp, comment };
  };

  /** The business day that is still running — no figures may be stored for it. */
  const openBusinessDate = getBusinessDate();
  const isOpenDay = (r: Row) => r.date >= openBusinessDate && r.closedByManager === null;

  const isLocked = (r: Row) => !!r.existing?.locked_at;
  const isEditable = (r: Row) =>
    !isOpenDay(r) && (!isLocked(r) || (!!isManager && !!unlocked[r.date]));
  const varianceOf = (r: Row) => {
    const v = val(r);
    // Slot figures have no shift-derived reference — only Table Result is compared.
    return { dT: Math.abs(v.tables - r.agg.tables), dS: 0 };
  };
  const needsNote = (r: Row) => {
    const { dT, dS } = varianceOf(r);
    return dT > 1 || dS > 1;
  };


  const [varianceRow, setVarianceRow] = useState<Row | null>(null);
  const [varianceNote, setVarianceNote] = useState("");

  const doSave = async (r: Row, noteOverride?: string) => {
    const v = val(r);
    const finalComment = noteOverride ?? v.comment;
    const tid = `day-${r.date}`;
    try {
      // JP (IN): edit the existing contribution row of the day instead of
      // stacking correction rows. Payouts are never touched from here.
      if (v.jp !== r.jpPosted) {
        if (r.jpRow) {
          await updateIncome.mutateAsync({
            id: r.jpRow.id,
            business_date: r.date,
            wallet_id: r.jpRow.wallet_id,
            fin_category_id: r.jpRow.fin_category_id,
            source: "jp",
            currency: r.jpRow.currency || "TZS",
            amount: v.jp,
            fx_rate: Number(r.jpRow.fx_rate ?? 1),
            note: r.jpRow.note || "JP · Day Closings",
          });
        } else {
          if (!jpWalletId) throw new Error("No TZS wallet configured for JP");
          await addIncome.mutateAsync({
            business_date: r.date,
            wallet_id: jpWalletId,
            source: "jp",
            currency: "TZS",
            amount: v.jp,
            note: "JP · Day Closings",
          });
        }
      }

      await upsert.mutateAsync({
        id: r.existing?.id,
        business_date: r.date,
        tables_result: v.tables,
        slots_result: v.slots,
        drop_slots: v.drop,
        net_win: v.slots,
        cashdesk_win: v.slots,
        players_card_balance: v.cards,
        notes: finalComment || null,
      });

      let rowId = r.existing?.id as string | undefined;
      if (!rowId && activeCasinoId) {
        const { data } = await supabase
          .from("fin_day_closing")
          .select("id")
          .eq("casino_id", activeCasinoId)
          .eq("business_date", r.date)
          .maybeSingle();
        rowId = (data as any)?.id;
      }
      if (rowId) {
        await lock.mutateAsync({
          id: rowId,
          varianceNote: needsNote(r) ? (finalComment || "").trim() : null,
        });
        toast.success("Day closed", { id: tid });
      } else {
        toast.success("Saved", { id: tid });
      }
      setDrafts((s) => { const n = { ...s }; delete n[r.date]; return n; });
      setUnlocked((s) => ({ ...s, [r.date]: false }));
    } catch (e: any) {
      toast.error(e.message, { id: tid });
    }
  };

  const onOk = (r: Row) => {
    if (isOpenDay(r)) {
      toast.error("Business day is still open — close the day first");
      return;
    }
    const v = val(r);
    if (needsNote(r) && (v.comment || "").trim().length < 3) {
      setVarianceNote(v.comment || "");
      setVarianceRow(r);
      return;
    }
    doSave(r);
  };

  /* ---------- month totals ---------- */
  const totals = useMemo(() => {
    const t = { tables: 0, slots: 0, drop: 0, cash: 0, missChips: 0, missCards: 0, cards: 0, jp: 0 };
    let cardsFound = false;
    rows.forEach((r) => {
      t.tables += Number(r.existing?.tables_result ?? r.agg.tables ?? 0);
      t.slots += Number(r.existing?.slots_result ?? 0);
      t.drop += Number(r.existing?.drop_slots ?? 0);
      t.cash += Number(r.existing?.cashdesk_win ?? 0);
      t.missChips += Number(r.agg.missChips ?? 0);
      t.missCards += Number(r.agg.missCards ?? 0);
      t.jp += r.jpPosted;
      const cb = Number(r.existing?.players_card_balance ?? 0);
      if (!cardsFound && cb !== 0) { t.cards = cb; cardsFound = true; }
    });
    return t;
  }, [rows]);





  const numCell = (
    r: Row,
    value: number,
    onChange: (n: number) => void,
    opts: { tone?: boolean; allowNegative?: boolean; placeholder?: number | null; title?: string } = {},
  ) => (
    <NumberInput
      value={value}
      keepZero
      allowNegative={opts.allowNegative ?? true}
      placeholderValue={opts.placeholder ?? 0}
      disabled={!isEditable(r)}
      title={opts.title}
      onValueChange={(n) => onChange(n ?? 0)}
      className={cn(
        "h-7 w-full px-1.5 text-right font-mono tabular-nums text-[12px]",
        opts.tone !== false && amountToneClass(value),
      )}
    />
  );

  const columns: ColumnDef<Row>[] = [
    {
      key: "date",
      header: "Date",
      type: "date",
      style: { width: 100 },
      accessor: (r) => <span className="font-mono text-[11px] whitespace-nowrap">{fmtDate(r.date)}</span>,
    },
    {
      key: "status",
      header: "",
      type: "status",
      style: { width: 48 },
      accessor: (r) => <div className="flex justify-center"><StatusBadge row={r} /></div>,
    },
    {
      key: "tables",
      header: "Table Result",
      type: "money",
      style: { width: 168 },
      headerClassName: "text-right",
      accessor: (r) => numCell(r, val(r).tables, (n) => setField(r.date, { tables: n }), {
        placeholder: r.agg.tables,
        title: `Auto from shifts: ${formatNumberSpaces(r.agg.tables)}`,
      }),
    },
    {
      key: "slots",
      header: "Slot Result",
      type: "money",
      style: { width: 168 },
      accessor: (r) => numCell(r, val(r).slots, (n) => setField(r.date, { slots: n }), {
        placeholder: 0,
        title: `Slot Result = CashDesk Win. Filled by ACE Collector or entered manually. Never taken from a slot cashier shift.`,
      }),
    },
    {
      key: "drop",
      header: "Slot Drop",
      type: "money",
      style: { width: 168 },
      accessor: (r) => numCell(r, val(r).drop, (n) => setField(r.date, { drop: n }), {
        tone: false,
        title: "Slot Drop from Close Day. Editable manually.",
      }),
    },
    {
      key: "cards",
      header: "Card Balance",
      type: "money",
      style: { width: 150 },
      accessor: (r) => numCell(r, val(r).cards, (n) => setField(r.date, { cards: n }), {
        tone: false,
        allowNegative: true,
        title: "Client balance held on player cards. Kept separate — never subtracted from the Slot Result. Negative values allowed.",
      }),
    },
    {
      key: "jp",
      header: "JP",
      type: "money",
      style: { width: 150 },
      accessor: (r) => numCell(r, val(r).jp, (n) => setField(r.date, { jp: Math.abs(n) }), {
        allowNegative: false,
        placeholder: aceJpSlipOut?.get(r.date) ?? 0,
        title:
          `JP contributions booked on this business day. Posted: ${formatNumberSpaces(r.jpPosted)}`
          + (aceJpSlipOut?.get(r.date) != null ? ` · ACE: ${formatNumberSpaces(aceJpSlipOut.get(r.date) as number)}` : "")
          + (Number(r.jpRowsCount || 0) > 1 ? ` · ${r.jpRowsCount} entries — editing the Day Closings one` : "")
          + ". Payouts are entered on the JP tab and never shown here.",
      }),

    },


    {
      key: "comment",
      header: "Comment",
      type: "text",
      style: { minWidth: 180 },
      accessor: (r) => (
        <Input
          disabled={!isEditable(r)}
          value={val(r).comment}
          placeholder="Optional"
          onChange={(e) => setField(r.date, { comment: e.target.value })}
          className="h-7 px-1.5 text-[12px]"
        />
      ),
    },

    {
      key: "actions",
      header: "",
      type: "actions",
      style: { width: 96 },
      accessor: (r) => {
        if (isOpenDay(r)) {
          return (
            <div className="flex items-center justify-end">
              <span
                className="text-[10px] uppercase tracking-widest text-muted-foreground"
                title="Business day is still open — figures are shown as preview only and are not saved"
              >
                Open
              </span>
            </div>
          );
        }
        if (isLocked(r) && !unlocked[r.date]) {
          return (
            <div className="flex items-center justify-end gap-1">
              {isManager ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0"
                  onClick={() => setUnlocked((s) => ({ ...s, [r.date]: true }))}
                  title={`Locked ${r.existing?.locked_at ? fmtDate(r.existing.locked_at) : ""} · manager unlock`}
                >
                  <Unlock className="w-3.5 h-3.5" />
                </Button>
              ) : (
                <Lock className="w-3.5 h-3.5 text-muted-foreground" />
              )}
            </div>
          );
        }
        return (
          <Button
            size="sm"
            className="h-7 px-2"
            onClick={() => onOk(r)}
            disabled={upsert.isPending || lock.isPending}
          >
            {r.existing?.id ? <Lock className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />}
            <span className="ml-1 text-[11px]">OK</span>
          </Button>
        );
      },
    },
  ];

  const totalCell = (col: ColumnDef<Row>) => {
    switch (col.key) {
      case "date": return <span className="text-[10px] font-semibold uppercase tracking-wider">Totals · {MONTH_NAMES[month - 1]}</span>;
      case "status": return null;
      case "tables": return <Money v={totals.tables} />;
      case "slots": return <Money v={totals.slots} />;
      case "drop": return <span className="font-mono text-[12px] text-muted-foreground">{formatNumberSpaces(totals.drop)}</span>;
      case "cards": return <span className={cn("font-mono text-[12px]", totals.cards ? "cms-amount-negative" : "text-muted-foreground")}>{totals.cards ? `${totals.cards > 0 ? "− " : "+ "}${formatNumberSpaces(Math.abs(totals.cards))}` : "0"}</span>;
      case "jp": return <Money v={totals.jp} />;
      default: return null;
    }
  };


  return (
    <PageShell>




      <PageSection bodyClassName="p-0">
        <div className="max-h-[70vh] overflow-auto">
          <SmartTable<Row>
            data={rows}
            columns={columns}
            rowKey={(r) => r.date}
            scroll={false}
            stickyHeader
            virtualize={false}
            rowHeight={40}
            rowClassName={(r) =>
              cn(
                isLocked(r) && !unlocked[r.date] && "bg-muted/20",
                isEditable(r) && needsNote(r) && "bg-amber-500/5",
              )
            }
            footerRows={[{ key: "totals", className: "bg-primary/5 font-semibold", cell: (col) => totalCell(col) }]}
            empty={<span className="text-[12px] text-muted-foreground">No days in this month</span>}
          />
        </div>
      </PageSection>

      <ResponsiveDialog
        open={!!varianceRow}
        onOpenChange={(o) => !o && setVarianceRow(null)}
        size="md"
        title={
          <span className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            Variance vs auto
          </span>
        }
        description={
          varianceRow
            ? `Tables Δ ${formatNumberSpaces(varianceOf(varianceRow).dT)} · Slots Δ ${formatNumberSpaces(varianceOf(varianceRow).dS)}. Please explain why entered values differ from cage actuals.`
            : undefined
        }
      >
        <Textarea
          value={varianceNote}
          onChange={(e) => setVarianceNote(e.target.value)}
          placeholder="Reason (min 3 characters)…"
          rows={3}
          autoFocus
        />
        <ResponsiveDialogFooter>
          <Button variant="outline" onClick={() => setVarianceRow(null)}>Cancel</Button>
          <Button
            disabled={varianceNote.trim().length < 3 || upsert.isPending || lock.isPending}
            onClick={() => {
              const r = varianceRow;
              if (!r) return;
              const note = varianceNote.trim();
              setField(r.date, { comment: note });
              setVarianceRow(null);
              doSave(r, note);
            }}
          >
            Save &amp; Lock
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialog>
    </PageShell>
  );
}

const Money = ({ v }: { v: number }) => (
  <span className={cn("font-mono text-[12px]", amountToneClass(v))}>{formatNumberSpaces(v)}</span>
);

const StatusBadge = ({ row }: { row: Row }) => {
  const base = "inline-flex h-6 w-6 items-center justify-center rounded border";
  if (!row.existing) {
    if (!row.hadActivity && row.closedByManager === null) {
      return <span className="text-[10px] text-muted-foreground">—</span>;
    }
    return (
      <span className={cn(base, "border-rose-500/40 text-rose-500")} title="Missing: no Day Closing row for this business date">
        <CircleDashed className="h-3.5 w-3.5" />
      </span>
    );
  }
  if (!row.existing.locked_at) {
    return (
      <span className={cn(base, "border-amber-500/40 text-amber-500")} title="Not locked: figures entered but not confirmed (OK not pressed)">
        <Unlock className="h-3.5 w-3.5" />
      </span>
    );
  }
  if (row.closedByManager === false) {
    return (
      <span className={cn(base, "border-sky-500/40 text-sky-500")} title="Auto: business day was closed automatically, not by a manager">
        <Bot className="h-3.5 w-3.5" />
      </span>
    );
  }
  return (
    <span className={cn(base, "border-border text-muted-foreground")} title={`Locked ${fmtDate(row.existing.locked_at)}`}>
      <Lock className="h-3.5 w-3.5" />
    </span>
  );
};

