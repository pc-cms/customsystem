import { useEffect, useState, useMemo } from "react";
import { useSessionState } from "@/hooks/use-session-state";
import { useNavigate } from "react-router-dom";
import { useGamingTables, useTransactions, useTableTracker, usePlayers } from "@/hooks/use-casino-data";
import { useActiveShift } from "@/hooks/use-shift";
import { useChipSnapshots } from "@/hooks/use-chips";
import { useChipBaseline, useOpenAllTables, baselineToMap } from "@/hooks/use-table-lifecycle";
import { useReopenTable } from "@/hooks/use-tables";

import { getBusinessDate, businessDayHourUTC } from "@/lib/business-day";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateNavigator } from "@/components/ui/date-navigator";
import { formatCurrency, formatNumberSpaces } from "@/lib/currency";
import { Play, Lock, LayoutGrid } from "lucide-react";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { CloseBusinessDayButton } from "@/components/pit/CloseBusinessDayButton";


import { liveTableResult, buildLatestTableSnapshot } from "@/lib/table-live-result";
import { useShiftTableAdjustments } from "@/hooks/use-shift-table-adjustments";
import TableSeatingDialog from "@/components/pit/TableSeatingDialog";

import type { FloorTable } from "@/components/pit/FloorTableCard";
import type { SeatedPlayer } from "@/components/pit/SeatedPlayerChip";
import type { PlayerCategory } from "@/components/player/CategoryBadge";
import { useAuth } from "@/lib/auth-context";
import { useBusinessDayFilter } from "@/hooks/use-business-day-filter";
import { useEffectiveBusinessDate } from "@/hooks/use-business-day-closure";
import { useReadOnlyMode } from "@/hooks/use-readonly-mode";
import { useTablesDropSplit } from "@/hooks/use-drop-split";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { offlineMutation } from "@/lib/offline-mutation";
import { logAction } from "@/lib/logging";
import { toast } from "sonner";
import CategoryBadge from "@/components/player/CategoryBadge";

