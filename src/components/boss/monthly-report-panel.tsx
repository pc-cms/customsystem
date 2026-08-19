/**
 * MonthlyReportPanel — TV-friendly MTD report for Boss dashboard.
 * Left: cross-casino summary. Right: day-by-day rows with today highlighted.
 */
import { useMemo, useState, useCallback, useRef } from "react";
import { CalendarDays, Plus, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBossMonthlyReport, type CasinoRef } from "@/hooks/use-boss-monthly-report";
import { useBossReportExtras, useUpsertBossReportExtra, useDeleteBossReportExtra } from "@/hooks/use-boss-report-extras";
import { formatMoneyFull } from "@/lib/format-money";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

type Props = {
  casinos: CasinoRef[];
  accentFor: (slug: string | null, idx: number) => string;
  year?: number;
  month?: number;
};

const fmt = (n: number) => formatMoneyFull(n);
const dateShort = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const weekday = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { weekday: "short" });

const AmountCell = ({ value, bold, dim }: { value: number; bold?: boolean; dim?: boolean }) => {
  const cls =
    value === 0 ? "text-muted-foreground/60" :
    value < 0  ? "cms-amount-negative" :
                 (bold ? "text-foreground" : "text-foreground/90");
  return (
    <td
      className={`px-3 py-1.5 text-right font-mono tabular-nums ${bold ? "font-bold" : ""} ${dim ? "opacity-70" : ""} ${cls}`}
    >
      {value === 0 ? "·" : fmt(value)}
    </td>
  );
};

const parseInput = (raw: string): number | null => {
  const v = Number(raw.replace(/\s/g, "").replace(/,/g, ""));
  return Number.isNaN(v) ? null : v;
};

const EditableAmountCell = ({
  value,
  onCommit,
  disabled,
  dim,
}: {
  value: number;
  onCommit: (v: number) => void;
  disabled?: boolean;
  dim?: boolean;
}) => {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const startEdit = () => {
    if (disabled) return;
    setEditing(true);
    setText(value === 0 ? "" : String(value));
    setTimeout(() => inputRef.current?.select(), 10);
  };

  const commit = useCallback(() => {
    const v = parseInput(text);
    if (v !== null && v !== value) {
      onCommit(v);
    }
    setEditing(false);
  }, [text, value, onCommit]);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") commit();
    else if (e.key === "Escape") setEditing(false);
  };

  const cls =
    value === 0 ? "text-muted-foreground/60" :
    value < 0 ? "cms-amount-negative" : "text-foreground/90";

  if (!editing) {
    return (
      <td
        onClick={startEdit}
        className={`px-3 py-1.5 text-right font-mono tabular-nums ${dim ? "opacity-70" : ""} ${disabled ? "" : "cursor-text hover:bg-white/5"} ${cls}`}
        title={disabled ? undefined : "Click to edit"}
      >
        {value === 0 ? "·" : fmt(value)}
      </td>
    );
  }

  return (
    <td className="px-1 py-0.5">
      <Input
        ref={inputRef}
        type="number"
        step="1"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={handleKey}
        className="h-7 text-right font-mono text-sm py-0 px-1"
        autoFocus
      />
    </td>
  );
};

const EditableLabelCell = ({
  value,
  onCommit,
  disabled,
}: {
  value: string;
  onCommit: (v: string) => void;
  disabled?: boolean;
}) => {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  const startEdit = () => {
    if (disabled) return;
    setEditing(true);
    setText(value);
    setTimeout(() => inputRef.current?.select(), 10);
  };

  const commit = useCallback(() => {
    if (text.trim() && text.trim() !== value) onCommit(text.trim());
    setEditing(false);
  }, [text, value, onCommit]);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") commit();
    else if (e.key === "Escape") setEditing(false);
  };

  if (!editing) {
    return (
      <td
        onClick={startEdit}
        className={`px-4 py-1 pl-6 text-muted-foreground ${disabled ? "" : "cursor-text hover:bg-white/5"}`}
        title={disabled ? undefined : "Click to edit"}
      >
        · {value}
      </td>
    );
  }

  return (
    <td className="px-2 py-0.5">
      <Input
        ref={inputRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={handleKey}
        className="h-7 text-sm py-0 px-2"
        autoFocus
      />
    </td>
  );
};

