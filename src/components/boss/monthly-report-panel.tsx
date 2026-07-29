/**
 * MonthlyReportPanel — TV-friendly MTD report for Boss dashboard.
 * Left: cross-casino summary. Right: day-by-day rows with today highlighted.
 */
import { useMemo } from "react";
import { CalendarDays } from "lucide-react";
import { useBossMonthlyReport, type CasinoRef } from "@/hooks/use-boss-monthly-report";
import { formatMoneyFull } from "@/lib/format-money";

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

export function MonthlyReportPanel({ casinos, accentFor, year, month }: Props) {
  const { data, isLoading } = useBossMonthlyReport(casinos, { year, month });

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

  // Summary row builder: label, per-casino record, total, opts
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
          <table className="w-full text-[0.9em] border-collapse">
            <thead>
              <tr className="text-[0.6em] uppercase tracking-widest text-muted-foreground">
                <th className="text-left px-4 py-2 font-semibold">Metric</th>
                {casinos.map((c, i) => (
                  <th key={c.id} className="text-right px-3 py-2 font-semibold" style={{ color: accentMap[c.id] }}>
                    {c.name}
                  </th>
                ))}
                <th className="text-right px-4 py-2 font-bold text-primary">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label} className="border-t border-white/5 odd:bg-white/[0.015]">
                  <td
                    className={`px-4 py-1.5 ${r.strong ? "font-bold" : ""} ${r.muted ? "pl-8 text-muted-foreground text-[0.9em]" : ""} ${r.hint ? "cursor-help underline decoration-dotted underline-offset-4" : ""}`}
                    title={r.hint}
                  >
                    {r.label}
                  </td>
                  {casinos.map((c) => (
                    <AmountCell key={c.id} value={r.per[c.id] || 0} bold={r.strong} dim={r.muted} />
                  ))}
                  <AmountCell value={r.total} bold={!r.muted} dim={r.muted} />
                </tr>
              ))}


              {/* Extras section */}
              <tr className="border-t-2 border-white/10 bg-white/[0.02]">
                <td className="px-4 pt-3 pb-1 text-[0.65em] uppercase tracking-widest text-muted-foreground" colSpan={casinos.length + 2}>
                  Extra Expenses
                </td>
              </tr>
              {summary.extras.map((b) => (
                <tr key={b.key} className="border-t border-white/5 text-[0.9em]">
                  <td className="px-4 py-1 pl-6 text-muted-foreground">· {b.label}</td>
                  {casinos.map((c) => (
                    <AmountCell key={c.id} value={b.perCasino[c.id] || 0} dim />
                  ))}
                  <AmountCell value={b.total} dim />
                </tr>
              ))}
              <tr className="border-t border-white/10 bg-white/[0.03] font-semibold">
                <td className="px-4 py-1.5">Extras Total</td>
                {casinos.map((c) => (
                  <AmountCell key={c.id} value={summary.extrasTotal[c.id] || 0} bold />
                ))}
                <AmountCell value={t.extras} bold />
              </tr>

              {/* Bottom stats */}
              <tr className="border-t-2 border-primary/40 bg-primary/5">
                <td className="px-4 py-2 font-bold uppercase tracking-widest text-[0.8em] text-primary">Expected Profit</td>
                <td colSpan={casinos.length} />
                <AmountCell value={t.expectedProfit} bold />
              </tr>
              <tr className="border-t border-white/10">
                <td className="px-4 py-2 font-bold">SAFE</td>
                {casinos.map((c) => (
                  <AmountCell key={c.id} value={summary.safe[c.id] || 0} bold />
                ))}
                <AmountCell value={t.safe} bold />
              </tr>
              <tr className="border-t border-white/10 bg-white/[0.05]">
                <td className="px-4 py-2 font-bold">Balance (current month)</td>
                <td colSpan={casinos.length} />
                <AmountCell value={t.balance} bold />
              </tr>
              <tr className="border-t-2 border-primary/30 bg-gradient-to-r from-primary/10 to-transparent">
                <td className="px-4 py-3 font-extrabold uppercase tracking-widest text-primary">Total (SAFE + Balance)</td>
                <td colSpan={casinos.length} />
                <AmountCell value={t.total} bold />
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
                <AmountCell value={t.balance} bold />
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </div>
  );
}