const Tables = () => {
  const { data: serverBusinessDate } = useEffectiveBusinessDate();
  const businessDay = serverBusinessDate || getBusinessDate();
  const { restrictedToToday } = useBusinessDayFilter();
  const [date, setDate] = useSessionState<string>("date", businessDay);
  // Operational roles (Pit) without Manager Access cannot browse other days.
  const effectiveDate = restrictedToToday ? businessDay : date;

  useEffect(() => {
    if (restrictedToToday || !businessDay) return;
    const marker = "cms:tables:last-auto-business-day";
    try {
      const lastAutoDay = window.sessionStorage.getItem(marker);
      if (lastAutoDay === businessDay) return;
      window.sessionStorage.setItem(marker, businessDay);
      if (date !== businessDay) setDate(businessDay);
    } catch {
      if (date !== businessDay) setDate(businessDay);
    }
  }, [businessDay, date, restrictedToToday, setDate]);

  const { data: tables = [] } = useGamingTables();
  const { data: players = [] } = usePlayers();
  const { data: transactions = [] } = useTransactions(effectiveDate);
  const { data: shift } = useActiveShift();
  const { data: snapshots = [] } = useChipSnapshots(effectiveDate);
  const { data: baseline = [] } = useChipBaseline();
  const openAllTables = useOpenAllTables();
  const reopenTable = useReopenTable();
  const { casinoId, user } = useAuth();
  const isReadOnly = useReadOnlyMode();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const today = businessDay;
  const windowStartUTC = businessDayHourUTC(today, 7);

  // Close Table wizard
  
  // Seating dialog
  const [openTableId, setOpenTableId] = useState<string | null>(null);

  const baselineMap = useMemo(() => baselineToMap(baseline), [baseline]);

  const closedTables = useMemo(() => tables.filter(t => t.status === "closed"), [tables]);
  const openTables = useMemo(() => tables.filter(t => t.status === "open"), [tables]);
  const tablesWithResults = useMemo(() => tables.filter(t => t.closing_result !== null && t.status === "open"), [tables]);
  const hasResults = tablesWithResults.length > 0;

  const { data: trackerData = [] } = useTableTracker(effectiveDate);

  // Active sessions & visits for today (for seating dialog)
  const { data: sessions = [] } = useQuery({
    queryKey: ["client_sessions", casinoId, today],
    queryFn: async () => {
      const { data } = await supabase
        .from("client_sessions")
        .select("*")
        .eq("casino_id", casinoId!)
        .gte("started_at", windowStartUTC)
        .order("started_at", { ascending: false });
      return (data || []) as any[];
    },
    enabled: !!casinoId,
    refetchInterval: 15000,
  });

  const { data: visits = [] } = useQuery({
    queryKey: ["casino_visits", casinoId, today],
    queryFn: async () => {
      const { data } = await supabase
        .from("casino_visits")
        .select("*")
        .eq("casino_id", casinoId!)
        .eq("date", today);
      return (data || []) as any[];
    },
    enabled: !!casinoId,
    refetchInterval: 15000,
  });

  const guardCheckIn = async (playerId: string) => {
    const player = players.find(p => p.id === playerId);
    if ((player as any)?.status === "blacklist") throw new Error("BLACKLISTED — entry denied");
    if (navigator.onLine) {
      const { data: activeElsewhere } = await supabase
        .rpc("player_active_visit_casino", { _player_id: playerId } as any);
      if (activeElsewhere && activeElsewhere.length > 0) {
        const loc = activeElsewhere[0];
        if (loc.casino_id !== casinoId) {
          throw new Error(`Player is currently active at ${loc.casino_name}`);
        }
      }
    }
  };

  const placeAtTable = useMutation({
    mutationFn: async ({ playerId, tableId, avgBet }: { playerId: string; tableId: string; avgBet: number }) => {
      await guardCheckIn(playerId);
      const sessionId = crypto.randomUUID();
      const sRes = await offlineMutation({
        table: "client_sessions",
        operation: "insert",
        payload: { id: sessionId, casino_id: casinoId!, player_id: playerId, table_id: tableId, avg_bet: avgBet, created_by: user!.id },
      });
      if (sRes.error) throw new Error(sRes.error);
      const vRes = await offlineMutation({
        table: "casino_visits",
        operation: "upsert",
        payload: { casino_id: casinoId!, player_id: playerId, date: today, checked_in_by: user!.id, position: "table" },
        upsertConflict: "casino_id,player_id,date",
      });
      if (vRes.error) throw new Error(vRes.error);
      if (!sRes.offline && casinoId) {
        await logAction(casinoId, "player", "PLAYER_SEATED", { player_id: playerId, table_id: tableId, avg_bet: avgBet });
      }
      return { offline: sRes.offline || vRes.offline };
    },
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ["client_sessions"] });
      queryClient.invalidateQueries({ queryKey: ["casino_visits"] });
      toast.success(res?.offline ? "Saved offline" : "Player seated");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const changeTable = useMutation({
    mutationFn: async ({ playerId, tableId, avgBet }: { playerId: string; tableId: string; avgBet: number }) => {
      const stopRes = await offlineMutation({
        table: "client_sessions",
        operation: "update",
        payload: {
          _match: { casino_id: casinoId!, player_id: playerId, stopped_at: null as any },
          stopped_at: new Date().toISOString(),
        },
      });
      if (stopRes.error && navigator.onLine) throw new Error(stopRes.error);
      const sessionId = crypto.randomUUID();
      const insRes = await offlineMutation({
        table: "client_sessions",
        operation: "insert",
        payload: { id: sessionId, casino_id: casinoId!, player_id: playerId, table_id: tableId, avg_bet: avgBet, created_by: user!.id },
      });
      if (insRes.error) throw new Error(insRes.error);
      return { offline: stopRes.offline || insRes.offline };
    },
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ["client_sessions"] });
      toast.success(res?.offline ? "Saved offline" : "Player moved");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const stopSession = useMutation({
    mutationFn: async (playerId: string) => {
      const res = await offlineMutation({
        table: "client_sessions",
        operation: "update",
        payload: {
          _match: { casino_id: casinoId!, player_id: playerId, stopped_at: null as any },
          stopped_at: new Date().toISOString(),
        },
      });
      if (res.error) throw new Error(res.error);
      await offlineMutation({
        table: "casino_visits",
        operation: "update",
        payload: { _match: { casino_id: casinoId!, player_id: playerId, date: today }, position: "hall" },
      });
      return { offline: res.offline };
    },
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ["client_sessions"] });
      queryClient.invalidateQueries({ queryKey: ["casino_visits"] });
      toast.success(res?.offline ? "Saved offline" : "Session stopped");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateAvgBet = useMutation({
    mutationFn: async ({ playerId, avgBet }: { playerId: string; avgBet: number }) => {
      const res = await offlineMutation({
        table: "client_sessions",
        operation: "update",
        payload: {
          _match: { casino_id: casinoId!, player_id: playerId, stopped_at: null as any },
          avg_bet: avgBet,
        },
      });
      if (res.error) throw new Error(res.error);
      return { offline: res.offline };
    },
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ["client_sessions"] });
      toast.success(res?.offline ? "Saved offline" : "Avg bet updated");
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Per-player Drop R for seated players (NEP-aware via useTablesDropSplit gives per-table; for per-player use windowed walk over current transactions list).
  // Sufficient: take all txs of the player up to "now" and apply NEP locally.
  const playerSplitsForSeated = useMemo(() => {
    // Group all txs by player
    const byPlayer = new Map<string, any[]>();
    for (const t of transactions as any[]) {
      if (!t.player_id) continue;
      let arr = byPlayer.get(t.player_id);
      if (!arr) { arr = []; byPlayer.set(t.player_id, arr); }
      arr.push(t);
    }
    const out = new Map<string, { dropR: number; cashout: number }>();
    for (const [pid, txs] of byPlayer) {
      txs.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
      let nep = 0, dropR = 0, cashout = 0;
      for (const t of txs) {
        const amt = Number(t.amount) || 0;
        if (t.type === "buy" || t.type === "in") {
          const rec = nep < 0 ? Math.min(amt, -nep) : 0;
          dropR += amt - rec;
          nep += amt;
        } else if (t.type === "cashout" || t.type === "out") {
          cashout += amt;
          nep -= amt;
        }
      }
      out.set(pid, { dropR, cashout });
    }
    return out;
  }, [transactions]);

  const { seatedByTable, allSeatedIds } = useMemo(() => {
    const map: Record<string, SeatedPlayer[]> = {};
    const ids = new Set<string>();
    const activeSessions = sessions.filter((s: any) => !s.stopped_at);
    for (const s of activeSessions) {
      const p = players.find(pl => pl.id === s.player_id);
      if (!p || !s.table_id) continue;
      const cat = ((p as any).category as PlayerCategory) || "normal";
      const sp_split = playerSplitsForSeated.get(p.id) || { dropR: 0, cashout: 0 };
      const sp: SeatedPlayer = {
        id: p.id,
        first_name: p.first_name,
        last_name: p.last_name,
        nickname: (p as any).nickname,
        photo_url: (p as any).photo_url ?? null,
        category: cat,
        avgBet: Number(s.avg_bet || 0),
        startedAt: s.started_at ? new Date(s.started_at) : null,
        dropR: sp_split.dropR,
        result: sp_split.dropR - sp_split.cashout,
      };
      if (!map[s.table_id]) map[s.table_id] = [];
      map[s.table_id].push(sp);
      ids.add(p.id);
    }
    Object.values(map).forEach(arr => arr.sort((a, b) => {
      if (a.category !== b.category) {
        const order: Record<PlayerCategory, number> = { diamond: 0, platinum: 1, gold: 2, normal: 3 };
        return order[a.category] - order[b.category];
      }
      return (a.startedAt?.getTime() ?? 0) - (b.startedAt?.getTime() ?? 0);
    }));
    return { seatedByTable: map, allSeatedIds: ids };
  }, [sessions, players, playerSplitsForSeated]);

  const candidates = useMemo(() => {
    const visitIds = new Set(
      visits.filter((v: any) => !v.checked_out_at).map((v: any) => v.player_id)
    );
    return players
      .filter(p => (p as any).status === "active" && !allSeatedIds.has(p.id))
      .map(p => ({
        id: p.id,
        first_name: p.first_name,
        last_name: p.last_name,
        nickname: (p as any).nickname,
        category: ((p as any).category as PlayerCategory) || "normal",
        isCheckedIn: visitIds.has(p.id),
      }));
  }, [players, visits, allSeatedIds]);

  const shiftTransactions = useMemo(() => {
    if (!shift) return transactions;
    return transactions.filter(t => t.shift_id === shift.id);
  }, [transactions, shift]);

  const snapshotIndex = useMemo(() => buildLatestTableSnapshot(snapshots as any), [snapshots]);
  const { adjustmentMap } = useShiftTableAdjustments(effectiveDate === businessDay ? (shift?.id ?? null) : null);

  // Table DROP = NEP-aware Drop R (external cash only), same source of truth
  // as Player Statistics. Computed by `compute_tables_drop_split` RPC over the
  // current business-day window so the two pages always agree.
  const dropWindowStart = businessDayHourUTC(effectiveDate, 7);
  const dropWindowEnd = businessDayHourUTC(effectiveDate, 7 + 24);
  const { data: tablesDropSplit } = useTablesDropSplit(dropWindowStart, dropWindowEnd);

  const tableStats = useMemo(() => {
    const stats: Record<string, { drop: number; result: number }> = {};
    tables.forEach(t => {
      const drop = tablesDropSplit?.get(t.id)?.dropR ?? 0;
      const result = liveTableResult({
        tableId: t.id,
        closingResult: t.closing_result as any,
        snapshotIndex,
        baselineMap,
        adjustmentMap,
      });
      stats[t.id] = { drop, result };
    });
    return stats;
  }, [tables, tablesDropSplit, snapshotIndex, baselineMap, adjustmentMap, effectiveDate]);

  const handleOpenAll = () => {
    const ids = closedTables.map(t => t.id);
    openAllTables.mutate(ids);
  };

  const gameTypeTotals = useMemo(() => {
    const totals: Record<string, { drop: number; result: number; label: string }> = {};
    const gameLabels: Record<string, string> = { "American Roulette": "TOTAL ARs", "Poker": "TOTAL POKER", "Texas Holdem": "TOTAL POKER", "Omaha": "TOTAL POKER", "PLO": "TOTAL POKER", "Club Poker": "TOTAL POKER", "Blackjack": "TOTAL BJ" };
    tables.forEach(t => {
      const label = gameLabels[t.game] || `Total ${t.game}`;
      if (!totals[label]) totals[label] = { drop: 0, result: 0, label };
      const r = tableStats[t.id] || { drop: 0, result: 0 };
      totals[label].drop += r.drop;
      totals[label].result += r.result;
    });
    return totals;
  }, [tables, tableStats]);

  const totalDrop = Object.values(tableStats).reduce((s, r) => s + r.drop, 0);
  const totalResult = Object.values(tableStats).reduce((s, r) => s + r.result, 0);

  const pokerGames = ["Poker", "Texas Holdem", "Omaha", "PLO", "Club Poker"];
  const byOrder = (a: any, b: any) =>
    ((a.display_order ?? 0) - (b.display_order ?? 0)) || a.name.localeCompare(b.name);
  const leftTables = tables.filter(t => !pokerGames.includes(t.game)).sort(byOrder);
  const rightTables = tables.filter(t => pokerGames.includes(t.game)).sort(byOrder);

  const openTable = openTableId ? (tables.find(t => t.id === openTableId) as FloorTable | undefined) ?? null : null;
  const seatedHere = openTableId ? (seatedByTable[openTableId] || []) : [];
  const otherTables = useMemo(() => {
    if (!openTableId) return [];
    return tables
      .filter(t => t.id !== openTableId)
      .map(t => ({ table: t as FloorTable, players: seatedByTable[t.id] || [] }));
  }, [openTableId, tables, seatedByTable]);

  const handleTableClick = (table: typeof tables[0]) => {
    if (table.status === "closed") {
      toast.info("Table is closed");
      return;
    }
    setOpenTableId(table.id);
  };

  const renderTableCard = (table: typeof tables[0]) => {
    const r = tableStats[table.id] || { drop: 0, result: 0 };
    const isOpen = table.status === "open";
    const hasTableResult = table.closing_result !== null;
    const seated = seatedByTable[table.id] || [];

    return (
      <div
        key={table.id}
        className={`cms-panel text-left w-full transition-colors ${isOpen ? "hover:bg-muted/30 cursor-pointer" : "opacity-80"}`}
        onClick={() => isOpen && handleTableClick(table)}
        role={isOpen ? "button" : undefined}
      >
        {/* Header: Name | DROP | RESULT | OPEN/CLOSED */}
        <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 px-4 py-2.5 border-b border-border">
          <div className="flex items-center gap-2 min-w-0">
            <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${isOpen ? "bg-success" : "bg-destructive"}`} />
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-card-foreground truncate leading-tight">{table.name}</h3>
              <p className="text-[10px] text-muted-foreground truncate leading-tight">{table.game}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[9px] uppercase text-muted-foreground tracking-wider leading-none">Drop</p>
            <p className="font-mono text-lg font-bold text-card-foreground whitespace-nowrap mt-0.5">{formatCurrency(r.drop)}</p>
          </div>
          <div className="text-right">
            <p className="text-[9px] uppercase text-muted-foreground tracking-wider leading-none">Result</p>
            <p className={`font-mono text-lg font-bold whitespace-nowrap mt-0.5 ${r.result >= 0 ? "cms-amount-positive" : "cms-amount-negative"}`}>
              {r.result >= 0 ? "+" : ""}{formatCurrency(r.result)}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant={isOpen ? "default" : "secondary"} className="text-[10px] uppercase">{table.status}</Badge>
            {!isOpen && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1 text-xs"
                disabled={reopenTable.isPending}
                onClick={(e) => { e.stopPropagation(); reopenTable.mutate(table.id); }}
              >
                <Play className="w-3 h-3" /> Open
              </Button>
            )}
          </div>
        </div>

        {/* Seated players: photo + name + avg bet */}
        {seated.length > 0 && (
          <div className="px-4 py-3 flex flex-wrap gap-3">
            {seated.map(p => {
              const initials = `${p.first_name?.[0] ?? ""}${p.last_name?.[0] ?? ""}`.toUpperCase();
              return (
                <div key={p.id} className="flex flex-col items-center w-[64px]">
                  <div className="relative">
                    {p.photo_url ? (
                      <img
                        src={p.photo_url}
                        alt={`${p.first_name} ${p.last_name}`}
                        className="w-10 h-10 rounded-full object-cover border border-border"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-[11px] font-mono font-semibold text-muted-foreground border border-border">
                        {initials}
                      </div>
                    )}
                  </div>
                  <p className="text-[10px] font-medium text-card-foreground truncate max-w-[64px] mt-1 text-center">
                    {p.first_name} {p.last_name?.[0] ?? ""}.
                  </p>
                  <p className="font-mono text-[10px] text-muted-foreground">
                    {formatNumberSpaces(p.avgBet)}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <PageShell>
      <PageHeader
        icon={LayoutGrid}
        title="Tables Tracking"
        subtitle="Float, Result & Seating"
      >
        {restrictedToToday ? (
          <div className="text-sm font-semibold font-mono text-foreground px-3 py-1.5 rounded bg-muted/60 border border-border">
            Business day · {businessDay}
          </div>
        ) : (
          <DateNavigator value={date} onChange={setDate} />
        )}

        {closedTables.length > 0 && (
          <Button variant="outline" size="sm" onClick={handleOpenAll} disabled={openAllTables.isPending} className="gap-1.5">
            <Play className="w-4 h-4" /> Open{closedTables.length < tables.length ? ` (${closedTables.length})` : " All"}
          </Button>
        )}

        <Button size="sm" onClick={() => navigate("/tables/close")} disabled={openTables.length === 0} className="gap-1.5">
          <Lock className="w-4 h-4" /> {isReadOnly ? "Closing Check" : "Close Table"}
        </Button>

        {hasResults && tablesWithResults.length === openTables.length && (
          <Badge variant="outline" className="text-xs gap-1 border-success text-success">
            <Lock className="w-3 h-3" /> All counted — ready to close
          </Badge>
        )}

        <CloseBusinessDayButton />
      </PageHeader>

      <>
      <div className="grid gap-3 mb-6" style={{ gridTemplateColumns: `repeat(${Object.keys(gameTypeTotals).length + 1}, minmax(0, 1fr))` }}>
        {Object.entries(gameTypeTotals).map(([game, t]) => (
          <div key={game} className="cms-panel p-4">
            <p className="text-xs uppercase text-muted-foreground tracking-wider">{t.label}</p>
            <p className={`font-mono text-2xl font-bold mt-1 whitespace-nowrap ${t.result >= 0 ? "cms-amount-positive" : "cms-amount-negative"}`}>
              {t.result >= 0 ? "+" : ""}{formatCurrency(t.result)}
            </p>
            <p className="font-mono text-xs text-muted-foreground mt-1">​</p>
          </div>
        ))}
        <div className="cms-panel p-4 border-primary/30">
          <p className="text-xs uppercase text-muted-foreground tracking-wider">Total Casino</p>
          <p className={`font-mono text-2xl font-bold mt-1 whitespace-nowrap ${totalResult >= 0 ? "cms-amount-positive" : "cms-amount-negative"}`}>
            {totalResult >= 0 ? "+" : ""}{formatCurrency(totalResult)}
          </p>
          <p className="font-mono text-xs text-muted-foreground mt-1">​</p>
        </div>
      </div>

      {hasResults && (
        <div className="cms-panel p-4 mb-4 border-success/30">
          <p className="text-xs font-semibold text-card-foreground mb-2">📊 Table Results (waiting for Cashier to close)</p>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
            {tablesWithResults.map(t => (
              <div key={t.id} className="p-2 rounded bg-muted/30 text-center">
                <p className="text-xs font-medium text-card-foreground">{t.name}</p>
                <p className={`font-mono text-sm font-bold ${Number(t.closing_result) >= 0 ? "text-success" : "text-destructive"}`}>
                  {Number(t.closing_result) >= 0 ? "+" : ""}{formatCurrency(Number(t.closing_result))}
                </p>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground mt-2">
            Total chip result: <span className="font-mono font-bold">{formatCurrency(tablesWithResults.reduce((s, t) => s + Number(t.closing_result || 0), 0))}</span>
          </p>
        </div>
      )}

      {/* Two-column Table Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="space-y-3">
          <h3 className="font-medium text-muted-foreground uppercase tracking-wider px-1 border-b border-border pb-1 text-xl">AR / BJ</h3>
          {leftTables.map(renderTableCard)}
          {leftTables.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">No AR/BJ tables</p>}
        </div>
        <div className="space-y-3">
          <h3 className="font-medium text-muted-foreground uppercase tracking-wider px-1 border-b border-border pb-1 text-xl">Poker</h3>
          {rightTables.map(renderTableCard)}
          {rightTables.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">No Poker tables</p>}
        </div>
      </div>
      {tables.length === 0 && <p className="text-muted-foreground text-sm text-center py-8">No tables configured</p>}





      <TableSeatingDialog
        open={!!openTableId}
        onOpenChange={(v) => { if (!v) setOpenTableId(null); }}
        table={openTable}
        seated={seatedHere}
        otherTables={otherTables}
        candidates={candidates}
        prefilledPlayerId={null}
        isPending={placeAtTable.isPending || changeTable.isPending || stopSession.isPending || updateAvgBet.isPending}
        onPlace={(pid, bet) => openTableId && placeAtTable.mutate({ playerId: pid, tableId: openTableId, avgBet: bet })}
        onMove={(pid, bet) => openTableId && changeTable.mutate({ playerId: pid, tableId: openTableId, avgBet: bet })}
        onStop={(pid) => stopSession.mutate(pid)}
        onUpdateBet={(pid, bet) => updateAvgBet.mutate({ playerId: pid, avgBet: bet })}
      />
      </>
    </PageShell>
  );
};

export default Tables;
