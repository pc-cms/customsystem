import { useMemo, useState, Fragment } from "react";
import { ChevronRight, ChevronDown, Calendar } from "lucide-react";
import { fmtDate } from "@/lib/format-date";

// Visits breakdown grouped Month → Week → Day.
// Player perspective:
//   Result = Cashout − Drop  (positive = player won)
//   Total  = Result − Comps  (with comps/expenses)

type Visit = {
  id: string;
  casino_id: string;
  date: string;
  checked_in_at: string;
  checked_out_at: string | null;
  casinos?: { name?: string } | null;
};
type Tx = { id: string; casino_id: string; created_at: string; type: string; amount: number };
type Exp = { id: string; casino_id: string; created_at: string; amount: number };
type ChipAdj = { id: string; casino_id: string; created_at: string; chip_in: number; chip_out: number };

type Props = {
  visits: Visit[];
  transactions: Tx[];
  expenses: Exp[];
  chipAdjustments?: ChipAdj[];
  showFinancials: boolean;
  /** Authoritative per-business-day peak-NEP cache, keyed by `YYYY-MM-DD`. */
  dropByDay?: Record<string, { peak?: number }>;
};

const fmtMoney = (n: number) => {
  const sign = n < 0 ? "-" : "";
  return `${sign}${Math.abs(Math.round(n)).toLocaleString()}`;
};
const dot = <span className="text-muted-foreground">·</span>;
const fmtDuration = (mins: number) => {
  if (!mins || mins < 0) return "—";
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};
const visitMins = (v: Visit) => {
  if (!v.checked_out_at) return 0;
  return Math.max(0, Math.round((new Date(v.checked_out_at).getTime() - new Date(v.checked_in_at).getTime()) / 60000));
};

// Week starting Monday (ISO).
const startOfIsoWeek = (d: Date) => {
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1 - day);
  const out = new Date(d);
  out.setDate(d.getDate() + diff);
  out.setHours(0, 0, 0, 0);
  return out;
};
const isoWeekKey = (d: Date) => {
  const s = startOfIsoWeek(d);
  return `${s.getFullYear()}-${String(s.getMonth() + 1).padStart(2, "0")}-${String(s.getDate()).padStart(2, "0")}`;
};
const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const monthLabel = (d: Date) =>
  d.toLocaleDateString("en-GB", { timeZone: "Africa/Dar_es_Salaam", month: "long", year: "numeric" });
const weekLabel = (start: Date) => {
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const sameMonth = start.getMonth() === end.getMonth();
  const fmt = (x: Date) =>
    sameMonth
      ? x.getDate().toString()
      : x.toLocaleDateString("en-GB", { timeZone: "Africa/Dar_es_Salaam", day: "numeric", month: "short" });
  return `Week ${fmt(start)}–${fmt(end)} ${start.toLocaleDateString("en-GB", { timeZone: "Africa/Dar_es_Salaam", month: "short" })}`;
};

type Agg = { visits: number; minutes: number; drop: number; inGross: number; out: number; comps: number; chipIn: number; chipOut: number };
const blank = (): Agg => ({ visits: 0, minutes: 0, drop: 0, inGross: 0, out: 0, comps: 0, chipIn: 0, chipOut: 0 });
const add = (a: Agg, b: Agg): Agg => ({
  visits: a.visits + b.visits, minutes: a.minutes + b.minutes,
  drop: a.drop + b.drop, inGross: a.inGross + b.inGross, out: a.out + b.out, comps: a.comps + b.comps,
  chipIn: a.chipIn + b.chipIn, chipOut: a.chipOut + b.chipOut,
});
// Player perspective: chip_in adds to drop-side, chip_out adds to cashout-side.
const result = (a: Agg) => (a.out + a.chipOut) - (a.drop + a.chipIn);
const total = (a: Agg) => result(a) - a.comps;

