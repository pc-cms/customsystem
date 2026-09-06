/**
 * Specialized report panels for a closed Business Day.
 * Each panel renders an aggregated, human-readable view of the snapshot
 * for that section — NOT a raw transaction dump.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell, TableFooter } from "@/components/ui/table";
import { formatNumberSpaces, formatChipLabel, CASH_DENOMS, CHIP_DENOMS, allDenoms} from "@/lib/currency";
import ChipToken from "@/components/ChipToken";
const CATEGORY_LABELS: Record<string, string> = {};
import BreaklistGrid from "@/components/pit/BreaklistGrid";

type Row = Record<string, any>;
type PanelProps = { rows: Row[]; businessDate: string; casinoId: string };

const Empty = ({ msg = "No data recorded for this section." }: { msg?: string }) => (
  <p className="text-sm text-muted-foreground py-6 text-center">{msg}</p>
);

const num = (v: any) => Number(v ?? 0);

const Money = ({ v, signed = false }: { v: number; signed?: boolean }) => {
  const cls = v < 0 ? "cms-amount-negative" : v > 0 && signed ? "cms-amount-positive" : "";
  return <span className={`font-mono ${cls}`}>{formatNumberSpaces(v)}</span>;
};

/* ────────────────────────── EXPENSES ────────────────────────── */
export const ExpensesPanel = ({ rows }: PanelProps) => {
  const totals = useMemo(() => {
    const byCat = new Map<string, number>();
    let total = 0;
    rows.forEach(r => {
      const cat = String(r.category || "other");
      const a = num(r.amount);
      byCat.set(cat, (byCat.get(cat) || 0) + a);
      total += a;
    });
    return { byCat: Array.from(byCat.entries()).sort((a, b) => b[1] - a[1]), total };
  }, [rows]);

  if (!rows.length) return <Empty />;

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow><TableHead className="text-xs">Category</TableHead><TableHead className="text-xs text-right">Amount (TZS)</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {totals.byCat.map(([c, v]) => (
              <TableRow key={c}>
                <TableCell className="text-xs py-1.5">{(CATEGORY_LABELS as any)[c] || c}</TableCell>
                <TableCell className="text-xs py-1.5 text-right"><Money v={v} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow><TableCell className="text-xs font-semibold">Total</TableCell><TableCell className="text-xs text-right font-semibold"><Money v={totals.total} /></TableCell></TableRow>
          </TableFooter>
        </Table>
      </div>
      <div className="border rounded-md max-h-[420px] overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Category</TableHead>
              <TableHead className="text-xs">Description</TableHead>
              <TableHead className="text-xs">Player</TableHead>
              <TableHead className="text-xs text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r, i) => (
              <TableRow key={i}>
                <TableCell className="text-xs py-1">{(CATEGORY_LABELS as any)[r.category] || r.category}</TableCell>
                <TableCell className="text-xs py-1">{r.description}</TableCell>
                <TableCell className="text-xs py-1 text-muted-foreground">{r.player_name || ""}</TableCell>
                <TableCell className="text-xs py-1 text-right font-mono">{formatNumberSpaces(num(r.amount))}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

/* ────────────────────────── CASHLESS ────────────────────────── */
export const CashlessPanel = ({ rows }: PanelProps) => {
  const totals = useMemo(() => {
    // Sum by provider, signed: deposit → +, withdrawal → -
    const map = new Map<string, { in: number; out: number }>();
    let netAll = 0;
    rows.forEach(r => {
      const p = String(r.provider || "—");
      const a = num(r.amount);
      const dir = String(r.direction || "");
      const slot = map.get(p) || { in: 0, out: 0 };
      if (dir === "withdrawal" || dir === "out") slot.out += a;
      else slot.in += a;
      map.set(p, slot);
      netAll += (dir === "withdrawal" || dir === "out") ? -a : a;
    });
    return { rows: Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0])), netAll };
  }, [rows]);

  if (!rows.length) return <Empty />;

  return (
    <div className="border rounded-md max-w-xl">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-xs">Provider</TableHead>
            <TableHead className="text-xs text-right">Deposit</TableHead>
            <TableHead className="text-xs text-right">Withdrawal</TableHead>
            <TableHead className="text-xs text-right">Net</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {totals.rows.map(([p, v]) => {
            const net = v.in - v.out;
            return (
              <TableRow key={p}>
                <TableCell className="text-xs py-1.5">{p}</TableCell>
                <TableCell className="text-xs py-1.5 text-right font-mono">{formatNumberSpaces(v.in)}</TableCell>
                <TableCell className="text-xs py-1.5 text-right font-mono">{formatNumberSpaces(v.out)}</TableCell>
                <TableCell className="text-xs py-1.5 text-right"><Money v={net} signed /></TableCell>
              </TableRow>
            );
          })}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell className="text-xs font-semibold" colSpan={3}>Net total</TableCell>
            <TableCell className="text-xs text-right font-semibold"><Money v={totals.netAll} signed /></TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
};

/* ────────────────────────── TABLE CHECK (21:00 → 04:00 + Final) ────────────────────────── */
const TT_HOURS = ["21:00", "22:00", "23:00", "00:00", "01:00", "02:00", "03:00", "04:00"];

export const TableCheckPanel = ({ rows, casinoId }: PanelProps) => {
  const { data: tables = [] } = useQuery({
    queryKey: ["bd-tables", casinoId],
    queryFn: async () => {
      const { data } = await supabase.from("gaming_tables").select("id,name").eq("casino_id", casinoId);
      return data || [];
    },
    enabled: !!casinoId,
  });

  const grid = useMemo(() => {
    // tableId → { slot → value, final → value }
    const map = new Map<string, Record<string, number>>();
    rows.forEach(r => {
      const tid = String(r.table_id);
      const slot = String(r.time_slot);
      const slice = map.get(tid) || {};
      slice[slot] = num(r.value);
      map.set(tid, slice);
    });
    return map;
  }, [rows]);

  const tablesWithData = (tables as any[])
    .filter(t => grid.has(t.id))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (!rows.length) return <Empty />;

  return (
    <div className="border rounded-md overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-xs">Table</TableHead>
            {TT_HOURS.map(h => <TableHead key={h} className="text-xs text-right font-mono">{h}</TableHead>)}
            <TableHead className="text-xs text-right font-semibold">Final</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tablesWithData.map(t => {
            const slice = grid.get(t.id) || {};
            // Final = last available slot in the day for that table (max time_slot)
            const slots = Object.keys(slice).sort();
            const final = slots.length ? slice[slots[slots.length - 1]] : 0;
            return (
              <TableRow key={t.id}>
                <TableCell className="text-xs py-1 font-semibold">{t.name}</TableCell>
                {TT_HOURS.map(h => {
                  const v = slice[h];
                  return (
                    <TableCell key={h} className="text-xs py-1 text-right font-mono">
                      {v == null ? <span className="text-muted-foreground">·</span> : <Money v={v} signed />}
                    </TableCell>
                  );
                })}
                <TableCell className="text-xs py-1 text-right font-semibold"><Money v={final} signed /></TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
};

/* ────────────────────────── CHIP COUNT (final per location/denom) ────────────────────────── */
export const ChipCountPanel = ({ rows, casinoId }: PanelProps) => {
  const { data: tables = [] } = useQuery({
    queryKey: ["bd-tables", casinoId],
    queryFn: async () => {
      const { data } = await supabase.from("gaming_tables").select("id,name").eq("casino_id", casinoId);
      return data || [];
    },
    enabled: !!casinoId,
  });

  const tableName = (id: string) => (tables as any[]).find(t => t.id === id)?.name || id.slice(0, 6);

  const final = useMemo(() => {
    // Last snapshot per (location_type, location_id, denomination) by created_at
    const m = new Map<string, Row>();
    rows.forEach(r => {
      const k = `${r.location_type}|${r.location_id}|${r.denomination}`;
      const cur = m.get(k);
      if (!cur || new Date(r.created_at) > new Date(cur.created_at)) m.set(k, r);
    });
    return Array.from(m.values());
  }, [rows]);

  // Group by location, columns = denominations (largest → smallest)
  const grouped = useMemo(() => {
    const byLoc = new Map<string, { type: string; id: string; vals: Map<number, number> }>();
    final.forEach(r => {
      const key = `${r.location_type}|${r.location_id}`;
      const slot = byLoc.get(key) || { type: r.location_type, id: r.location_id, vals: new Map() };
      slot.vals.set(num(r.denomination), num(r.actual_quantity));
      byLoc.set(key, slot);
    });
    return Array.from(byLoc.values());
  }, [final]);

  if (!rows.length) return <Empty />;

  const denoms = [...CHIP_DENOMS]; // already largest → smallest

  // Sort: cage_table → cage_slot → tables (alpha) → others
  const order = (t: string) => (t === "cage_table" ? 0 : t === "cage_slot" ? 1 : t === "table" ? 2 : 3);
  const sorted = grouped.sort((a, b) => {
    if (order(a.type) !== order(b.type)) return order(a.type) - order(b.type);
    return tableName(a.id).localeCompare(tableName(b.id));
  });

  const totals: Record<number, number> = {};
  sorted.forEach(g => g.vals.forEach((q, d) => { totals[d] = (totals[d] || 0) + q; }));
  const grandValue = denoms.reduce((s, d) => s + d * (totals[d] || 0), 0);

  return (
    <div className="border rounded-md overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-xs">Location</TableHead>
            {denoms.map(d => <TableHead key={d} className="text-xs text-right font-mono"><div className="flex justify-end"><ChipToken denom={d} /></div></TableHead>)}
            <TableHead className="text-xs text-right font-semibold">Value</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map(g => {
            const value = denoms.reduce((s, d) => s + d * (g.vals.get(d) || 0), 0);
            const label = g.type === "table" ? tableName(g.id) : g.type === "cage_table" ? "Cage Table" : g.type === "cage_slot" ? "Cage Slot" : g.type;
            return (
              <TableRow key={`${g.type}-${g.id}`}>
                <TableCell className="text-xs py-1 font-semibold">{label}</TableCell>
                {denoms.map(d => {
                  const q = g.vals.get(d);
                  return <TableCell key={d} className="text-xs py-1 text-right font-mono">{q ? q : <span className="text-muted-foreground">·</span>}</TableCell>;
                })}
                <TableCell className="text-xs py-1 text-right font-mono font-semibold">{formatNumberSpaces(value)}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell className="text-xs font-semibold">Total qty</TableCell>
            {denoms.map(d => <TableCell key={d} className="text-xs text-right font-mono font-semibold">{totals[d] || ""}</TableCell>)}
            <TableCell className="text-xs text-right font-mono font-semibold">{formatNumberSpaces(grandValue)}</TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
};

/* ────────────────────────── BREAKLIST (live grid view) ────────────────────────── */
export const BreaklistPanel = ({ businessDate }: PanelProps) => {
  return <BreaklistGrid date={businessDate} zoom={75} />;
};

/* ────────────────────────── PLAYER STATS (only with result) ────────────────────────── */
export const PlayerStatsPanel = ({ rows, casinoId, businessDate }: PanelProps) => {
  // Aggregate per player_id
  const agg = useMemo(() => {
    const m = new Map<string, { hands: number; minutes: number; bet: number; sessions: number }>();
    rows.forEach(r => {
      const pid = String(r.player_id);
      const cur = m.get(pid) || { hands: 0, minutes: 0, bet: 0, sessions: 0 };
      cur.hands += num(r.hands_played);
      cur.minutes += num(r.duration_minutes);
      cur.bet += num(r.total_bet);
      cur.sessions += 1;
      m.set(pid, cur);
    });
    // Only players with a real result (any of: bet>0 or hands>0)
    return Array.from(m.entries()).filter(([, v]) => v.bet > 0 || v.hands > 0);
  }, [rows]);

  const playerIds = agg.map(([id]) => id);

  const { data: players = [] } = useQuery({
    queryKey: ["bd-players", playerIds.join(",")],
    queryFn: async () => {
      if (!playerIds.length) return [];
      const { data } = await supabase.from("players").select("id,first_name,last_name,nickname").in("id", playerIds);
      return data || [];
    },
    enabled: playerIds.length > 0,
  });

  const nameOf = (id: string) => {
    const p = (players as any[]).find(x => x.id === id);
    if (!p) return id.slice(0, 8);
    return [p.first_name, p.last_name].filter(Boolean).join(" ") || p.nickname || id.slice(0, 8);
  };

  if (!rows.length) return <Empty />;
  if (!agg.length) return <Empty msg="No players with recorded result." />;

  const sorted = agg.sort((a, b) => b[1].bet - a[1].bet);

  return (
    <div className="border rounded-md overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-xs">Player</TableHead>
            <TableHead className="text-xs text-right">Sessions</TableHead>
            <TableHead className="text-xs text-right">Hands</TableHead>
            <TableHead className="text-xs text-right">Minutes</TableHead>
            <TableHead className="text-xs text-right">Total Bet</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map(([pid, v]) => (
            <TableRow key={pid}>
              <TableCell className="text-xs py-1">{nameOf(pid)}</TableCell>
              <TableCell className="text-xs py-1 text-right font-mono">{v.sessions}</TableCell>
              <TableCell className="text-xs py-1 text-right font-mono">{v.hands}</TableCell>
              <TableCell className="text-xs py-1 text-right font-mono">{v.minutes}</TableCell>
              <TableCell className="text-xs py-1 text-right font-mono">{formatNumberSpaces(v.bet)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

/* ────────────────────────── CASH (consolidation) ────────────────────────── */
export const CashPanel = ({ rows, businessDate, casinoId }: PanelProps) => {
  // rows = snapshot.cash_counts (denominations per currency / wallet)
  // Plus: miss chips for the business_date, expenses subtotal (from snapshot via prop drilling),
  //       and other wallet balances (current — best-effort).
  // Miss chips for the day = aggregated cage chip count delta (closing_count.chip_miss_by_denom)
  // across all closed shifts whose business day matches `businessDate`.
  // Business day = EAT date of opened_at, rolls at 05:00 EAT (= 02:00 UTC).
  const { data: missChips = [] } = useQuery({
    queryKey: ["bd-miss-chips", casinoId, businessDate],
    queryFn: async () => {
      // Window: [businessDate 02:00 UTC, businessDate+1 02:00 UTC)
      const from = `${businessDate}T02:00:00Z`;
      const next = new Date(`${businessDate}T00:00:00Z`);
      next.setUTCDate(next.getUTCDate() + 1);
      const to = `${next.toISOString().slice(0, 10)}T02:00:00Z`;
      const { data } = await supabase
        .from("shifts")
        .select("closing_count")
        .eq("casino_id", casinoId)
        .eq("status", "closed")
        .gte("opened_at", from)
        .lt("opened_at", to);
      const agg = new Map<number, number>();
      (data || []).forEach((s: any) => {
        const byDenom = (s.closing_count?.chip_miss_by_denom || {}) as Record<string, number>;
        Object.entries(byDenom).forEach(([d, q]) => {
          const dn = Number(d), qn = Number(q);
          if (!dn || !qn) return;
          agg.set(dn, (agg.get(dn) || 0) + qn);
        });
      });
      return Array.from(agg.entries()).map(([denomination, quantity]) => ({
        denomination,
        quantity,
        total_value_tzs: denomination * quantity,
      }));
    },
    enabled: !!casinoId && !!businessDate,
  });

  // Denominations per currency from snapshot
  const cashByCcy = useMemo(() => {
    const m = new Map<string, { denoms: Record<number, number>; total: number }>();
    rows.forEach(r => {
      const ccy = String(r.currency || "TZS");
      const cur = m.get(ccy) || { denoms: {}, total: 0 };
      const denoms = (r.denominations || {}) as Record<string, number>;
      Object.entries(denoms).forEach(([d, q]) => {
        const dn = Number(d), qn = Number(q);
        cur.denoms[dn] = (cur.denoms[dn] || 0) + qn;
        cur.total += dn * qn;
      });
      // If denominations missing but total provided, use total.
      if (!Object.keys(denoms).length && r.total) cur.total += num(r.total);
      m.set(ccy, cur);
    });
    return m;
  }, [rows]);

  const missTotal = missChips.reduce((s: number, r: any) => s + num(r.total_value_tzs), 0);

  if (!rows.length && !missChips.length) {
    return <Empty msg="No cash count or miss chips recorded for this day." />;
  }

  return (
    <div className="space-y-4">
      {Array.from(cashByCcy.entries()).map(([ccy, v]) => {
        const denoms = (allDenoms(ccy).length ? allDenoms(ccy) : Object.keys(v.denoms).map(Number).sort((a, b) => b - a));
        return (
          <div key={ccy} className="border rounded-md">
            <div className="px-3 py-2 border-b text-xs font-semibold">{ccy} cash</div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Denomination</TableHead>
                  <TableHead className="text-xs text-right">Quantity</TableHead>
                  <TableHead className="text-xs text-right">Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {denoms.map(d => {
                  const q = v.denoms[d] || 0;
                  if (!q) return null;
                  return (
                    <TableRow key={d}>
                      <TableCell className="text-xs py-1 font-mono">{ccy === "TZS" ? <ChipToken denom={d} /> : d}</TableCell>
                      <TableCell className="text-xs py-1 text-right font-mono">{q}</TableCell>
                      <TableCell className="text-xs py-1 text-right font-mono">{formatNumberSpaces(d * q)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell className="text-xs font-semibold" colSpan={2}>Total {ccy}</TableCell>
                  <TableCell className="text-xs text-right font-semibold font-mono">{formatNumberSpaces(v.total)}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        );
      })}

      {missChips.length > 0 && (
        <div className="border rounded-md">
          <div className="px-3 py-2 border-b text-xs font-semibold">Miss chips · {businessDate}</div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Denomination</TableHead>
                <TableHead className="text-xs text-right">Quantity</TableHead>
                <TableHead className="text-xs text-right">Value (TZS)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...missChips].sort((a: any, b: any) => num(b.denomination) - num(a.denomination)).map((m: any, i) => (
                <TableRow key={i}>
                  <TableCell className="text-xs py-1 font-mono"><ChipToken denom={num(m.denomination)} /></TableCell>
                  <TableCell className="text-xs py-1 text-right font-mono">{num(m.quantity)}</TableCell>
                  <TableCell className="text-xs py-1 text-right font-mono">{formatNumberSpaces(num(m.total_value_tzs))}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell className="text-xs font-semibold" colSpan={2}>Miss total</TableCell>
                <TableCell className="text-xs text-right font-semibold font-mono"><Money v={missTotal} /></TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      )}
    </div>
  );
};

/* ────────────────────────── BAR · POS SHIFTS ────────────────────────── */
export const BarShiftsPanel = ({ rows }: PanelProps) => {
  if (!rows.length) return <Empty msg="No POS bar shifts closed on this business day." />;
  const tot = (r: Row, path: string[]) => {
    let v: any = r?.z_report;
    for (const p of path) v = v?.[p];
    return num(v);
  };
  let gross = 0, cash = 0, card = 0, ch = 0, cp = 0, bills = 0;
  rows.forEach(r => {
    gross += tot(r, ["totals", "gross_tzs"]);
    cash  += tot(r, ["totals", "cash"]);
    card  += tot(r, ["totals", "card"]);
    ch    += tot(r, ["totals", "comp_house"]);
    cp    += tot(r, ["totals", "comp_player"]);
    bills += tot(r, ["counts", "tabs_closed"]);
  });

  return (
    <div className="border rounded-md">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-xs">Segment</TableHead>
            <TableHead className="text-xs">Opened</TableHead>
            <TableHead className="text-xs">Closed</TableHead>
            <TableHead className="text-xs text-right">Bills</TableHead>
            <TableHead className="text-xs text-right">Gross</TableHead>
            <TableHead className="text-xs text-right">Cash</TableHead>
            <TableHead className="text-xs text-right">Card</TableHead>
            <TableHead className="text-xs text-right">Comp · House</TableHead>
            <TableHead className="text-xs text-right">Comp · Player</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r, i) => (
            <TableRow key={r.id ?? i}>
              <TableCell className="text-xs py-1.5 capitalize">{r.shift_type}</TableCell>
              <TableCell className="text-xs py-1.5 font-mono">{r.opened_at ? new Date(r.opened_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "—"}</TableCell>
              <TableCell className="text-xs py-1.5 font-mono">{r.closed_at ? new Date(r.closed_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "—"}</TableCell>
              <TableCell className="text-xs py-1.5 text-right font-mono">{tot(r, ["counts","tabs_closed"])}</TableCell>
              <TableCell className="text-xs py-1.5 text-right"><Money v={tot(r, ["totals","gross_tzs"])} /></TableCell>
              <TableCell className="text-xs py-1.5 text-right"><Money v={tot(r, ["totals","cash"])} /></TableCell>
              <TableCell className="text-xs py-1.5 text-right"><Money v={tot(r, ["totals","card"])} /></TableCell>
              <TableCell className="text-xs py-1.5 text-right"><Money v={tot(r, ["totals","comp_house"])} /></TableCell>
              <TableCell className="text-xs py-1.5 text-right"><Money v={tot(r, ["totals","comp_player"])} /></TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell className="text-xs font-semibold" colSpan={3}>Total</TableCell>
            <TableCell className="text-xs text-right font-semibold font-mono">{bills}</TableCell>
            <TableCell className="text-xs text-right font-semibold"><Money v={gross} /></TableCell>
            <TableCell className="text-xs text-right font-semibold"><Money v={cash} /></TableCell>
            <TableCell className="text-xs text-right font-semibold"><Money v={card} /></TableCell>
            <TableCell className="text-xs text-right font-semibold"><Money v={ch} /></TableCell>
            <TableCell className="text-xs text-right font-semibold"><Money v={cp} /></TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
};

/* ────────────────────────── BAR · STOCK COUNTS ────────────────────────── */
export const BarStockCountsPanel = ({ rows }: PanelProps) => {
  if (!rows.length) return <Empty msg="No stock counts recorded on this business day." />;
  return (
    <div className="border rounded-md">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-xs">Time</TableHead>
            <TableHead className="text-xs">Type</TableHead>
            <TableHead className="text-xs">Bartender</TableHead>
            <TableHead className="text-xs text-right">Items</TableHead>
            <TableHead className="text-xs text-right">Variance (TZS)</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r, i) => (
            <TableRow key={r.id ?? i}>
              <TableCell className="text-xs py-1.5 font-mono">{r.created_at ? new Date(r.created_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "—"}</TableCell>
              <TableCell className="text-xs py-1.5 capitalize">{r.count_type}</TableCell>
              <TableCell className="text-xs py-1.5">{r.counted_by_name ?? "—"}</TableCell>
              <TableCell className="text-xs py-1.5 text-right font-mono">{num(r.items_count)}</TableCell>
              <TableCell className="text-xs py-1.5 text-right"><Money v={num(r.total_variance_value_tzs)} signed /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};
