/**
 * LotteryTab — weekly player lottery (Friday → Thursday).
 *
 * Rules (manual, casino-set):
 *  - Period = the 7-day window Fri..Thu containing the picked date.
 *  - Each player's RESULT for the period = cashout − drop (cashout-buy).
 *  - 1 ticket per full 500,000 of result; losing players get double tickets.
 *  - Round-up rule: a remainder ≥ 270,000 grants one extra ticket.
 *  - Players with 0 tickets are hidden.
 *  - "Print" produces a clean Name + Tickets list.
 *
 * Read-only analytics: does NOT write anything to the database.
 */
import { ReactNode, useMemo, useState } from "react";
import { Ticket, ChevronLeft, ChevronRight, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageShell, PageSection } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { fmtDateOnly } from "@/lib/format-date";
import { formatNumberSpaces } from "@/lib/currency";
import { usePlayers, usePlayerEconomyRange } from "@/hooks/use-players";
import PrintPortal from "@/components/cage/PrintPortal";

const TICKET_UNIT = 500_000;
const ROUNDUP_THRESHOLD = 270_000;

/** Compute Friday on/before the given local date, return YYYY-MM-DD. */
const fridayOnOrBefore = (d: Date): string => {
  // JS: Sun=0..Sat=6, Fri=5. Days since Friday = (day - 5 + 7) % 7.
  const back = (d.getDay() - 5 + 7) % 7;
  const fri = new Date(d.getFullYear(), d.getMonth(), d.getDate() - back);
  return `${fri.getFullYear()}-${String(fri.getMonth() + 1).padStart(2, "0")}-${String(fri.getDate()).padStart(2, "0")}`;
};
const addDays = (iso: string, n: number): string => {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
};

const ticketsForResult = (result: number): number => {
  const abs = Math.abs(result);
  if (abs === 0) return 0;
  const full = Math.floor(abs / TICKET_UNIT);
  const remainder = abs - full * TICKET_UNIT;
  const base = full + (remainder >= ROUNDUP_THRESHOLD ? 1 : 0);
  // Losing players (negative result) get double tickets.
  return result < 0 ? base * 2 : base;
};


const playerName = (p: any) => {
  const nick = p.nickname ? ` "${p.nickname}"` : "";
  return `${p.last_name ?? ""} ${p.first_name ?? ""}${nick}`.trim() || "—";
};

