import { useState, useMemo } from "react";
import { usePlayers, useTransactions, useGamingTables } from "@/hooks/use-casino-data";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { offlineMutation } from "@/lib/offline-mutation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { logAction } from "@/lib/logging";
import { toast } from "sonner";
import CategoryFilter from "@/components/player/CategoryFilter";
import type { PlayerCategory } from "@/components/player/CategoryBadge";
import FloorTableCard, { type FloorTable } from "./FloorTableCard";
import TableSeatingDialog from "./TableSeatingDialog";
import type { SeatedPlayer } from "./SeatedPlayerChip";
import { getBusinessDate, businessDayHourUTC } from "@/lib/business-day";
import { useEffectiveBusinessDate } from "@/hooks/use-business-day-closure";
import { useNavigate } from "react-router-dom";
import { usePlayersDropCacheToday } from "@/hooks/use-drop-split";

const POKER_GAMES = ["Poker", "Texas Holdem", "Omaha", "PLO"];

const ActivePlayers = () => {
  const { data: players = [] } = usePlayers();
  const { data: tables = [] } = useGamingTables();
  const { data: serverBusinessDate } = useEffectiveBusinessDate();
  const today = serverBusinessDate || getBusinessDate();
  const windowStartUTC = businessDayHourUTC(today, 7);
  const { data: transactions = [] } = useTransactions(today);
  const { casinoId, user, roles } = useAuth();
  const canTransfer = roles.some(r => ["pit", "manager", "super_admin"].includes(r));
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<Set<PlayerCategory>>(
    new Set(["diamond", "platinum", "gold", "normal"])
  );
  const [openTableId, setOpenTableId] = useState<string | null>(null);
  const [pendingDropPlayer, setPendingDropPlayer] = useState<string | null>(null);
  

  const isTouch = typeof window !== "undefined" && "ontouchstart" in window;

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

  // Shared guard
  const guardCheckIn = async (playerId: string) => {
    const player = players.find(p => p.id === playerId);
    if (player?.status === "blacklist") throw new Error("BLACKLISTED — entry denied");
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
      // Move position back to hall
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

  // Drop R = today's peak-NEP per player, read from `player_day_drop_cache`
  // (single source of truth, maintained by DB triggers; matches Player
  // Statistics, Tables seated players and Dashboard exactly).
  const { data: dropCacheToday } = usePlayersDropCacheToday(today);
  // Cashout-today is still derived locally from already-loaded transactions
  // (per-business-day window): cashout is a plain sum, not dependent on the
  // peak-NEP formula, so this stays consistent with the cache.
  const cashoutToday = useMemo(() => {
    const out = new Map<string, number>();
    for (const t of transactions as any[]) {
      if (!t.player_id) continue;
      if (t.type !== "cashout" && t.type !== "out") continue;
      out.set(t.player_id, (out.get(t.player_id) || 0) + (Number(t.amount) || 0));
    }
    return out;
  }, [transactions]);

  // Build seated map: tableId -> SeatedPlayer[]
  const { seatedByTable, allSeatedIds } = useMemo(() => {
    const map: Record<string, SeatedPlayer[]> = {};
    const ids = new Set<string>();
    const activeSessions = sessions.filter((s: any) => !s.stopped_at);
    for (const s of activeSessions) {
      const p = players.find(pl => pl.id === s.player_id);
      if (!p || !s.table_id) continue;
      const cat = ((p as any).category as PlayerCategory) || "normal";
      if (!categoryFilter.has(cat)) continue;
      const sp_split = playerSplits.get(p.id) || { dropR: 0, cashout: 0 };
      const sp: SeatedPlayer = {
        id: p.id,
        first_name: p.first_name,
        last_name: p.last_name,
        nickname: (p as any).nickname,
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
    // Sort players within each table by category priority then started time
    Object.values(map).forEach(arr => arr.sort((a, b) => {
      if (a.category !== b.category) {
        const order: Record<PlayerCategory, number> = { diamond: 0, platinum: 1, gold: 2, normal: 3 };
        return order[a.category] - order[b.category];
      }
      return (a.startedAt?.getTime() ?? 0) - (b.startedAt?.getTime() ?? 0);
    }));
    return { seatedByTable: map, allSeatedIds: ids };
  }, [sessions, players, playerSplits, categoryFilter]);

  // Candidates: any player checked-in (present in casino) and not seated.
  // Falls back to status==="active" for legacy data without visits.
  const candidates = useMemo(() => {
    const visitIds = new Set(
      visits.filter((v: any) => !v.checked_out_at).map((v: any) => v.player_id)
    );
    return players
      .filter(p => (visitIds.has(p.id) || p.status === "active") && !allSeatedIds.has(p.id))
      .map(p => ({
        id: p.id,
        first_name: p.first_name,
        last_name: p.last_name,
        nickname: (p as any).nickname,
        category: ((p as any).category as PlayerCategory) || "normal",
        isCheckedIn: visitIds.has(p.id),
      }));
  }, [players, visits, allSeatedIds]);

  // Split tables into AR/BJ vs Poker columns (matches /tables page layout)
  const sortedTables = useMemo(() => {
    const all = [...tables].sort((a, b) => a.name.localeCompare(b.name));
    return {
      left: all.filter(t => !POKER_GAMES.includes(t.game)) as FloorTable[],
      right: all.filter(t => POKER_GAMES.includes(t.game)) as FloorTable[],
    };
  }, [tables]);

  // Search filter on tables (by player name)
  const tableMatchesSearch = (tableId: string): boolean => {
    if (!search) return true;
    const q = search.toLowerCase();
    const players = seatedByTable[tableId] || [];
    return players.some(p => `${p.first_name} ${p.last_name} ${p.nickname ?? ""}`.toLowerCase().includes(q));
  };

  const handleOpenTable = (tableId: string) => {
    const t = tables.find(x => x.id === tableId);
    if (t?.status === "closed") {
      toast.info("Table is closed");
      return;
    }
    setPendingDropPlayer(null);
    setOpenTableId(tableId);
  };

  const handlePlayerDropped = (tableId: string, playerId: string) => {
    const t = tables.find(x => x.id === tableId);
    if (t?.status === "closed") return;
    // If dropped on the same table, no-op
    const currentTable = Object.entries(seatedByTable).find(([_, arr]) => arr.some(p => p.id === playerId))?.[0];
    if (currentTable === tableId) return;
    setPendingDropPlayer(playerId);
    setOpenTableId(tableId);
  };

  const openTable = openTableId ? (tables.find(t => t.id === openTableId) as FloorTable | undefined) ?? null : null;
  const seatedHere = openTableId ? (seatedByTable[openTableId] || []) : [];
  const otherTables = useMemo(() => {
    if (!openTableId) return [];
    return tables
      .filter(t => t.id !== openTableId)
      .map(t => ({ table: t as FloorTable, players: seatedByTable[t.id] || [] }));
  }, [openTableId, tables, seatedByTable]);

  const totalSeated = Object.values(seatedByTable).reduce((s, arr) => s + arr.length, 0);

  const renderTable = (t: FloorTable) => {
    const dim = !tableMatchesSearch(t.id);
    return (
      <div key={t.id} className={dim ? "opacity-30 transition-opacity" : "transition-opacity"}>
        <FloorTableCard
          table={t}
          players={seatedByTable[t.id] || []}
          onOpen={() => handleOpenTable(t.id)}
          onPlayerDropped={(pid) => handlePlayerDropped(t.id, pid)}
          onStopPlayer={(pid) => stopSession.mutate(pid)}
          isTouch={isTouch}
        />
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <div className="cms-panel">
        <div className="px-3 py-2 border-b border-border flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-semibold text-card-foreground">
              Floor Map · {totalSeated} seated
            </h3>
            {!isTouch && (
              <span className="text-[10px] text-muted-foreground hidden md:inline">
                Drag a player chip onto another table to move
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <CategoryFilter selected={categoryFilter} onChange={setCategoryFilter} />
            <div className="relative max-w-[220px] w-full">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search seated player..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>
        </div>

        <div className="p-3">
          {tables.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">No tables configured</p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="space-y-2">
                <h4 className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-1 border-b border-border pb-1">AR / BJ</h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {sortedTables.left.map(renderTable)}
                </div>
                {sortedTables.left.length === 0 && (
                  <p className="text-[11px] text-muted-foreground text-center py-3">No AR/BJ tables</p>
                )}
              </div>
              <div className="space-y-2">
                <h4 className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-1 border-b border-border pb-1">Poker</h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {sortedTables.right.map(renderTable)}
                </div>
                {sortedTables.right.length === 0 && (
                  <p className="text-[11px] text-muted-foreground text-center py-3">No Poker tables</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <TableSeatingDialog
        open={!!openTableId}
        onOpenChange={(v) => { if (!v) { setOpenTableId(null); setPendingDropPlayer(null); } }}
        table={openTable}
        seated={seatedHere}
        otherTables={otherTables}
        candidates={candidates}
        prefilledPlayerId={pendingDropPlayer}
        isPending={placeAtTable.isPending || changeTable.isPending || stopSession.isPending || updateAvgBet.isPending}
        onPlace={(pid, bet) => openTableId && placeAtTable.mutate({ playerId: pid, tableId: openTableId, avgBet: bet })}
        onMove={(pid, bet) => openTableId && changeTable.mutate({ playerId: pid, tableId: openTableId, avgBet: bet })}
        onStop={(pid) => stopSession.mutate(pid)}
        onUpdateBet={(pid, bet) => updateAvgBet.mutate({ playerId: pid, avgBet: bet })}
      />

    </div>
  );
};

export default ActivePlayers;