export function MonthlyReportPanel({ casinos, accentFor, year, month }: Props) {
  const { data, isLoading } = useBossMonthlyReport(casinos, { year, month });
  const { roles } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const canEdit = roles.includes("super_admin") || roles.includes("finance_manager");

  const casinoIds = useMemo(() => casinos.map((c) => c.id), [casinos]);
  const reportYear = data?.year ?? year ?? new Date().getFullYear();
  const reportMonth = data?.month ?? month ?? new Date().getMonth() + 1;
  const sortedIds = useMemo(() => [...casinoIds].sort().join(","), [casinoIds]);
  const { data: extrasRaw } = useBossReportExtras(casinoIds, reportYear, reportMonth);
  const upsert = useUpsertBossReportExtra();
  const del = useDeleteBossReportExtra();

  const extrasById = useMemo(() => {
    const map = new Map<string, { label: string; amount: number; sort_order: number; casinoId: string }>();
    (extrasRaw || []).forEach((r) => {
      map.set(`${r.casino_id}|${r.label}`, { label: r.label, amount: r.amount, sort_order: r.sort_order, casinoId: r.casino_id });
    });
    return map;
  }, [extrasRaw]);

  const invalidateExtras = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["boss-report-extras", sortedIds, reportYear, reportMonth] });
    queryClient.invalidateQueries({ queryKey: ["boss-monthly-report"] });
  }, [queryClient, sortedIds, reportYear, reportMonth]);

  const handleAmountChange = useCallback(
    (casinoId: string, label: string, amount: number) => {
      const existing = extrasById.get(`${casinoId}|${label}`);
      upsert.mutate(
        {
          casino_id: casinoId,
          year: reportYear,
          month: reportMonth,
          label,
          amount,
          sort_order: existing ? existing.sort_order : 0,
        },
        {
          onSuccess: invalidateExtras,
          onError: (err) => {
            console.error("Failed to save extra", err);
            toast({ title: "Save failed", description: String(err), variant: "destructive" });
          },
        }
      );
    },
    [extrasById, reportYear, reportMonth, upsert, invalidateExtras, toast]
  );

  const handleLabelChange = useCallback(
    async (oldLabel: string, newLabel: string) => {
      const rows = (extrasRaw || []).filter((r) => r.label === oldLabel);
      if (!rows.length || newLabel === oldLabel) return;
      try {
        await Promise.all(
          rows.map((r) =>
            supabase
              .from("boss_report_extras")
              .update({ label: newLabel })
              .eq("id", r.id)
          )
        );
        invalidateExtras();
      } catch (e) {
        toast({ title: "Rename failed", description: String(e), variant: "destructive" });
      }
    },
    [extrasRaw, invalidateExtras, toast]
  );

  const handleDeleteRow = useCallback(
    async (label: string) => {
      const rows = (extrasRaw || []).filter((r) => r.label === label);
      try {
        await Promise.all(rows.map((r) => del.mutateAsync(r.id)));
      } catch (e) {
        toast({ title: "Delete failed", description: String(e), variant: "destructive" });
      }
    },
    [extrasRaw, del, toast]
  );

  const addRow = useCallback(() => {
    const base = "New extra";
    let label = base;
    let n = 1;
    while (extrasById.has(`${casinos[0]?.id}|${label}`)) {
      label = `${base} ${n++}`;
    }
    casinos.forEach((c) => {
      upsert.mutate({ casino_id: c.id, year: reportYear, month: reportMonth, label, amount: 0, sort_order: 0 }, {
        onSuccess: invalidateExtras,
      });
    });
  }, [casinos, extrasById, reportYear, reportMonth, upsert, invalidateExtras]);

  const today = data?.today;

  const accentMap = useMemo(
    () => Object.fromEntries(casinos.map((c, i) => [c.id, accentFor(c.slug, i)])),
    [casinos, accentFor],
  );

  if (isLoading || !data) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center text-muted-foreground">
        Loading monthly report…
      </div>
    );
  }

  const { summary, daily } = data;
  const t = summary.totals;

  // Summary row builder
  type Row = { label: string; per: Record<string, number>; total: number; strong?: boolean; muted?: boolean; hint?: string; };
  const cardsHint =
    t.playersCards > 0
      ? `Slots − Players Card Balance (deposits on player cards): −${fmt(t.playersCards)}`
      : "Slots result net of Players Card Balance (deposits on player cards)";
  const rows: Row[] = [
    { label: "Estimated Expenses",     per: summary.estimated, total: t.estimated },
    { label: "Result (Live + Slots)",  per: summary.result,    total: t.result, strong: true },
    { label: "Live Game",              per: summary.tables,    total: t.tables, muted: true },
    { label: "Slots",                  per: summary.slots,     total: t.slots, muted: true, hint: cardsHint },
    { label: "Other incomes",          per: summary.other,     total: t.other },
    { label: "Collection",             per: summary.collection, total: t.collection },
  ];

  const expectedHint =
    `Avg daily result × ${t.daysInMonth} days − Estimated Expenses − Extra Expenses + Other Incomes. ` +
    `Based on ${t.daysElapsed} day${t.daysElapsed === 1 ? "" : "s"} so far.`;

  const monthLabel = new Date(data.monthStart).toLocaleDateString("en-GB", {
    month: "long", year: "numeric",
  });

  return (
    <div className="grid gap-4 grid-cols-1 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      {/* ============ LEFT: Summary ============ */}
      <section
        className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm overflow-hidden"
        style={{ boxShadow: "0 0 40px hsl(var(--primary) / 0.08) inset" }}
      >
        <header className="px-5 py-3 border-b border-white/10 flex items-center justify-between">
          <div>
            <div className="text-[0.7em] uppercase tracking-[0.28em] text-muted-foreground">Company Report</div>
            <div className="text-[1.1em] font-extrabold tracking-wide">{monthLabel}</div>
          </div>
          <div className="flex items-center gap-3 text-[0.65em] uppercase tracking-widest text-muted-foreground">
            {casinos.map((c, i) => (
              <span key={c.id} className="inline-flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-sm" style={{ background: accentMap[c.id] }} />
                {c.name}
              </span>
            ))}
          </div>
        </header>

        <div className="overflow-x-auto">
          <table className="w-full text-[0.9em] border-collapse table-fixed">
            <colgroup>
              <col style={{ width: "26%" }} />
              {casinos.map((c) => (
                <col key={c.id} style={{ width: `${Math.max(10, 60 / Math.max(1, casinos.length))}%` }} />
              ))}
              <col style={{ width: "16%" }} />
              {canEdit && <col style={{ width: "32px" }} />}
            </colgroup>
            <thead>
              <tr className="text-[0.6em] uppercase tracking-widest text-muted-foreground">
                <th className="text-left px-4 py-2 font-semibold">Metric</th>
                {casinos.map((c) => (
                  <th key={c.id} className="text-right px-3 py-2 font-semibold truncate" style={{ color: accentMap[c.id] }}>
                    {c.name}
                  </th>
                ))}
                <th className="text-right px-4 py-2 font-bold text-primary">Total</th>
                {canEdit && <th className="px-1 py-2" />}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label} className="border-t border-white/5 odd:bg-white/[0.015]">
                  <td
                    className={`px-4 py-1.5 truncate ${r.strong ? "font-bold" : ""} ${r.muted ? "pl-8 text-muted-foreground text-[0.9em]" : ""} ${r.hint ? "cursor-help underline decoration-dotted underline-offset-4" : ""}`}
                    title={r.hint || r.label}
                  >
                    {r.label}
                  </td>
                  {casinos.map((c) => (
                    <AmountCell key={c.id} value={r.per[c.id] || 0} bold={r.strong} dim={r.muted} />
                  ))}
                  <AmountCell value={r.total} bold={!r.muted} dim={r.muted} />
                  {canEdit && <td />}
                </tr>
              ))}

              {/* Extras section */}
              <tr className="border-t-2 border-white/10 bg-white/[0.02]">
                <td className="px-4 pt-3 pb-1 text-[0.65em] uppercase tracking-widest text-muted-foreground" colSpan={casinos.length + 2 + (canEdit ? 1 : 0)}>
                  <div className="flex items-center justify-between">
                    <span>Extra Expenses</span>
                    {canEdit && (
                      <Button variant="ghost" size="sm" className="h-6 px-2 text-[0.8em]" onClick={addRow}>
                        <Plus className="w-3 h-3 mr-1" />
                        Add row
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
              {summary.extras.map((b) => (
                <tr key={b.key} className="border-t border-white/5 text-[0.9em]">
                  {b.editable ? (
                    <EditableLabelCell
                      value={b.label}
                      onCommit={(v) => handleLabelChange(b.label, v)}
                      disabled={!canEdit}
                    />
                  ) : (
                    <td className="px-4 py-1 pl-6 text-muted-foreground truncate" title={b.label}>· {b.label}</td>
                  )}
                  {casinos.map((c) =>
                    b.editable ? (
                      <EditableAmountCell
                        key={c.id}
                        value={b.perCasino[c.id] || 0}
                        onCommit={(v) => handleAmountChange(c.id, b.label, v)}
                        disabled={!canEdit}
                        dim
                      />
                    ) : (
                      <AmountCell key={c.id} value={b.perCasino[c.id] || 0} dim />
                    )
                  )}
                  <AmountCell value={b.total} dim />
                  {canEdit && (
                    <td className="px-1">
                      {b.editable && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                          onClick={() => handleDeleteRow(b.label)}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
              <tr className="border-t border-white/10 bg-white/[0.03] font-semibold">
                <td className="px-4 py-1.5">Extras Total</td>
                {casinos.map((c) => (
                  <AmountCell key={c.id} value={summary.extrasTotal[c.id] || 0} bold />
                ))}
                <AmountCell value={t.extras} bold />
                {canEdit && <td />}
              </tr>

              {/* Bottom stats */}
              <tr className="border-t-2 border-primary/40 bg-primary/5">
                <td
                  className="px-4 py-2 font-bold uppercase tracking-widest text-[0.8em] text-primary"
                  title={expectedHint}
                  colSpan={1 + casinos.length}
                >
                  Expected Profit
                </td>
                <AmountCell value={t.expectedProfit} bold />
                {canEdit && <td />}
              </tr>
              <tr className="border-t border-white/10 bg-white/[0.05]">
                <td className="px-4 py-2 font-bold" colSpan={1 + casinos.length}>Balance (current month)</td>
                <AmountCell value={t.balance} bold />
                {canEdit && <td />}
              </tr>

            </tbody>
          </table>
        </div>
      </section>

      {/* ============ RIGHT: Daily rows ============ */}
      <section
        className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm overflow-hidden flex flex-col"
        style={{ boxShadow: "0 0 40px hsl(var(--primary) / 0.08) inset" }}
      >
        <header className="px-5 py-3 border-b border-white/10 flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-primary" />
          <div className="text-[0.7em] uppercase tracking-[0.28em] text-muted-foreground">Daily Breakdown</div>
          <div className="ml-auto text-[0.65em] uppercase tracking-widest text-muted-foreground">
            {daily.length} day{daily.length === 1 ? "" : "s"} · MTD
          </div>
        </header>

        <div className="overflow-auto max-h-[70vh]">
          <table className="w-full text-[0.85em] border-collapse">
            <thead className="sticky top-0 z-10 bg-[hsl(240_20%_7%)]">
              <tr className="text-[0.62em] uppercase tracking-widest text-muted-foreground">
                <th className="text-left px-3 py-2 font-semibold">Date</th>
                <th className="text-right px-3 py-2 font-semibold text-primary">JC Result</th>
                {casinos.map((c) => (
                  <th key={c.id} className="text-right px-3 py-2 font-semibold" style={{ color: accentMap[c.id] }}>
                    {c.name.slice(0, 3).toUpperCase()}
                  </th>
                ))}
                <th className="text-right px-3 py-2 font-semibold">Collect.</th>
                <th className="text-right px-3 py-2 font-semibold">Balance</th>
              </tr>
            </thead>
            <tbody>
              {daily.map((d, idx) => {
                const isToday = d.date === today;
                const isWeekBoundary = idx > 0 && new Date(d.date).getDay() === 1;
                const empty = d.jcResult === 0 && d.collection === 0;
                return (
                  <tr
                    key={d.date}
                    className={[
                      "border-t transition-colors",
                      isWeekBoundary ? "border-t-white/15" : "border-t-white/5",
                      isToday
                        ? "bg-primary/15 border-l-4 border-l-primary text-[1.05em] font-bold"
                        : "odd:bg-white/[0.02] hover:bg-white/[0.04]",
                      empty && !isToday ? "text-muted-foreground/50" : "",
                    ].join(" ")}
                  >
                    <td className="px-3 py-1.5 whitespace-nowrap">
                      {isToday && (
                        <span className="inline-flex items-center gap-1 mr-2 px-1.5 py-0.5 rounded-sm bg-primary text-primary-foreground text-[0.55em] uppercase tracking-widest font-bold">
                          <span className="w-1.5 h-1.5 rounded-full bg-primary-foreground animate-pulse" />
                          Today
                        </span>
                      )}
                      <span className="font-mono tabular-nums">{dateShort(d.date)}</span>
                      <span className="ml-2 text-[0.7em] uppercase tracking-wider text-muted-foreground">
                        {weekday(d.date)}
                      </span>
                    </td>
                    <AmountCell value={d.jcResult} bold={isToday} />
                    {casinos.map((c) => (
                      <AmountCell key={c.id} value={d.perCasino[c.id] || 0} bold={isToday} />
                    ))}
                    <AmountCell value={d.collection} bold={isToday} />
                    <AmountCell value={d.balance} bold />
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="sticky bottom-0 bg-[hsl(240_20%_7%)] border-t-2 border-primary/40">
              <tr className="font-extrabold text-[0.95em]">
                <td className="px-3 py-2 uppercase tracking-widest text-primary">Total</td>
                <AmountCell value={t.result} bold />
                {casinos.map((c) => (
                  <AmountCell key={c.id} value={summary.result[c.id] || 0} bold />
                ))}
                <AmountCell value={t.collection} bold />
                <AmountCell value={t.dailyBalance} bold />
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </div>
  );
}
