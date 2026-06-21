import { ReactNode, useEffect, useMemo, useState } from "react";
import { Gift, ChevronLeft, ChevronRight, Printer, Lock, Unlock, Calculator } from "lucide-react";
import { PageShell, PageSection } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useDealers, useDealerAttendanceRange, usePitRotaRange, useSetDealerAttendance,
} from "@/hooks/use-dealers";
import {
  useWeeklyBonusEntries, useWeeklyBonusPool,
  useUpsertBonusEntry, useUpsertBonusPool,
  getWeekStartSunday, addDaysIso,
} from "@/hooks/use-weekly-bonus";
import { useDailyResults } from "@/hooks/use-import-reports";
import { fmtDateOnly } from "@/lib/format-date";
import { UNIFIED_ATT_COLORS, UNIFIED_SHIFT_TINTS, isExtraShift } from "@/lib/shift-colors";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const CATEGORY_LETTER: Record<string, string> = {
  trainee: "T", dealer: "D", inspector: "I", expert: "E", pit_boss: "PB",
};
const CATEGORY_COLORS: Record<string, string> = {
  trainee: "text-cyan-700 bg-cyan-100 dark:text-cyan-400 dark:bg-cyan-500/20",
  dealer: "text-blue-700 bg-blue-100 dark:text-blue-400 dark:bg-blue-500/20",
  inspector: "text-amber-700 bg-amber-100 dark:text-amber-400 dark:bg-amber-500/20",
  expert: "text-emerald-700 bg-emerald-100 dark:text-emerald-400 dark:bg-emerald-500/20",
  pit_boss: "text-purple-700 bg-purple-100 dark:text-purple-400 dark:bg-purple-500/20",
};
const CATEGORY_ORDER: Record<string, number> = {
  trainee: 0, dealer: 1, inspector: 2, expert: 3, pit_boss: 4,
};

const DENOMS = [10000, 5000, 2000, 1000];

const parseValue = (val: string | null | undefined) => {
  if (!val) return { kind: "empty" as const, hours: 0 };
  if (val === "A") return { kind: "absent" as const, hours: 0 };
  if (val === "SP") return { kind: "suspend" as const, hours: 0 };
  if (val === "S") return { kind: "sick" as const, hours: 0 };
  const m = /^(\d+)(S?)$/.exec(val);
  if (m) {
    const n = parseInt(m[1], 10);
    if (!isNaN(n)) return { kind: m[2] ? "hours-sick" as const : "hours" as const, hours: n };
  }
  return { kind: "empty" as const, hours: 0 };
};

const normalizeAttInput = (raw: string): string => {
  const v = raw.trim().toUpperCase();
  if (!v) return "";
  if (v === "A" || v === "S") return v;
  const m = /^(\d{1,2})(S?)$/.exec(v);
  if (m) return `${parseInt(m[1], 10)}${m[2]}`;
  return v;
};

const fmtMoney = (n: number) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.round(n)).replace(/,/g, " ");

const breakdown = (amt: number): Record<number, number> => {
  const out: Record<number, number> = {};
  let rem = Math.max(0, Math.round(amt));
  for (const d of DENOMS) {
    out[d] = Math.floor(rem / d);
    rem -= out[d] * d;
  }
  return out;
};