export default function LotteryTab({ belowHeader }: { belowHeader?: ReactNode }) {
  const [periodStart, setPeriodStart] = useState<string>(() => fridayOnOrBefore(new Date()));
  const periodEnd = useMemo(() => addDays(periodStart, 6), [periodStart]);

  const { data: players = [] } = usePlayers();
  const { data: econ } = usePlayerEconomyRange({ from: periodStart, to: periodEnd });

  const rows = useMemo(() => {
    if (!econ) return [] as Array<{ id: string; name: string; result: number; tickets: number }>;
    const out: Array<{ id: string; name: string; result: number; tickets: number }> = [];
    for (const p of players as any[]) {
      const e = econ.get(p.id);
      if (!e) continue;
      const result = (e.cashout || 0) - (e.drop || 0);
      const tickets = ticketsForResult(result);
      if (tickets <= 0) continue;
      out.push({ id: p.id, name: playerName(p), result, tickets });
    }
    out.sort((a, b) => b.tickets - a.tickets || b.result - a.result || a.name.localeCompare(b.name));
    return out;
  }, [players, econ]);

  const totals = useMemo(() => ({
    players: rows.length,
    tickets: rows.reduce((s, r) => s + r.tickets, 0),
    result: rows.reduce((s, r) => s + r.result, 0),
  }), [rows]);

  const handlePrint = () => window.print();

  return (
    <PageShell>
      <PageHeader
        icon={Ticket}
        title="Lottery"
        subtitle="Weekly player draw · 1 ticket per 500 000 result (round up from 270 000) · losers get x2"
        centerSlot={
          <div className="flex items-center gap-6 text-center">
            <div>
              <div className="text-[11px] uppercase text-muted-foreground">Players</div>
              <div className="font-mono text-lg font-bold">{totals.players}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase text-muted-foreground">Tickets</div>
              <div className="font-mono text-lg font-bold">{totals.tickets}</div>
            </div>
          </div>
        }
        belowHeader={belowHeader}
      >
        <div className="flex items-center gap-2 print:hidden">
          <Button variant="outline" size="icon" onClick={() => setPeriodStart(p => addDays(p, -7))}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <div className="text-sm font-mono px-2 min-w-[230px] text-center">
            {fmtDateOnly(periodStart)} – {fmtDateOnly(periodEnd)}
          </div>
          <Button variant="outline" size="icon" onClick={() => setPeriodStart(p => addDays(p, 7))}>
            <ChevronRight className="w-4 h-4" />
          </Button>
          <Button variant="default" size="sm" className="gap-2" onClick={handlePrint} disabled={rows.length === 0}>
            <Printer className="w-4 h-4" /> Print
          </Button>
        </div>
      </PageHeader>

      <PageSection card={false}>
        {!econ ? (
          <div className="text-center text-muted-foreground py-12">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="text-center text-muted-foreground py-12">No eligible players this period</div>
        ) : (
          <div className="rounded-lg border bg-card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2 w-12">#</th>
                  <th className="text-left px-3 py-2">Player</th>
                  <th className="text-right px-3 py-2">Result</th>
                  <th className="text-right px-3 py-2 w-24">Tickets</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.id} className="border-t hover:bg-muted/30">
                    <td className="px-3 py-2 text-muted-foreground font-mono">{i + 1}</td>
                    <td className="px-3 py-2 font-medium">{r.name}</td>
                    <td className={`px-3 py-2 text-right font-mono ${r.result < 0 ? "cms-amount-negative" : "cms-amount-positive"}`}>{formatNumberSpaces(r.result)}</td>
                    <td className="px-3 py-2 text-right font-mono font-bold">{r.tickets}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-muted/30 text-xs">
                <tr>
                  <td className="px-3 py-2" colSpan={2}>Total</td>
                  <td className="px-3 py-2 text-right font-mono">{formatNumberSpaces(totals.result)}</td>
                  <td className="px-3 py-2 text-right font-mono font-bold">{totals.tickets}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </PageSection>

      {/* Print-only view: clean Name + Tickets list */}
      <PrintPortal>
        {(() => {
          const n = rows.length;
          const cols = n <= 32 ? 1 : n <= 70 ? 2 : n <= 120 ? 3 : 4;
          const perCol = Math.ceil(n / cols) || 1;
          const chunks = Array.from({ length: cols }, (_, c) => rows.slice(c * perCol, (c + 1) * perCol));
          const fs = cols >= 4 ? "9px" : cols === 3 ? "10px" : cols === 2 ? "11px" : "13px";
          const pad = cols >= 3 ? "1px 2px" : "2px 4px";
          return (
            <div style={{ padding: "6mm" }}>
              <div style={{ textAlign: "center", marginBottom: "3mm" }}>
                <h1 style={{ fontSize: cols === 1 ? "18px" : "15px", fontWeight: 700, margin: 0 }}>Lottery — Player Tickets</h1>
                <div style={{ fontSize: "11px" }}>
                  {fmtDateOnly(periodStart)} – {fmtDateOnly(periodEnd)} · {totals.players} players · {totals.tickets} tickets
                </div>
              </div>
              <div style={{ display: "flex", gap: "4mm", alignItems: "flex-start" }}>
                {chunks.map((chunk, ci) => (
                  <table key={ci} style={{ flex: 1, borderCollapse: "collapse", fontSize: fs }}>
                    <thead>
                      <tr style={{ borderBottom: "1.5px solid #000" }}>
                        <th style={{ textAlign: "left", padding: pad, width: "22px" }}>#</th>
                        <th style={{ textAlign: "left", padding: pad }}>Player</th>
                        <th style={{ textAlign: "right", padding: pad, width: "34px" }}>Tk</th>
                      </tr>
                    </thead>
                    <tbody>
                      {chunk.map((r, i) => (
                        <tr key={r.id} style={{ borderBottom: "1px solid #ddd" }}>
                          <td style={{ padding: pad }}>{ci * perCol + i + 1}</td>
                          <td style={{ padding: pad, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: cols >= 3 ? "45mm" : "70mm" }}>{r.name}</td>
                          <td style={{ padding: pad, textAlign: "right", fontWeight: 700, fontFamily: "monospace" }}>{r.tickets}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ))}
              </div>
            </div>
          );
        })()}
      </PrintPortal>

    </PageShell>
  );
}