export default function PlayerVisitsBreakdown({ visits, transactions, expenses, chipAdjustments = [], showFinancials, dropByDay = {} }: Props) {
  const [openMonths, setOpenMonths] = useState<Record<string, boolean>>({});
  const [openWeeks, setOpenWeeks] = useState<Record<string, boolean>>({});

  // Per-visit financial map. Drop here = Drop R (NEP External part).
  // We walk ALL player transactions chronologically (lifetime NEP) and attribute
  // each cash-in's External portion to the visit window it falls into.
  const visitFin = useMemo(() => {
    const m = new Map<string, Agg>();
    for (const v of visits) m.set(v.id, { visits: 1, minutes: visitMins(v), drop: 0, inGross: 0, out: 0, comps: 0, chipIn: 0, chipOut: 0 });

    // Build sorted ranges of visits per casino for fast lookup.
    type Range = { id: string; casinoId: string; start: number; end: number };
    const ranges: Range[] = visits.map(v => ({
      id: v.id,
      casinoId: v.casino_id,
      start: new Date(v.checked_in_at).getTime(),
      end: v.checked_out_at ? new Date(v.checked_out_at).getTime() : new Date(v.checked_in_at).getTime() + 86400000,
    }));
    const findVisit = (casinoId: string, ts: number): string | null => {
      for (const r of ranges) {
        if (r.casinoId === casinoId && ts >= r.start && ts <= r.end) return r.id;
      }
      return null;
    };

    // Per-visit cash-in / cashout (totals only). Drop here is intentionally
    // NOT computed from a lifetime NEP-walk anymore — we distribute the
    // authoritative daily peak-NEP (`player_day_drop_cache`) across visits in
    // a second pass below. This guarantees Σ visit.drop == Σ daily peaks,
    // matching Player Statistics / Tables / Dashboard.
    for (const t of transactions) {
      const amt = Number(t.amount) || 0;
      const ts = new Date(t.created_at).getTime();
      if (t.type === "buy" || (t.type as string) === "in") {
        const vid = findVisit(t.casino_id, ts);
        if (vid) m.get(vid)!.inGross += amt;
      } else if (t.type === "cashout" || (t.type as string) === "out") {
        const vid = findVisit(t.casino_id, ts);
        if (vid) m.get(vid)!.out += amt;
      }
    }
    // Chip adjustments per visit (audit-only; affect Result/Total, not Drop R / NEP).
    for (const c of chipAdjustments) {
      const ts = new Date(c.created_at).getTime();
      const vid = findVisit(c.casino_id, ts);
      if (vid) {
        const cur = m.get(vid)!;
        cur.chipIn += Number(c.chip_in) || 0;
        cur.chipOut += Number(c.chip_out) || 0;
      }
    }
    // Comps per visit
    for (const e of expenses) {
      const ts = new Date(e.created_at).getTime();
      const vid = findVisit(e.casino_id, ts);
      if (vid) m.get(vid)!.comps += Number(e.amount) || 0;
    }
    // Distribute day's peak-NEP across visits sharing that business date,
    // proportional to each visit's cash-in (Σ inGross). When no cash-in is
    // recorded on a day but the cache has a value (rare), attribute fully to
    // the first visit on that date so totals reconcile.
    const visitsByDate = new Map<string, Visit[]>();
    for (const v of visits) {
      if (!v.date) continue;
      const arr = visitsByDate.get(v.date) || [];
      arr.push(v);
      visitsByDate.set(v.date, arr);
    }
    for (const [date, vs] of visitsByDate) {
      const dayPeak = Number((dropByDay as any)[date]?.peak) || 0;
      if (dayPeak <= 0) continue;
      const ins = vs.map(v => m.get(v.id)?.inGross || 0);
      const sumIn = ins.reduce((s, x) => s + x, 0);
      if (sumIn > 0) {
        vs.forEach((v, i) => { m.get(v.id)!.drop = dayPeak * (ins[i] / sumIn); });
      } else {
        m.get(vs[0].id)!.drop = dayPeak;
      }
    }
    return m;
  }, [visits, transactions, expenses, chipAdjustments, dropByDay]);

  // Build hierarchy: month → week → day → visits[].
  const months = useMemo(() => {
    type Day = { dayKey: string; date: Date; visits: Visit[]; agg: Agg };
    type Week = { weekKey: string; start: Date; days: Map<string, Day>; agg: Agg };
    type Month = { monthKey: string; date: Date; weeks: Map<string, Week>; agg: Agg };
    const result = new Map<string, Month>();

    for (const v of visits) {
      const d = new Date(v.checked_in_at);
      const mKey = monthKey(d);
      const wStart = startOfIsoWeek(d);
      const wKey = isoWeekKey(d);
      const dKey = v.date || d.toISOString().slice(0, 10);

      let mo = result.get(mKey);
      if (!mo) {
        const md = new Date(d.getFullYear(), d.getMonth(), 1);
        mo = { monthKey: mKey, date: md, weeks: new Map(), agg: blank() };
        result.set(mKey, mo);
      }
      let wk = mo.weeks.get(wKey);
      if (!wk) {
        wk = { weekKey: wKey, start: wStart, days: new Map(), agg: blank() };
        mo.weeks.set(wKey, wk);
      }
      let day = wk.days.get(dKey);
      if (!day) {
        day = { dayKey: dKey, date: new Date(dKey + "T00:00:00"), visits: [], agg: blank() };
        wk.days.set(dKey, day);
      }
      day.visits.push(v);
      const fin = visitFin.get(v.id) || blank();
      day.agg = add(day.agg, fin);
      wk.agg = add(wk.agg, fin);
      mo.agg = add(mo.agg, fin);
    }
    // Sort newest first.
    return Array.from(result.values()).sort((a, b) => b.date.getTime() - a.date.getTime()).map(m => ({
      ...m,
      weeks: Array.from(m.weeks.values()).sort((a, b) => b.start.getTime() - a.start.getTime()).map(w => ({
        ...w,
        days: Array.from(w.days.values()).sort((a, b) => b.date.getTime() - a.date.getTime()),
      })),
    }));
  }, [visits, visitFin]);

  if (months.length === 0) {
    return <div className="text-sm text-muted-foreground py-6 text-center">No visits recorded.</div>;
  }

  const colSpan = showFinancials ? 10 : 3;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-muted-foreground uppercase border-b border-border">
            <th className="text-left py-2 px-2">Period</th>
            <th className="text-right py-2 px-2">Visits</th>
            <th className="text-right py-2 px-2">Time</th>
            {showFinancials && <>
              <th className="text-right py-2 px-2" title="Drop — NEP-aware (external cash only)">Drop</th>
              <th className="text-right py-2 px-2" title="Total cash in (all buy-ins, including recycled)">In</th>
              <th className="text-right py-2 px-2" title="Total cashout">Out</th>
              <th className="text-right py-2 px-2" title="Chip adjustments in (+)">Chip In</th>
              <th className="text-right py-2 px-2" title="Chip adjustments out (−)">Chip Out</th>
              <th className="text-right py-2 px-2">Result</th>
              <th className="text-right py-2 px-2">Comps</th>
              <th className="text-right py-2 px-2">Total</th>
            </>}
          </tr>
        </thead>
        <tbody>
          {months.map((mo) => {
            const moOpen = openMonths[mo.monthKey] ?? false;
            const moRes = result(mo.agg);
            const moTot = total(mo.agg);
            return (
              <Fragment key={mo.monthKey}>
                <tr
                  className="border-t border-border bg-muted/40 cursor-pointer hover:bg-muted/60 font-semibold"
                  onClick={() => setOpenMonths(s => ({ ...s, [mo.monthKey]: !moOpen }))}
                >
                  <td className="py-2 px-2">
                    <span className="inline-flex items-center gap-1.5">
                      {moOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                      <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                      {monthLabel(mo.date)}
                    </span>
                  </td>
                  <td className="py-2 px-2 text-right font-mono">{mo.agg.visits}</td>
                  <td className="py-2 px-2 text-right font-mono">{fmtDuration(mo.agg.minutes)}</td>
                  {showFinancials && <>
                    <td className="py-2 px-2 text-right font-mono">{mo.agg.drop ? fmtMoney(mo.agg.drop) : dot}</td>
                    <td className="py-2 px-2 text-right font-mono">{mo.agg.inGross ? fmtMoney(mo.agg.inGross) : dot}</td>
                    <td className="py-2 px-2 text-right font-mono">{mo.agg.out ? fmtMoney(mo.agg.out) : dot}</td>
                    <td className="py-2 px-2 text-right font-mono text-success">{mo.agg.chipIn ? fmtMoney(mo.agg.chipIn) : dot}</td>
                    <td className="py-2 px-2 text-right font-mono text-destructive">{mo.agg.chipOut ? fmtMoney(mo.agg.chipOut) : dot}</td>
                    <td className={`py-2 px-2 text-right font-mono ${moRes === 0 ? "text-muted-foreground" : moRes > 0 ? "cms-amount-positive" : "cms-amount-negative"}`}>
                      {moRes === 0 ? "·" : fmtMoney(moRes)}
                    </td>
                    <td className="py-2 px-2 text-right font-mono">{mo.agg.comps ? fmtMoney(mo.agg.comps) : dot}</td>
                    <td className={`py-2 px-2 text-right font-mono ${moTot === 0 ? "text-muted-foreground" : moTot > 0 ? "cms-amount-positive" : "cms-amount-negative"}`}>
                      {moTot === 0 ? "·" : fmtMoney(moTot)}
                    </td>
                  </>}
                </tr>

                {moOpen && mo.weeks.map((wk) => {
                  const wkOpen = openWeeks[wk.weekKey] ?? false;
                  const wkRes = result(wk.agg);
                  const wkTot = total(wk.agg);
                  return (
                    <Fragment key={wk.weekKey}>
                      <tr
                        className="border-t border-border/60 bg-muted/15 cursor-pointer hover:bg-muted/30"
                        onClick={() => setOpenWeeks(s => ({ ...s, [wk.weekKey]: !wkOpen }))}
                      >
                        <td className="py-1.5 pl-7 pr-2 text-xs">
                          <span className="inline-flex items-center gap-1.5 text-card-foreground">
                            {wkOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                            {weekLabel(wk.start)}
                          </span>
                        </td>
                        <td className="py-1.5 px-2 text-right font-mono text-xs">{wk.agg.visits}</td>
                        <td className="py-1.5 px-2 text-right font-mono text-xs">{fmtDuration(wk.agg.minutes)}</td>
                        {showFinancials && <>
                          <td className="py-1.5 px-2 text-right font-mono text-xs">{wk.agg.drop ? fmtMoney(wk.agg.drop) : dot}</td>
                          <td className="py-1.5 px-2 text-right font-mono text-xs">{wk.agg.inGross ? fmtMoney(wk.agg.inGross) : dot}</td>
                          <td className="py-1.5 px-2 text-right font-mono text-xs">{wk.agg.out ? fmtMoney(wk.agg.out) : dot}</td>
                          <td className="py-1.5 px-2 text-right font-mono text-xs text-success">{wk.agg.chipIn ? fmtMoney(wk.agg.chipIn) : dot}</td>
                          <td className="py-1.5 px-2 text-right font-mono text-xs text-destructive">{wk.agg.chipOut ? fmtMoney(wk.agg.chipOut) : dot}</td>
                          <td className={`py-1.5 px-2 text-right font-mono text-xs ${wkRes === 0 ? "text-muted-foreground" : wkRes > 0 ? "cms-amount-positive" : "cms-amount-negative"}`}>
                            {wkRes === 0 ? "·" : fmtMoney(wkRes)}
                          </td>
                          <td className="py-1.5 px-2 text-right font-mono text-xs">{wk.agg.comps ? fmtMoney(wk.agg.comps) : dot}</td>
                          <td className={`py-1.5 px-2 text-right font-mono text-xs ${wkTot === 0 ? "text-muted-foreground" : wkTot > 0 ? "cms-amount-positive" : "cms-amount-negative"}`}>
                            {wkTot === 0 ? "·" : fmtMoney(wkTot)}
                          </td>
                        </>}
                      </tr>

                      {wkOpen && wk.days.map((day) => {
                        const dRes = result(day.agg);
                        const dTot = total(day.agg);
                        return (
                          <tr key={day.dayKey} className="border-t border-border/30 hover:bg-muted/15">
                            <td className="py-1 pl-12 pr-2 text-xs font-mono text-muted-foreground">
                              {fmtDate(day.dayKey)}
                              <span className="ml-2 text-[10px] uppercase">
                                {day.date.toLocaleDateString("en-GB", { timeZone: "Africa/Dar_es_Salaam", weekday: "short" })}
                              </span>
                              {day.visits.length > 1 && (
                                <span className="ml-2 text-[10px]">×{day.visits.length}</span>
                              )}
                            </td>
                            <td className="py-1 px-2 text-right font-mono text-xs">{day.agg.visits}</td>
                            <td className="py-1 px-2 text-right font-mono text-xs">{fmtDuration(day.agg.minutes)}</td>
                            {showFinancials && <>
                              <td className="py-1 px-2 text-right font-mono text-xs">{day.agg.drop ? fmtMoney(day.agg.drop) : dot}</td>
                              <td className="py-1 px-2 text-right font-mono text-xs">{day.agg.inGross ? fmtMoney(day.agg.inGross) : dot}</td>
                              <td className="py-1 px-2 text-right font-mono text-xs">{day.agg.out ? fmtMoney(day.agg.out) : dot}</td>
                              <td className="py-1 px-2 text-right font-mono text-xs text-success">{day.agg.chipIn ? fmtMoney(day.agg.chipIn) : dot}</td>
                              <td className="py-1 px-2 text-right font-mono text-xs text-destructive">{day.agg.chipOut ? fmtMoney(day.agg.chipOut) : dot}</td>
                              <td className={`py-1 px-2 text-right font-mono text-xs ${dRes === 0 ? "text-muted-foreground" : dRes > 0 ? "cms-amount-positive" : "cms-amount-negative"}`}>
                                {dRes === 0 ? "·" : fmtMoney(dRes)}
                              </td>
                              <td className="py-1 px-2 text-right font-mono text-xs">{day.agg.comps ? fmtMoney(day.agg.comps) : dot}</td>
                              <td className={`py-1 px-2 text-right font-mono text-xs ${dTot === 0 ? "text-muted-foreground" : dTot > 0 ? "cms-amount-positive" : "cms-amount-negative"}`}>
                                {dTot === 0 ? "·" : fmtMoney(dTot)}
                              </td>
                            </>}
                          </tr>
                        );
                      })}
                    </Fragment>
                  );
                })}
              </Fragment>
            );
          })}
        </tbody>
        <tfoot>
          {(() => {
            const tot = months.reduce((acc, m) => add(acc, m.agg), blank());
            const r = result(tot);
            const t = total(tot);
            return (
              <tr className="border-t-2 border-border font-semibold bg-muted/30">
                <td className="py-2 px-2 uppercase text-xs text-muted-foreground">Lifetime total</td>
                <td className="py-2 px-2 text-right font-mono">{tot.visits}</td>
                <td className="py-2 px-2 text-right font-mono">{fmtDuration(tot.minutes)}</td>
                {showFinancials && <>
                  <td className="py-2 px-2 text-right font-mono">{fmtMoney(tot.drop)}</td>
                  <td className="py-2 px-2 text-right font-mono">{fmtMoney(tot.inGross)}</td>
                  <td className="py-2 px-2 text-right font-mono">{fmtMoney(tot.out)}</td>
                  <td className="py-2 px-2 text-right font-mono text-success">{fmtMoney(tot.chipIn)}</td>
                  <td className="py-2 px-2 text-right font-mono text-destructive">{fmtMoney(tot.chipOut)}</td>
                  <td className={`py-2 px-2 text-right font-mono ${r === 0 ? "" : r > 0 ? "cms-amount-positive" : "cms-amount-negative"}`}>{fmtMoney(r)}</td>
                  <td className="py-2 px-2 text-right font-mono">{fmtMoney(tot.comps)}</td>
                  <td className={`py-2 px-2 text-right font-mono ${t === 0 ? "" : t > 0 ? "cms-amount-positive" : "cms-amount-negative"}`}>{fmtMoney(t)}</td>
                </>}
              </tr>
            );
          })()}
        </tfoot>
      </table>
    </div>
  );
}