export default function WeeklyBonus({ belowHeader }: { belowHeader?: ReactNode }) {
  const [weekStart, setWeekStart] = useState<string>(() => getWeekStartSunday(new Date()));
  const weekEnd = useMemo(() => addDaysIso(weekStart, 6), [weekStart]);

  const { data: dealers = [], isPending: dealersPending, isFetching: dealersFetching } = useDealers();
  const { isReady: scopeReady } = useDataScope();
  const dealersLoading = !scopeReady || dealersPending || (dealersFetching && dealers.length === 0);
  const { data: rota = [] } = usePitRotaRange(weekStart, weekEnd);
  const { data: attendance = [] } = useDealerAttendanceRange(weekStart, weekEnd);
  const { data: entries = [] } = useWeeklyBonusEntries(weekStart);
  const { data: pool } = useWeeklyBonusPool(weekStart);
  const { data: weekResults = [] } = useDailyResults(weekStart, weekEnd);

  // 1% of weekly tables result, rounded to nearest 1 000 TZS — used as placeholder hint.
  const suggestedPool = useMemo(() => {
    const total = (weekResults as any[]).reduce((s, r) => s + Number(r.result || 0), 0);
    const onePct = total * 0.01;
    return onePct > 0 ? Math.round(onePct / 1000) * 1000 : 0;
  }, [weekResults]);

  const upsertEntry = useUpsertBonusEntry();
  const upsertPool = useUpsertBonusPool();
  const setAtt = useSetDealerAttendance();

  const [poolInput, setPoolInput] = useState<string>("");
  const [calculated, setCalculated] = useState<boolean>(false);
  const locked = !!pool?.is_calculated;

  // Local edit buffer for attendance cells (keyed by `${dealerId}|${date}`).
  const [attDraft, setAttDraft] = useState<Record<string, string>>({});
  // Live edit buffers for Extra / Bonus — PTS updates as the user types,
  // before the input blurs and the server round-trip completes.
  const [extraDraft, setExtraDraft] = useState<Record<string, string>>({});
  const [bonusDraft, setBonusDraft] = useState<Record<string, string>>({});

  useEffect(() => {
    setPoolInput(pool?.pool_amount ? String(pool.pool_amount) : "");
    setCalculated(!!pool?.is_calculated);
  }, [pool?.pool_amount, pool?.is_calculated, weekStart]);

  useEffect(() => { setAttDraft({}); setExtraDraft({}); setBonusDraft({}); }, [weekStart]);

  // Cashier's editable bill counts for payout preparation. Resets on recompute.
  const [payoutOverride, setPayoutOverride] = useState<Record<number, number> | null>(null);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDaysIso(weekStart, i)), [weekStart]);

  const rows = useMemo(() => {
    const activeDealers = (dealers as any[]).filter((d) => d.is_active !== false);
    const attMap = new Map<string, string>();
    attendance.forEach((a: any) => attMap.set(`${a.dealer_id}|${a.date}`, a.value));
    const rotaMap = new Map<string, string>();
    rota.forEach((r: any) => rotaMap.set(`${r.dealer_id}|${r.date}`, r.shift));
    const entryMap = new Map<string, { extra_override: number | null; bonus_points: number }>();
    entries.forEach((e: any) => entryMap.set(e.dealer_id, { extra_override: e.extra_override, bonus_points: e.bonus_points }));

    const out = activeDealers.map((d) => {
      let hours = 0;
      let extraComputed = 0;
      const cells = days.map((day) => {
        const key = `${d.id}|${day}`;
        const att = (attDraft[key] ?? attMap.get(key)) ?? "";
        const shift = rotaMap.get(key) ?? "";
        const p = parseValue(att);
        if (p.kind === "hours" || p.kind === "hours-sick") hours += p.hours;
        if (isExtraShift(shift)) extraComputed += 1;
        return { att, shift, parsed: p, key, day };
      });
      const entry = entryMap.get(d.id);
      const storedExtra = entry?.extra_override ?? extraComputed;
      const storedBonus = entry?.bonus_points ?? 0;
      const eDraft = extraDraft[d.id];
      const bDraft = bonusDraft[d.id];
      const extra = eDraft !== undefined
        ? (eDraft.trim() === "" ? 0 : (parseInt(eDraft, 10) || 0))
        : storedExtra;
      const bonusPts = bDraft !== undefined
        ? (bDraft.trim() === "" ? 0 : (parseInt(bDraft, 10) || 0))
        : storedBonus;
      const points = hours + extra + bonusPts;
      const cat = d.is_pit_boss ? "pit_boss" : (d.category || "dealer");
      return { dealer: d, cells, hours, extraComputed, extra, bonusPts, storedExtra, storedBonus, points, cat };
    });

    return out.sort((a, b) => {
      const c = (CATEGORY_ORDER[a.cat] ?? 99) - (CATEGORY_ORDER[b.cat] ?? 99);
      if (c !== 0) return c;
      return a.dealer.name.localeCompare(b.dealer.name);
    });
  }, [dealers, attendance, rota, entries, days, attDraft, extraDraft, bonusDraft]);

  const totalPoints = rows.reduce((s, r) => s + r.points, 0);
  const poolAmount = calculated ? (parseInt(poolInput.replace(/\s/g, ""), 10) || 0) : 0;
  const valuePerPoint = totalPoints > 0 && poolAmount > 0 ? poolAmount / totalPoints : 0;
  const roundedBonus = (pts: number) => Math.round((pts * valuePerPoint) / 1000) * 1000;
  const totalDistributed = rows.reduce(
    (s, r) => s + (calculated ? roundedBonus(r.points) : 0),
    0,
  );
  const balance = totalDistributed - poolAmount;

  const denomTotals: Record<number, number> = useMemo(() => {
    const t: Record<number, number> = { 10000: 0, 5000: 0, 2000: 0, 1000: 0 };
    if (!calculated) return t;
    rows.forEach((r) => {
      const b = breakdown(roundedBonus(r.points));
      for (const d of DENOMS) t[d] += b[d];
    });
    return t;
  }, [rows, calculated, valuePerPoint]);

  // Reset cashier's bill overrides whenever the auto-suggested totals change.
  useEffect(() => {
    setPayoutOverride({ ...denomTotals });
  }, [denomTotals[10000], denomTotals[5000], denomTotals[2000], denomTotals[1000]]);

  const payoutCounts = payoutOverride ?? denomTotals;
  const preparedTotal = DENOMS.reduce((s, d) => s + (payoutCounts[d] || 0) * d, 0);
  const payoutDiff = preparedTotal - totalDistributed;

  const navWeek = (offset: number) => setWeekStart((w) => addDaysIso(w, offset * 7));

  const handleCalculate = () => {
    const amt = parseInt(poolInput.replace(/\s/g, ""), 10);
    if (isNaN(amt) || amt <= 0) { toast.error("Enter a valid bonus amount"); return; }
    setCalculated(true);
    toast.success("Bonus recalculated");
  };

  const handleLock = async () => {
    const amt = parseInt(poolInput.replace(/\s/g, ""), 10);
    if (isNaN(amt) || amt <= 0) { toast.error("Enter a valid bonus amount"); return; }
    await upsertPool.mutateAsync({ week_start: weekStart, pool_amount: amt, calculate: !locked });
    toast.success(locked ? "Bonus unlocked" : "Bonus locked");
  };

  const commitAtt = (dealerId: string, date: string, raw: string, original: string) => {
    const norm = normalizeAttInput(raw);
    if (norm === (original || "")) return;
    setAtt.mutate({ dealer_id: dealerId, date, value: norm });
    setCalculated(false);
  };

  const isThisWeek = weekStart === getWeekStartSunday(new Date());

  // Columns:
  // # | Cat | Name | 7 days | Hours | Extra | Bonus | Pts | Bonus TZS | SIGN | 4 denoms = 19
  const TOTAL_COLS = 1 + 1 + 1 + 7 + 1 + 1 + 1 + 1 + 1 + 1 + DENOMS.length;
  const COLS_BEFORE_BONUS_TZS = 1 + 1 + 1 + 7 + 1 + 1 + 1 + 1; // 13

  return (
    <PageShell>
      <PageHeader

        icon={Gift}
        title="Weekly Bonus"
        subtitle="Distribute a bonus pool across Live Game staff (Sun – Sat)"
        belowHeader={belowHeader}
      >
        <div className="flex items-center gap-2 print:hidden">
          <Button variant="outline" size="icon" onClick={() => navWeek(-1)} aria-label="Previous week">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <div className="text-sm font-mono px-2 min-w-[200px] text-center">
            {fmtDateOnly(weekStart)} – {fmtDateOnly(weekEnd)}
            {isThisWeek && <span className="ml-2 text-xs text-primary">(this week)</span>}
          </div>
          <Button variant="outline" size="icon" onClick={() => navWeek(1)} aria-label="Next week">
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </PageHeader>

      <PageSection>
        <div className="wb-print-root">
        <div className="flex flex-wrap items-end gap-3 mb-3 p-3 rounded-md border border-border bg-primary text-primary-foreground print:hidden">
          <div className="flex flex-col gap-1">
            <label className="text-xs uppercase tracking-wider opacity-80">
              Bonus Pool (TZS)
              {suggestedPool > 0 && (
                <span className="ml-2 normal-case opacity-70 font-mono">{fmtMoney(suggestedPool)}</span>
              )}
            </label>
            <Input
              type="text" inputMode="numeric"
              className="w-44 font-mono font-bold text-lg text-foreground bg-background placeholder:text-muted-foreground/60 placeholder:font-normal"
              value={poolInput ? fmtMoney(parseInt(poolInput.replace(/\D/g, ""), 10) || 0) : ""}
              onChange={(e) => { setPoolInput(e.target.value.replace(/\D/g, "")); setCalculated(false); }}
              placeholder={suggestedPool > 0 ? fmtMoney(suggestedPool) : "0"}
              disabled={locked}
            />
          </div>
          <Button onClick={handleCalculate} disabled={locked} variant="secondary" className="gap-2">
            <Calculator className="w-4 h-4" /> Calculate
          </Button>
          <Button variant="secondary" onClick={() => window.print()} className="gap-2">
            <Printer className="w-4 h-4" /> Print
          </Button>
          <Button
            variant={locked ? "destructive" : "secondary"}
            onClick={handleLock} className="gap-2"
            disabled={upsertPool.isPending}
          >
            {locked ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
            {locked ? "Unlock" : "Lock"}
          </Button>

          <div className="ml-auto flex items-center gap-8 font-mono text-white">
            <div>
              <div className="text-[11px] uppercase opacity-90">Total Points</div>
              <div className="text-2xl font-bold leading-tight">{totalPoints}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase opacity-90">Per Point</div>
              <div className="text-2xl font-bold leading-tight">{valuePerPoint > 0 ? fmtMoney(valuePerPoint) : "—"}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase opacity-90">Distributed</div>
              <div className="text-2xl font-bold leading-tight">{poolAmount > 0 ? fmtMoney(totalDistributed) : "—"}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase opacity-90">Bonus Balance</div>
              <div
                className={cn(
                  "inline-block text-2xl font-bold leading-tight px-2 rounded",
                  poolAmount > 0 && balance > 0 && "bg-emerald-500 text-white",
                  poolAmount > 0 && balance < 0 && "bg-red-500 text-white",
                )}
                title="Distributed − Pool. Positive = need extra bills, negative = leftover"
              >
                {poolAmount > 0 ? `${balance > 0 ? "+" : ""}${fmtMoney(balance)}` : "—"}
              </div>
            </div>
          </div>
        </div>

        <div className="w-full overflow-x-auto rounded-md border border-border print-target wb-print-target">
          <div className="hidden print:block text-center font-bold text-[11pt] mb-1">
            Weekly Bonus — {fmtDateOnly(weekStart)} – {fmtDateOnly(weekEnd)}
          </div>
          <table className="w-full text-xs border-collapse">
            <thead className="bg-primary text-primary-foreground">
              <tr>
                <th className="h-9 w-8 text-center font-semibold">#</th>
                <th className="h-9 w-10 text-center font-semibold">Cat</th>
                <th className="h-9 px-2 text-left font-semibold w-[156px] min-w-[156px] max-w-[156px]">Name</th>
                {DAYS.map((d, i) => (
                  <th key={d} className="h-9 px-1 w-12 text-center font-semibold">
                    <div className="text-[10px] leading-tight">{d}</div>
                    <div className="text-[9px] font-normal opacity-80">{fmtDateOnly(days[i]).slice(0, 5)}</div>
                  </th>
                ))}
                <th className="h-9 w-14 text-center font-semibold">Hours</th>
                <th className="h-9 w-16 text-center font-semibold no-print">Extra</th>
                <th className="h-9 w-16 text-center font-semibold no-print">Bonus</th>
                <th className="h-9 w-14 text-center font-semibold no-print">Pts</th>
                <th className="h-9 w-48 min-w-[192px] text-right px-2 font-semibold">Bonus TZS</th>
                <th className="h-9 w-32 text-center font-semibold wb-sign-cell">SIGN</th>
                {DENOMS.map((d) => (
                  <th key={d} className="h-9 w-12 text-center font-semibold no-print">{d / 1000}k</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={TOTAL_COLS} className="text-center text-muted-foreground py-6">
                    No staff found
                  </td>
                </tr>
              )}
              {rows.map((r, idx) => {
                const bonus = calculated ? roundedBonus(r.points) : 0;
                const bd = bonus > 0 ? breakdown(bonus) : null;
                const zebra = idx % 2 === 0 ? "" : "bg-muted/10";
                return (
                  <tr key={r.dealer.id} className={cn("border-b border-border last:border-0", zebra)}>
                    <td className="px-1 py-1 text-center text-muted-foreground font-mono text-[11px]">{idx + 1}</td>
                    <td className="px-1 py-1 text-center">
                      <span className={cn(
                        "inline-flex items-center justify-center w-5 h-5 rounded text-[9px] font-mono font-bold",
                        CATEGORY_COLORS[r.cat] || "text-muted-foreground bg-muted/20",
                      )}>
                        {CATEGORY_LETTER[r.cat] || "?"}
                      </span>
                    </td>
                    <td className="px-2 py-1 text-[12px] font-medium truncate max-w-[156px]" title={r.dealer.name}>
                      {r.dealer.name}
                    </td>
                    {r.cells.map((c, i) => {
                      const p = c.parsed;
                      const isStatus = p.kind === "absent" || p.kind === "sick";
                      const isSuspend = p.kind === "suspend";
                      const isHours = p.kind === "hours";
                      const isHoursSick = p.kind === "hours-sick";
                      const isScheduled = !!c.shift;
                      const isEmpty = p.kind === "empty";
                      const cellCls = isSuspend
                        ? "bg-red-600/20 text-red-600 dark:text-red-400 font-extrabold ring-2 ring-red-500 ring-inset"
                        : isStatus
                        ? cn(UNIFIED_ATT_COLORS[c.att], "ring-2 ring-red-500/80 dark:ring-red-400/80 ring-inset")
                        : isHoursSick
                          ? "bg-transparent text-card-foreground font-bold ring-2 ring-red-500/80 dark:ring-red-400/80 ring-inset"
                          : isHours
                            ? isExtraShift(c.shift)
                              ? "bg-transparent text-card-foreground font-bold ring-2 ring-purple-500/70 dark:ring-purple-400/70 ring-inset"
                              : "bg-transparent text-card-foreground font-bold"
                            : isScheduled && isEmpty
                              ? cn(UNIFIED_SHIFT_TINTS[c.shift] || "bg-muted/30 text-muted-foreground", "placeholder:text-current placeholder:opacity-60", isExtraShift(c.shift) && "ring-2 ring-purple-500/70 dark:ring-purple-400/70 ring-inset")
                              : "bg-slate-700/90 dark:bg-slate-900 text-slate-300 placeholder:text-slate-400/60";
                      return (
                        <td key={i} className="px-0.5 py-0.5 text-center border-l border-border/25">
                          <input
                            type="text"
                            disabled={locked}
                            defaultValue={c.att}
                            key={`${c.key}-${c.att}`}
                            onBlur={(e) => commitAtt(r.dealer.id, c.day, e.target.value, c.att)}
                            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                            className={cn(
                              "wb-cell w-full h-8 rounded text-xs font-mono font-semibold text-center transition-colors outline-none border-0 focus:ring-2 focus:ring-primary print:hidden",
                              cellCls,
                            )}
                            placeholder={isScheduled ? c.shift : "·"}
                            maxLength={3}
                          />
                          <span className="hidden print:inline font-mono font-semibold text-[7.5pt]">
                            {c.att || (isScheduled ? c.shift : "")}
                          </span>
                        </td>
                      );
                    })}
                    <td className="px-2 py-1 text-center font-mono font-bold text-primary text-[11px]">
                      {r.hours || ""}
                    </td>
                    <td className="px-1 py-1 text-center no-print">
                      <Input
                        type="text" inputMode="numeric"
                        className="w-14 h-7 text-center font-mono mx-auto px-1 text-xs"
                        value={extraDraft[r.dealer.id] ?? String(r.storedExtra)}
                        disabled={locked}
                        onChange={(e) => {
                          const v = e.target.value.replace(/[^0-9]/g, "");
                          setExtraDraft((d) => ({ ...d, [r.dealer.id]: v }));
                          setCalculated(false);
                        }}
                        onBlur={() => {
                          const raw = extraDraft[r.dealer.id];
                          if (raw === undefined) return;
                          const next = raw.trim() === "" ? 0 : (parseInt(raw, 10) || 0);
                          if (next === r.storedExtra) {
                            setExtraDraft((d) => { const n = { ...d }; delete n[r.dealer.id]; return n; });
                            return;
                          }
                          void upsertEntry.mutateAsync({
                            dealer_id: r.dealer.id,
                            week_start: weekStart,
                            extra_override: next,
                            bonus_points: r.bonusPts,
                          }).then(() => {
                            setExtraDraft((d) => { const n = { ...d }; delete n[r.dealer.id]; return n; });
                          }).catch((error) => toast.error(error?.message || "Could not save extra points"));
                        }}
                        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                      />
                    </td>
                    <td className="px-1 py-1 text-center no-print">
                      <Input
                        type="text" inputMode="numeric"
                        className="w-14 h-7 text-center font-mono mx-auto px-1 text-xs"
                        value={bonusDraft[r.dealer.id] ?? (r.storedBonus ? String(r.storedBonus) : "")}
                        placeholder="0"
                        disabled={locked}
                        onChange={(e) => {
                          const v = e.target.value.replace(/[^0-9]/g, "");
                          setBonusDraft((d) => ({ ...d, [r.dealer.id]: v }));
                          setCalculated(false);
                        }}
                        onBlur={() => {
                          const raw = bonusDraft[r.dealer.id];
                          if (raw === undefined) return;
                          const next = raw.trim() === "" ? 0 : (parseInt(raw, 10) || 0);
                          if (next === r.storedBonus) {
                            setBonusDraft((d) => { const n = { ...d }; delete n[r.dealer.id]; return n; });
                            return;
                          }
                          void upsertEntry.mutateAsync({
                            dealer_id: r.dealer.id,
                            week_start: weekStart,
                            extra_override: r.extra,
                            bonus_points: next,
                          }).then(() => {
                            setBonusDraft((d) => { const n = { ...d }; delete n[r.dealer.id]; return n; });
                          }).catch((error) => toast.error(error?.message || "Could not save bonus points"));
                        }}
                        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                      />
                    </td>


                    <td className="px-2 py-1 text-center font-mono font-bold text-[11px] no-print">
                      {r.points || ""}
                    </td>
                    <td className="px-2 py-1 text-right font-mono font-semibold text-sm">
                      {bonus > 0 ? fmtMoney(bonus) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-2 py-1 text-center text-[10px] wb-sign-cell border-b border-foreground/40 print:border-foreground">
                      <span className="print:hidden">
                        <span className="text-muted-foreground">—</span>
                      </span>
                    </td>
                    {DENOMS.map((d) => (
                      <td key={d} className="px-1 py-1 text-center font-mono text-[11px] no-print">
                        {bd && bd[d] ? bd[d] : <span className="text-muted-foreground/30">·</span>}
                      </td>
                    ))}
                  </tr>
                );
              })}
              {calculated && rows.length > 0 && (
                <tr className="bg-muted/40 font-semibold border-t-2 border-border no-print">
                  <td colSpan={10} className="text-right py-2 px-2 text-xs uppercase tracking-wider">
                    Totals
                  </td>
                  <td className="px-2 py-2 text-center font-mono font-bold text-primary text-sm">
                    {rows.reduce((s, r) => s + r.hours, 0)}
                  </td>
                  <td className="no-print" />
                  <td className="no-print" />
                  <td className="no-print" />
                  <td className="px-2 py-2 text-right font-mono text-sm">
                    <div>{fmtMoney(totalDistributed)}</div>
                    <div className="text-[10px] font-normal text-muted-foreground mt-0.5">
                      Prep: <span className="font-mono">{fmtMoney(preparedTotal)}</span>
                    </div>
                    <div
                      className={cn(
                        "text-[10px] font-bold mt-0.5",
                        payoutDiff === 0 && "text-emerald-600 dark:text-emerald-400",
                        payoutDiff > 0 && "text-amber-600 dark:text-amber-400",
                        payoutDiff < 0 && "text-red-600 dark:text-red-400",
                      )}
                    >
                      Diff: {payoutDiff === 0 ? "0 ✓" : `${payoutDiff > 0 ? "+" : ""}${fmtMoney(payoutDiff)}`}
                    </div>
                  </td>
                  <td className="wb-sign-cell" />
                  {DENOMS.map((d) => (
                    <td key={d} className="px-1 py-2 text-center">
                      <input
                        type="text"
                        inputMode="numeric"
                        disabled={locked}
                        value={payoutCounts[d] || ""}
                        placeholder="0"
                        onChange={(e) => {
                          const v = parseInt(e.target.value.replace(/\D/g, ""), 10);
                          setPayoutOverride({ ...payoutCounts, [d]: isNaN(v) ? 0 : v });
                        }}
                        className="w-12 h-7 rounded border border-border bg-background text-center font-mono font-bold text-xs px-1 focus:outline-none focus:ring-1 focus:ring-primary print:border-0 print:bg-transparent print:h-auto print:w-auto"
                      />
                    </td>
                  ))}
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {!calculated && (
          <p className="mt-3 text-xs text-muted-foreground print:hidden">
            Enter the total bonus amount and press <strong>Calculate</strong>. Bonuses round to the nearest 1,000 TZS. Then <strong>Lock</strong> to save.
          </p>
        )}
        </div>
      </PageSection>

      {/* Print sizing: fit one A4 landscape page. Uses global .print-target + .no-print system from index.css */}
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 5mm; }
          html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
          body * { visibility: hidden !important; }
          .wb-print-target, .wb-print-target * { visibility: visible !important; }
          .wb-print-target {
            position: absolute !important;
            left: 0 !important; top: 0 !important; right: 0 !important;
            margin: 0 !important; padding: 0 !important;
            border: 0 !important; background: #fff !important;
            font-size: 9pt !important;
          }
          .wb-print-target table { font-size: 8.5pt !important; table-layout: fixed; width: 100% !important; }
          .wb-print-target th, .wb-print-target td { padding: 0px 2px !important; border: 0.5px solid #999 !important; }
          .wb-print-target thead th { height: 11px !important; }
          .wb-print-target tbody tr { height: 10px !important; }
          .wb-print-target .wb-cell { height: 9px !important; padding: 0 !important; }
          .wb-print-target input { font-size: 8.5pt !important; height: 9px !important; line-height: 9px !important; }
          .wb-sign-cell { min-width: 90px; border-bottom: 0.5px solid #000 !important; }
        }
      `}</style>
    </PageShell>

  );
}
