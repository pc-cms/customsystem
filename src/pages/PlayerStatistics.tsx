import { useState, useMemo, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { BarChart3, Search, ArrowUp, ArrowDown, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { usePlayers, useGamingTables } from "@/hooks/use-casino-data";
import { usePlayersDropSplit } from "@/hooks/use-drop-split";
import { getBusinessDate, businessDayHourUTC } from "@/lib/business-day";
import { useEffectiveBusinessDate } from "@/hooks/use-business-day-closure";
import { canSeePlayerFinancials, canSeeAllTimeData } from "@/lib/role-access";
import { Button } from "@/components/ui/button";

import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { PlayerPreviewHeader } from "@/components/player/PlayerPreviewHeader";
import { useSelectedPlayer } from "@/hooks/use-selected-player";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DateRangePresets, type DatePreset, presetRange } from "@/components/ui/date-range-presets";
import { DateNavigator } from "@/components/ui/date-navigator";
import { getTableCellClasses } from "@/lib/table-colors";
import CategoryBadge, { type PlayerCategory } from "@/components/player/CategoryBadge";
import CategoryFilter from "@/components/player/CategoryFilter";
import FlagBadges from "@/components/player/FlagBadges";
import { formatCurrency, formatNumberCompact, formatInputWithSpaces, parseSpacedNumber } from "@/lib/currency";
import { formatCardNumber } from "@/lib/card-number";
import { offlineMutation } from "@/lib/offline-mutation";
import { toast } from "sonner";
import { usePlayerDailyAvgBets, useSetPlayerDailyAvgBet, type AvgBetGroup } from "@/hooks/use-player-daily-avg-bets";
import { useCreatePlayerChipAdjustment } from "@/hooks/use-player-chip-adjustments";



type TabKey = "day" | "present" | "left";

const formatTime = (iso?: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

const MAX_DAYS_BACK = 90;
const subDays = (iso: string, n: number) => {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const PlayerStatistics = () => {
  const navigate = useNavigate();
  const { casinoId, roles, user } = useAuth();
  const { data: serverBusinessDate } = useEffectiveBusinessDate();
  const today = serverBusinessDate || getBusinessDate();
  // Manager and Floor Manager can also browse historical periods (day/week/month/year/custom)
  const canBrowseHistory =
    canSeeAllTimeData(roles) ||
    roles.includes("manager") ||
    roles.includes("floor_manager");
  const minDate = subDays(today, -MAX_DAYS_BACK);

  // Date model: anchor `date` for single-day mode + period preset/range for managers.
  const [date, setDate] = useState(today);
  const [preset, setPreset] = useState<DatePreset>("day");
  const [range, setRange] = useState<{ from: string; to: string }>({ from: today, to: today });

  // Effective range is what drives ALL queries.
  const effectiveRange = useMemo<{ from: string; to: string }>(() => {
    if (!canBrowseHistory) return { from: today, to: today };
    if (preset === "day") return { from: date, to: date };
    return range;
  }, [canBrowseHistory, today, preset, date, range]);
  const isValidIsoDate = (s: string | undefined | null): s is string =>
    !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(`${s}T00:00:00.000Z`).getTime());
  const fromDate = isValidIsoDate(effectiveRange.from) ? effectiveRange.from : today;
  const toDate = isValidIsoDate(effectiveRange.to) ? effectiveRange.to : today;
  const isMultiDay = fromDate !== toDate;
  const isHistorical = toDate !== today || fromDate !== today;
  const windowStartUTC = businessDayHourUTC(fromDate, 7);
  const windowEndUTC = businessDayHourUTC(toDate, 7 + 24);
  const queryClient = useQueryClient();
  const canEditPosition = !isMultiDay && !isHistorical && roles.some(r => ["pit", "manager", "reception", "super_admin"].includes(r));

  const { data: players = [] } = usePlayers();
  const { data: tables = [] } = useGamingTables();

  const { data: transactions = [] } = useQuery({
    queryKey: ["ps-transactions", casinoId, fromDate, toDate],
    queryFn: async () => {
      if (!casinoId) return [] as any[];
      const { data, error } = await supabase
        .from("transactions")
        .select("*, players(first_name, last_name, nickname), gaming_tables(name)")
        .eq("casino_id", casinoId)
        .is("cancelled_at", null)
        .gte("created_at", windowStartUTC)
        .lt("created_at", windowEndUTC)
        .order("created_at", { ascending: false })
        .limit(5000);
      if (error) throw error;
      return data || [];
    },
    enabled: !!casinoId,
    staleTime: 1000 * 30,
    refetchInterval: isHistorical ? false : 30_000,
  });

  const { data: chipTransfers = [] } = useQuery({
    queryKey: ["ps-chip-transfers", casinoId, fromDate, toDate],
    queryFn: async () => {
      if (!casinoId) return [] as any[];
      const { data, error } = await (supabase.from as any)("chip_transfers")
        .select("*")
        .eq("casino_id", casinoId)
        .gte("created_at", windowStartUTC)
        .lt("created_at", windowEndUTC)
        .order("created_at", { ascending: false })
        .limit(5000);
      if (error) throw error;
      return data || [];
    },
    enabled: !!casinoId,
    staleTime: 1000 * 30,
    refetchInterval: isHistorical ? false : 30_000,
  });
  const { data: chipAdjustments = [] } = useQuery({
    queryKey: ["player_chip_adjustments", "by-range", casinoId, fromDate, toDate],
    queryFn: async () => {
      if (!casinoId) return [] as Array<{ player_id: string; chip_in: number; chip_out: number }>;
      const { data, error } = await (supabase.from as any)("player_chip_adjustments")
        .select("player_id, chip_in, chip_out")
        .eq("casino_id", casinoId)
        .gte("created_at", windowStartUTC)
        .lt("created_at", windowEndUTC)
        .limit(5000);
      if (error) throw error;
      return (data || []) as Array<{ player_id: string; chip_in: number; chip_out: number }>;
    },
    enabled: !!casinoId,
    staleTime: 30_000,
    refetchInterval: isHistorical ? false : 30_000,
  });
  const { data: playersDropSplit } = usePlayersDropSplit(windowStartUTC, windowEndUTC);

  // Daily avg bet (manual entry). Single-day only — for multi-day periods we don't show breakdown.
  const isSingleDay = fromDate === toDate;
  const { data: dailyAvgBets = [] } = usePlayerDailyAvgBets(isSingleDay ? fromDate : undefined);
  const dailyAvgBetByPlayer = useMemo(() => {
    const m = new Map<string, { ar: number | null; bj: number | null; poker: number | null }>();
    dailyAvgBets.forEach(b => m.set(b.player_id, {
      ar: b.avg_bet_ar, bj: b.avg_bet_bj, poker: b.avg_bet_poker, club: b.avg_bet_club,
    }));
    return m;
  }, [dailyAvgBets]);
  const summaryAvgBet = (pid: string): number => {
    const b = dailyAvgBetByPlayer.get(pid);
    if (!b) return 0;
    const vals = [b.ar, b.bj, b.poker].filter((v): v is number => v != null && v > 0);
    return vals.length ? Math.max(...vals) : 0;
  };

  const shiftDate = (delta: number) => {
    const next = subDays(date, delta);
    if (next < minDate || next > today) return;
    setDate(next);
  };

  const [tab, setTab] = useState<TabKey>("day");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<Set<PlayerCategory>>(
    new Set(["diamond", "platinum", "gold", "normal"])
  );
  const [posFilter, setPosFilter] = useState<"mix" | "table" | "slots">("mix");
  
  type SortKey = "card" | "name" | "level" | "visits" | "position" | "entry" | "exit" | "avgBet" | "dropR" | "inDrop" | "out" | "chipIn" | "chipOut" | "result";
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir(key === "card" || key === "name" ? "asc" : "desc"); }
  };

  const showFinancials = canSeePlayerFinancials(roles);
  const canTransfer = false;
  const canEditAvgBet = isSingleDay && roles.some(r => ["pit", "manager", "floor_manager", "super_admin"].includes(r));
  const canEditChips = isSingleDay && fromDate === today && roles.some(r => ["pit", "manager", "floor_manager", "super_admin"].includes(r));


  const { data: visits = [] } = useQuery({
    queryKey: ["casino_visits", casinoId, fromDate, toDate],
    queryFn: async () => {
      const { data } = await supabase
        .from("casino_visits")
        .select("*")
        .eq("casino_id", casinoId!)
        .gte("date", fromDate)
        .lte("date", toDate);
      return (data || []) as any[];
    },
    enabled: !!casinoId,
    refetchInterval: isHistorical ? false : 15000,
  });

  // Lifetime visit counts (all time, this casino) for players visible in current period.
  const visitPlayerIds = useMemo(() => Array.from(new Set((visits as any[]).map(v => v.player_id))), [visits]);
  const { data: lifetimeVisitsByPlayer = {} } = useQuery({
    queryKey: ["player-lifetime-visits", casinoId, visitPlayerIds.sort().join(",")],
    queryFn: async () => {
      if (!casinoId || visitPlayerIds.length === 0) return {} as Record<string, number>;
      // Use server-side aggregate (GROUP BY) instead of fetching every visit row.
      const { data, error } = await (supabase.rpc as any)("player_lifetime_visit_counts", {
        _casino_id: casinoId,
        _player_ids: visitPlayerIds,
      });
      if (error) throw error;
      const m: Record<string, number> = {};
      for (const r of (data || []) as any[]) m[r.player_id] = Number(r.visit_count) || 0;
      return m;
    },
    enabled: !!casinoId && visitPlayerIds.length > 0,
    staleTime: 5 * 60_000,
  });


  const { data: sessions = [] } = useQuery({
    queryKey: ["client_sessions", casinoId, fromDate, toDate],
    queryFn: async () => {
      const { data } = await supabase
        .from("client_sessions")
        .select("*")
        .eq("casino_id", casinoId!)
        .gte("started_at", windowStartUTC)
        .lt("started_at", windowEndUTC)
        .order("started_at", { ascending: false });
      return (data || []) as any[];
    },
    enabled: !!casinoId,
    refetchInterval: isHistorical ? false : 15000,
  });

  const tableNameById = useMemo(() => {
    const m: Record<string, string> = {};
    tables.forEach(t => { m[t.id] = t.name; });
    return m;
  }, [tables]);

  // Active session per player (for Present)
  const activeSessionByPlayer = useMemo(() => {
    const m: Record<string, any> = {};
    for (const s of sessions) {
      if (!s.stopped_at && !m[s.player_id]) m[s.player_id] = s;
    }
    return m;
  }, [sessions]);

  // Per-visit attribution: bucket transactions/chip ops by the visit window they fall in.
  // Prevents double-counting when a player has multiple visits in the selected range.
  const visitsByPlayer = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const v of visits as any[]) {
      const arr = m.get(v.player_id) || [];
      arr.push(v);
      m.set(v.player_id, arr);
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => new Date(a.checked_in_at).getTime() - new Date(b.checked_in_at).getTime());
    }
    return m;
  }, [visits]);

  const visitFin = useMemo(() => {
    const findVisit = (playerId: string, ts: number) => {
      const arr = visitsByPlayer.get(playerId);
      if (!arr) return null;
      for (const v of arr) {
        const start = new Date(v.checked_in_at).getTime();
        const end = v.checked_out_at ? new Date(v.checked_out_at).getTime() : start + 24 * 3600 * 1000;
        if (ts >= start && ts <= end) return v;
      }
      return null;
    };
    const m = new Map<string, { inDrop: number; out: number; chipIn: number; chipOut: number; inCount: number; outCount: number }>();
    for (const v of visits as any[]) {
      m.set(v.id, { inDrop: 0, out: 0, chipIn: 0, chipOut: 0, inCount: 0, outCount: 0 });
    }
    for (const t of transactions as any[]) {
      const v = findVisit(t.player_id, new Date(t.created_at).getTime());
      if (!v) continue;
      const f = m.get(v.id)!;
      const amt = Number(t.amount) || 0;
      if (t.type === "buy" || t.type === "in") { f.inDrop += amt; f.inCount += 1; }
      else if (t.type === "cashout" || t.type === "out") { f.out += amt; f.outCount += 1; }
    }
    for (const ct of chipTransfers as any[]) {
      const v = findVisit(ct.player_id, new Date(ct.created_at).getTime());
      if (!v) continue;
      const f = m.get(v.id)!;
      const amt = Number(ct.amount) || 0;
      if (ct.direction === "in") f.chipIn += amt; else f.chipOut += amt;
    }
    for (const a of chipAdjustments as any[]) {
      // chipAdjustments query does not select created_at — attribute to player's latest visit as fallback.
      const arr = visitsByPlayer.get(a.player_id);
      const v = (a as any).created_at
        ? findVisit(a.player_id, new Date((a as any).created_at).getTime())
        : (arr && arr.length ? arr[arr.length - 1] : null);
      if (!v) continue;
      const f = m.get(v.id)!;
      f.chipIn += Number(a.chip_in) || 0;
      f.chipOut += Number(a.chip_out) || 0;
    }
    return m;
  }, [visits, transactions, chipTransfers, chipAdjustments, visitsByPlayer]);

  // Per-player sum of in-window inDrop, used to allocate the window-level
  // NEP-aware Drop R proportionally across that player's visits in the period.
  // Without this, every visit row would show the full player-window dropR,
  // which then multiplies in TOTAL row and in multi-day grouping.
  const playerInDropSum = useMemo(() => {
    const m = new Map<string, number>();
    for (const v of visits as any[]) {
      const f = visitFin.get(v.id);
      if (!f) continue;
      m.set(v.player_id, (m.get(v.player_id) || 0) + f.inDrop);
    }
    return m;
  }, [visits, visitFin]);

  // Build per-visit rows
  const rows = useMemo(() => {
    const playerById: Record<string, any> = {};
    players.forEach(p => { playerById[p.id] = p; });

    // Visit number: stable per business day, by check-in order ascending.
    const visitNumberById = new Map<string, number>();
    [...visits]
      .sort((a: any, b: any) => new Date(a.checked_in_at).getTime() - new Date(b.checked_in_at).getTime())
      .forEach((v: any, i: number) => visitNumberById.set(v.id, i + 1));
    return visits.map((v: any) => {
      const p = playerById[v.player_id];
      if (!p) return null;
      const cat = ((p as any).category as PlayerCategory) || "normal";

      const f = visitFin.get(v.id) || { inDrop: 0, out: 0, chipIn: 0, chipOut: 0, inCount: 0, outCount: 0 };
      const inDrop = f.inDrop;
      const out = f.out;
      const chip = { in: f.chipIn, out: f.chipOut };
      const result = (out + chip.out) - (inDrop + chip.in);

      const activeSession = activeSessionByPlayer[v.player_id];
      const isPresent = !v.checked_out_at;
      const tableName = activeSession?.table_id ? tableNameById[activeSession.table_id] : null;

      // Allocate player-window dropR proportionally by this visit's inDrop.
      const playerDropR = playersDropSplit?.get(v.player_id)?.dropR ?? 0;
      const totalIn = playerInDropSum.get(v.player_id) || 0;
      const visitDropR = totalIn > 0 ? playerDropR * (inDrop / totalIn) : 0;

      return {
        id: v.id,
        visitNumber: visitNumberById.get(v.id) ?? 0,
        visits: lifetimeVisitsByPlayer[v.player_id] ?? (visitsByPlayer.get(v.player_id)?.length || 1),
        playerId: v.player_id,
        cardNo: ((p as any).player_cards || [])
          .slice()
          .sort((a: any, b: any) => (a.is_active === b.is_active ? 0 : a.is_active ? -1 : 1))[0]?.card_number || "",
        firstName: p.first_name,
        lastName: p.last_name,
        nickname: (p as any).nickname,
        category: cat,
        flags: ((p as any).player_tags || []).map((t: any) => t.tag),
        entryAt: v.checked_in_at as string,
        exitAt: v.checked_out_at as string | null,
        position: v.position as string,
        tableName,
        avgBet: summaryAvgBet(v.player_id) || (activeSession ? Number(activeSession.avg_bet || 0) : 0),
        inDrop,
        out,
        dropR: visitDropR,
        inCount: f.inCount,
        outCount: f.outCount,
        chipIn: chip.in,
        chipOut: chip.out,
        chipDelta: chip.in - chip.out,
        result,
        isPresent,
      };
    }).filter(Boolean) as Array<NonNullable<ReturnType<typeof Object>>>;
  }, [visits, players, visitFin, activeSessionByPlayer, tableNameById, playersDropSplit, playerInDropSum, dailyAvgBetByPlayer, lifetimeVisitsByPlayer, visitsByPlayer]);

  // For multi-day periods, group rows per player so the same player isn't repeated for each visit.
  const displayRows = useMemo(() => {
    if (!isMultiDay) return rows;
    const map = new Map<string, any>();
    for (const r of rows as any[]) {
      const cur = map.get(r.playerId);
      if (!cur) {
        map.set(r.playerId, { ...r, id: `g-${r.playerId}`, visitNumber: 1 });
      } else {
        cur.visitNumber += 1;
        cur.inDrop += r.inDrop;
        cur.out += r.out;
        cur.dropR += r.dropR;
        cur.chipIn += r.chipIn;
        cur.chipOut += r.chipOut;
        cur.chipDelta = cur.chipIn - cur.chipOut;
        cur.result += r.result;
        cur.inCount += r.inCount;
        cur.outCount += r.outCount;
        if (r.entryAt < cur.entryAt) cur.entryAt = r.entryAt;
        if (r.exitAt && (!cur.exitAt || r.exitAt > cur.exitAt)) cur.exitAt = r.exitAt;
        if (r.isPresent) { cur.isPresent = true; cur.position = r.position; cur.tableName = r.tableName; }
        if (r.avgBet > (cur.avgBet || 0)) cur.avgBet = r.avgBet;
      }
    }
    // Renumber by entry time for stable display
    const arr = Array.from(map.values()).sort(
      (a, b) => new Date(a.entryAt).getTime() - new Date(b.entryAt).getTime()
    );
    arr.forEach((r, i) => { r.displayIndex = i + 1; });
    return arr;
  }, [rows, isMultiDay]);

  const filtered = useMemo(() => {
    let list = displayRows;
    if (tab === "present") list = list.filter((r: any) => r.isPresent);
    if (tab === "left") list = list.filter((r: any) => !r.isPresent);
    list = list.filter((r: any) => categoryFilter.has(r.category));
    if (posFilter === "table") list = list.filter((r: any) => r.position === "table");
    else if (posFilter === "slots") list = list.filter((r: any) => r.position === "slots");
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((r: any) =>
        `${r.firstName} ${r.lastName} ${r.nickname ?? ""}`.toLowerCase().includes(q)
      );
    }
    // Default sort: present first, recent entry first. Override when user clicked a column.
    return [...list].sort((a: any, b: any) => {
      if (sortKey) {
        const dir = sortDir === "asc" ? 1 : -1;
        const get = (r: any) => {
          switch (sortKey) {
            case "card": return r.cardNo || "\uffff";
            case "name": return `${r.firstName} ${r.lastName}`.toLowerCase();
            case "level": {
              const order: Record<string, number> = { diamond: 0, platinum: 1, gold: 2, normal: 3 };
              return order[r.category] ?? 9;
            }
            case "visits": return r.visits || 0;
            case "position": return r.position === "table" ? (r.tableName ?? "zzz") : r.position;
            case "entry": return new Date(r.entryAt).getTime();
            case "exit": return r.exitAt ? new Date(r.exitAt).getTime() : 0;
            case "avgBet": return r.avgBet;
            case "dropR": return r.dropR;
            case "inDrop": return r.inDrop;
            case "out": return r.out;
            case "chipIn": return r.chipIn;
            case "chipOut": return r.chipOut;
            case "result": return r.result;
          }
        };
         const av = get(a), bv = get(b);
         // For result column: push rows with no result (0) to the bottom regardless of direction.
         if (sortKey === "result") {
           const aZero = !a.result;
           const bZero = !b.result;
           if (aZero !== bZero) return aZero ? 1 : -1;
         }
         if (av < bv) return -1 * dir;
         if (av > bv) return 1 * dir;
         return 0;
      }
      if (a.isPresent !== b.isPresent) return a.isPresent ? -1 : 1;
      return new Date(b.entryAt).getTime() - new Date(a.entryAt).getTime();
    });
  }, [displayRows, tab, categoryFilter, posFilter, search, sortKey, sortDir]);

  const counts = useMemo(() => ({
    day: displayRows.length,
    present: displayRows.filter((r: any) => r.isPresent).length,
    left: displayRows.filter((r: any) => !r.isPresent).length,
  }), [displayRows]);

  // Totals across the currently filtered list (period + tab + filters + search).
  const totals = useMemo(() => {
    const t = { count: 0, avgBetSum: 0, avgBetN: 0, dropR: 0, inDrop: 0, out: 0, chipIn: 0, chipOut: 0, chipDelta: 0, result: 0 };
    for (const r of filtered as any[]) {
      t.count += 1;
      if (r.avgBet) { t.avgBetSum += r.avgBet; t.avgBetN += 1; }
      t.dropR += r.dropR;
      t.inDrop += r.inDrop;
      t.out += r.out;
      t.chipIn += r.chipIn;
      t.chipOut += r.chipOut;
      t.chipDelta += r.chipDelta;
      t.result += r.result;
    }
    return t;
  }, [filtered]);

  // (user already destructured from useAuth above)

  // Position change: handles "hall", "slots", or specific table id (UUID).
  // Picking a table creates a new client_sessions row with min avg bet (10000 poker/BJ, 2000 roulette).
  // Picking hall/slots stops any active session and updates visit position.
  const setPosition = useMutation({
    mutationFn: async ({ visitId, playerId, newPos }: { visitId: string; playerId: string; newPos: string }) => {
      const isTable = newPos !== "hall" && newPos !== "slots";
      const visitPosition = isTable ? "table" : newPos;
      const sessionStoppedAt = new Date().toISOString();

      // Always stop any open session first (so a new table or hall/slots is clean).
      await offlineMutation({
        table: "client_sessions",
        operation: "update",
        payload: {
          _match: { casino_id: casinoId!, player_id: playerId, stopped_at: null as any },
          stopped_at: sessionStoppedAt,
        },
      });

      // Update visit position (DB trigger writes player_position_history).
      const res = await offlineMutation({
        table: "casino_visits",
        operation: "update",
        payload: { _match: { id: visitId }, position: visitPosition },
      });
      if (res.error) throw new Error(res.error);

      // Start a new session at the chosen table.
      let nextAvgBet = 0;
      if (isTable) {
        const tbl = tables.find(t => t.id === newPos);
        const isRoulette = tbl ? /roulette/i.test(tbl.game) : false;
        nextAvgBet = isRoulette ? 2000 : 10000;
        const insRes = await offlineMutation({
          table: "client_sessions",
          operation: "insert",
          payload: {
            id: crypto.randomUUID(),
            casino_id: casinoId!,
            player_id: playerId,
            table_id: newPos,
            avg_bet: nextAvgBet,
            created_by: user!.id,
          },
        });
        if (insRes.error) throw new Error(insRes.error);
      }
      return {
        offline: res.offline,
        visitId,
        playerId,
        visitPosition,
        tableId: isTable ? newPos : null,
        avgBet: nextAvgBet,
        sessionStoppedAt,
      };
    },
    onSuccess: (res: any) => {
      queryClient.setQueryData<any[]>(["casino_visits", casinoId, fromDate, toDate], (old = []) =>
        old.map(v => v.id === res.visitId ? { ...v, position: res.visitPosition } : v)
      );
      queryClient.setQueryData<any[]>(["client_sessions", casinoId, fromDate, toDate], (old = []) => {
        const stopped = old.map(s =>
          s.player_id === res.playerId && !s.stopped_at ? { ...s, stopped_at: res.sessionStoppedAt } : s
        );
        if (!res.tableId) return stopped;
        return [{
          id: `pending-${res.playerId}-${res.tableId}-${Date.now()}`,
          casino_id: casinoId!,
          player_id: res.playerId,
          table_id: res.tableId,
          avg_bet: res.avgBet,
          started_at: new Date().toISOString(),
          stopped_at: null,
          created_by: user!.id,
        }, ...stopped];
      });
      queryClient.invalidateQueries({ queryKey: ["casino_visits"] });
      queryClient.invalidateQueries({ queryKey: ["client_sessions"] });
      toast.success(res?.offline ? "Saved offline" : "Position updated");
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Open tables (skip closed/archived) for the picker.
  const openTables = useMemo(
    () => tables.filter((t: any) => t.status === "open"),
    [tables]
  );

  // Stable color index per table — alphabetical order of all tables.
  const tableColorIndex = useMemo(() => {
    const sorted = [...tables].sort((a: any, b: any) => (a.name || "").localeCompare(b.name || ""));
    const m = new Map<string, number>();
    sorted.forEach((t: any, i: number) => m.set(t.id, i));
    return m;
  }, [tables]);

  const PositionPicker = ({ r, currentValue }: { r: any; currentValue: string }) => {
    const [open, setOpen] = useState(false);
    const selectedTable = openTables.find((t: any) => t.id === currentValue);
    const selectedTableName = selectedTable?.name ?? r.tableName;
    const triggerLabel = currentValue === "hall" ? "Hall"
      : currentValue === "slots" ? "Slots"
      : (selectedTableName ?? "T");
    const triggerClasses = currentValue === "slots"
      ? "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30"
      : selectedTable
        ? getTableCellClasses(selectedTable.id, tableColorIndex.get(selectedTable.id) ?? 0, "D")
        : "bg-muted text-muted-foreground border-border";

    const pick = (v: string) => {
      setOpen(false);
      setPosition.mutate({ visitId: r.id, playerId: r.playerId, newPos: v });
    };

    return (
      <div onClick={(e) => e.stopPropagation()}>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              disabled={setPosition.isPending}
              className={`h-6 px-2 rounded text-[10px] font-mono font-bold border w-full truncate ${triggerClasses}`}
            >
              {triggerLabel}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-1.5" align="start">
            <div className="flex flex-wrap gap-1 mb-1.5 max-w-[260px]">
              <button onClick={() => pick("hall")}
                className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-secondary text-secondary-foreground hover:opacity-80">
                Hall
              </button>
              <button onClick={() => pick("slots")}
                className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/20 text-amber-700 dark:text-amber-400 hover:opacity-80">
                Slots
              </button>
            </div>
            {openTables.length > 0 && (
              <div className="border-t border-border pt-1.5">
                <p className="text-[8px] text-muted-foreground uppercase px-1 mb-1">Tables</p>
                <div className="flex flex-wrap gap-1 max-w-[260px]">
                  {openTables.map((t: any) => (
                    <button key={t.id} onClick={() => pick(t.id)}
                      className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold hover:opacity-80 ${getTableCellClasses(t.id, tableColorIndex.get(t.id) ?? 0, "D")}`}>
                      {t.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </PopoverContent>
        </Popover>
      </div>
    );
  };

  const renderPositionCell = (r: any) => {
    if (!r.isPresent) return <span className="text-[10px] text-muted-foreground">—</span>;

    const activeSession = activeSessionByPlayer[r.playerId];
    const currentValue = activeSession?.table_id
      ? activeSession.table_id
      : (r.position === "slots" ? "slots" : "hall");

    if (!canEditPosition) {
      return r.position === "table" ? (
        r.tableName ? (
          <Badge variant="outline" className="text-[10px] font-mono">{r.tableName}</Badge>
        ) : (
          <Badge variant="outline" className="text-[10px]">Table</Badge>
        )
      ) : r.position === "slots" ? (
        <Badge className="text-[10px] bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30">Slots</Badge>
      ) : (
        <Badge variant="secondary" className="text-[10px]">Hall</Badge>
      );
    }
    return <PositionPicker r={r} currentValue={currentValue} />;
  };

  const { playerId: selectedPlayerId, select: selectPlayer } = useSelectedPlayer();

  // Tint applied to the Name cell — matches CategoryBadge palette.
  const CATEGORY_NAME_TINT: Record<string, string> = {
    diamond: "bg-blue-100/70 dark:bg-blue-500/15",
    platinum: "bg-purple-100/70 dark:bg-purple-500/15",
    gold: "bg-yellow-100/70 dark:bg-yellow-500/15",
    normal: "bg-muted/40",
  };

  const renderRow = (r: any, idx: number) => {
    const isSelected = r.playerId === selectedPlayerId;
    return (
      <tr
        key={r.id}
        onClick={() => selectPlayer(r.playerId)}
        className={`border-b border-border hover:bg-muted/30 cursor-pointer transition-colors ${isSelected ? "bg-primary/10" : ""}`}
      >
        <td className={`px-2 py-1.5 font-mono text-[11px] text-center text-foreground font-bold sticky left-0 z-10 w-16 whitespace-nowrap ${isSelected ? "bg-primary/10" : "bg-card"}`}>{formatCardNumber(r.cardNo) || "·"}</td>
        <td className={`px-2 py-1.5 max-w-[200px] sticky left-16 z-10 ${isSelected ? "bg-primary/10" : (CATEGORY_NAME_TINT[r.category] || "bg-card")}`}>
          <div className="flex items-center gap-1.5 min-w-0">
            <CategoryBadge category={r.category} />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-card-foreground truncate">
                {r.firstName} {r.lastName}
              </p>

            </div>
          </div>
        </td>
        <td className="px-2 py-1.5 font-mono text-[11px] text-center w-12">{r.visits || "·"}</td>
        <td className="px-1 py-1.5 font-mono text-xs w-[44px] text-center">{formatTime(r.entryAt)}</td>
        <td className="px-1 py-1.5 font-mono text-xs w-[44px] text-center">{r.exitAt ? formatTime(r.exitAt) : "·"}</td>
        
        {showFinancials && (() => {
          const Money = ({ value, sign = false }: { value: number; sign?: boolean }) => {
            if (!value) return <>·</>;
            const prefix = sign && value > 0 ? "+" : "";
            return <>{prefix}{formatCurrency(value)}</>;
          };
          return (
            <>
              <td className="px-2 py-1.5 font-mono text-sm text-right whitespace-nowrap min-w-[90px]" onClick={(e) => e.stopPropagation()}>
                <AvgBetPopover
                  playerId={r.playerId}
                  businessDate={fromDate}
                  isSingleDay={isSingleDay}
                  canEdit={canEditAvgBet}
                  bets={dailyAvgBetByPlayer.get(r.playerId)}
                  fallback={r.avgBet}
                />
              </td>
              <td className="px-2 py-1.5 font-mono text-sm text-right whitespace-nowrap min-w-[120px]" title="Drop — NEP-aware (external cash only)">
                <Money value={r.dropR} />
              </td>
              <td className="px-2 py-1.5 font-mono text-sm text-right whitespace-nowrap min-w-[110px]">
                <Money value={r.inDrop} />
              </td>
              <td className="px-2 py-1.5 font-mono text-sm text-right whitespace-nowrap min-w-[110px]">
                <Money value={r.out} />
              </td>
              <td className="px-2 py-1.5 font-mono text-sm text-right text-success whitespace-nowrap min-w-[110px]" onClick={(e) => e.stopPropagation()}>
                <InlineChipCell
                  playerId={r.playerId}
                  direction="in"
                  value={r.chipIn}
                  canEdit={canEditChips}
                />
              </td>
              <td className="px-2 py-1.5 font-mono text-sm text-right text-destructive whitespace-nowrap min-w-[110px]" onClick={(e) => e.stopPropagation()}>
                <InlineChipCell
                  playerId={r.playerId}
                  direction="out"
                  value={r.chipOut}
                  canEdit={canEditChips}
                />
              </td>

              <td className={`px-2 py-1.5 font-mono text-sm text-right font-bold whitespace-nowrap min-w-[120px] ${
                r.result > 0 ? "cms-amount-positive" : r.result < 0 ? "cms-amount-negative" : ""
              }`}>
                <Money value={r.result} sign />
              </td>
            </>
          );
        })()}
      </tr>
    );
  };

  const presentPlayerIds = useMemo(
    () => new Set(rows.filter((r: any) => r.isPresent).map((r: any) => r.playerId)),
    [rows]
  );

  const dateControl = canBrowseHistory ? (
    <div className="flex items-center gap-2 flex-wrap">
      <DateRangePresets
        preset={preset}
        from={range.from}
        to={range.to}
        onChange={(next) => {
          setPreset(next.preset);
          if (next.preset === "day") {
            setDate(next.from);
            setRange({ from: next.from, to: next.from });
          } else {
            setRange({ from: next.from, to: next.to });
          }
        }}
      />
      {preset === "day" && (
        <DateNavigator
          value={date}
          onChange={(iso) => {
            if (iso < minDate || iso > today) return;
            setDate(iso);
            setRange({ from: iso, to: iso });
          }}
          minDate={new Date(minDate + "T00:00:00")}
          maxDate={new Date(today + "T00:00:00")}
        />
      )}
      {(preset !== "day" || date !== today) && (
        <Button variant="outline" size="sm" className="h-9 text-xs" onClick={() => {
          setPreset("day");
          setDate(today);
          setRange({ from: today, to: today });
        }}>
          Today
        </Button>
      )}
    </div>
  ) : undefined;

  const subtitleText = isMultiDay
    ? `Period · ${fromDate} → ${toDate}`
    : isHistorical
      ? `Historical · ${fromDate}`
      : "Today's visitors — entry, position, results";

  return (
    <PageShell>
      <PageHeader
        icon={BarChart3}
        title="Player Tracking"
        subtitle={subtitleText}
        centerSlot={dateControl}
        date={!canBrowseHistory}
      />

      <PlayerPreviewHeader range={effectiveRange} />

      <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)} className="space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <TabsList>
            <TabsTrigger
              value="day"
              className="data-[state=active]:bg-primary/15 data-[state=active]:text-primary data-[state=active]:border-primary/40 border border-transparent"
            >
              Daily
              <Badge className="ml-1.5 text-[15px] font-bold bg-primary/20 text-primary border-primary/30 hover:bg-primary/20">{counts.day}</Badge>
            </TabsTrigger>
            <TabsTrigger
              value="present"
              className="data-[state=active]:bg-success/15 data-[state=active]:text-success data-[state=active]:border-success/40 border border-transparent"
            >
              Present
              <Badge className="ml-1.5 text-[15px] font-bold bg-success/20 text-success border-success/30 hover:bg-success/20">{counts.present}</Badge>
            </TabsTrigger>
            <TabsTrigger
              value="left"
              className="data-[state=active]:bg-muted data-[state=active]:text-muted-foreground data-[state=active]:border-border border border-transparent"
            >
              Left
              <Badge variant="secondary" className="ml-1.5 text-[15px] font-bold">{counts.left}</Badge>
            </TabsTrigger>
          </TabsList>

          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-md border border-border overflow-hidden h-8">
              {(["mix", "table", "slots"] as const).map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPosFilter(p)}
                  className={`px-2.5 h-full text-[11px] uppercase tracking-wide transition-colors ${
                    posFilter === p
                      ? "bg-primary/15 text-primary font-semibold"
                      : "text-muted-foreground hover:bg-muted/40"
                  }`}
                >
                  {p === "mix" ? "Mix" : p === "table" ? "Table" : "Slot"}
                </button>
              ))}
            </div>
            <CategoryFilter selected={categoryFilter} onChange={setCategoryFilter} />
            <div className="relative w-56">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search players..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>
        </div>

        <TabsContent value={tab} className="mt-0">
          <div className="cms-panel rounded-lg" style={{ overflowX: "clip", overflowY: "visible" }}>
            <div style={{ overflowX: "clip", overflowY: "visible" }}>
              <table className="w-full text-xs">
                <thead className="bg-zinc-900 border-b border-border">
                  <tr className="text-sm uppercase tracking-wider text-white">
                    {(() => {
                      const SortIcon = ({ k }: { k: SortKey }) =>
                        sortKey !== k ? <ArrowUpDown className="w-3 h-3 inline ml-1 opacity-40" />
                          : sortDir === "asc" ? <ArrowUp className="w-3 h-3 inline ml-1" />
                          : <ArrowDown className="w-3 h-3 inline ml-1" />;
                      const H = ({ k, align = "left", children, title, sticky }: { k: SortKey; align?: "left" | "right"; children: any; title?: string; sticky?: string }) => (
                        <th
                          title={title}
                          style={{ top: "var(--ppheader-h, 0px)" }}
                          className={`px-2 py-3 cursor-pointer select-none hover:text-primary whitespace-nowrap font-bold sticky bg-zinc-900 text-white ${align === "right" ? "text-right" : "text-left"} ${sticky ? `${sticky} z-30` : "z-20"}`}
                          onClick={() => toggleSort(k)}
                        >
                          {children}<SortIcon k={k} />
                        </th>
                      );
                      return (
                        <>
                          <th style={{ top: "var(--ppheader-h, 0px)" }} onClick={() => toggleSort("card")} className="px-2 py-3 text-center sticky left-0 bg-zinc-900 text-white z-30 w-16 font-bold cursor-pointer select-none hover:text-primary whitespace-nowrap">Card<SortIcon k="card" /></th>
                          <th
                            style={{ top: "var(--ppheader-h, 0px)" }}
                            className="px-2 py-3 sticky left-16 bg-zinc-900 text-white z-30 font-bold whitespace-nowrap text-left"
                          >
                            <span
                              onClick={() => toggleSort("level")}
                              title="Sort by level: D → P → G → N"
                              className="mr-2 cursor-pointer select-none hover:text-primary"
                            >
                              L<SortIcon k="level" />
                            </span>
                            <span
                              onClick={() => toggleSort("name")}
                              className="cursor-pointer select-none hover:text-primary"
                            >
                              Name<SortIcon k="name" />
                            </span>
                          </th>
                          <H k="visits" align="left" title="Visits in selected period">Vis</H>
                          <H k="entry">Entry</H>
                          <H k="exit">Left</H>
                          
                          {showFinancials && (
                            <>
                              <H k="avgBet" align="right">Bet</H>
                              <H k="dropR" align="right" title="Drop — NEP-aware (external cash only)">Drop</H>
                              <H k="inDrop" align="right" title="Total cash in (all buy-ins)">Cash In</H>
                              <H k="out" align="right" title="Total cash out (all cashouts)">Cash Out</H>
                              <H k="chipIn" align="right" title="Chip adjustments in (+)">Chip In</H>
                              <H k="chipOut" align="right" title="Chip adjustments out (−)">Chip Out</H>
                              <H k="result" align="right">Result</H>
                            </>
                          )}
                        </>
                      );
                    })()}
                    
                  </tr>
                  {filtered.length > 0 && (
                    <tr className="text-sm bg-[#F5D061] dark:bg-[#6B5A1A] border-b-2 border-primary/40 font-mono text-amber-950 dark:text-amber-50">
                      <td style={{ top: "calc(var(--ppheader-h, 0px) + 38px)", boxShadow: "inset 0 -2px 0 0 hsl(45 90% 55% / 0.9)" }} className="px-2 py-2 text-center sticky left-0 bg-[#F5D061] dark:bg-[#6B5A1A] text-amber-950 dark:text-amber-50 z-30 font-bold w-16">{totals.count}</td>
                      <td style={{ top: "calc(var(--ppheader-h, 0px) + 38px)", boxShadow: "inset 0 -2px 0 0 hsl(45 90% 55% / 0.9)" }} className="px-2 py-2 text-left uppercase tracking-wider font-bold sticky left-16 bg-[#F5D061] dark:bg-[#6B5A1A] text-amber-950 dark:text-amber-50 z-30">
                        Total
                      </td>
                      <td style={{ top: "calc(var(--ppheader-h, 0px) + 38px)", boxShadow: "inset 0 -2px 0 0 hsl(45 90% 55% / 0.9)" }} className="px-1 py-2 sticky bg-[#F5D061] dark:bg-[#6B5A1A] z-20"></td>
                      <td style={{ top: "calc(var(--ppheader-h, 0px) + 38px)", boxShadow: "inset 0 -2px 0 0 hsl(45 90% 55% / 0.9)" }} className="px-1 py-2 sticky bg-[#F5D061] dark:bg-[#6B5A1A] z-20"></td>
                      <td style={{ top: "calc(var(--ppheader-h, 0px) + 38px)", boxShadow: "inset 0 -2px 0 0 hsl(45 90% 55% / 0.9)" }} className="px-1 py-2 sticky bg-[#F5D061] dark:bg-[#6B5A1A] z-20"></td>
                      {showFinancials && (() => {
                        const Money = ({ value, sign = false }: { value: number; sign?: boolean }) => {
                          if (!value) return <>·</>;
                          const prefix = sign && value > 0 ? "+" : "";
                          return <>{prefix}{formatCurrency(value)}</>;
                        };
                        const stickyStyle = { top: "calc(var(--ppheader-h, 0px) + 38px)", boxShadow: "inset 0 -2px 0 0 hsl(45 90% 55% / 0.9)" } as const;
                        const stickyCls = "sticky bg-[#F5D061] dark:bg-[#6B5A1A] z-20";
                        return (
                          <>
                            <td style={stickyStyle} className={`px-2 py-2 ${stickyCls}`}></td>
                            <td style={stickyStyle} className={`px-2 py-2 text-right font-bold whitespace-nowrap text-amber-950 dark:text-amber-50 ${stickyCls}`}><Money value={totals.dropR} /></td>
                            <td style={stickyStyle} className={`px-2 py-2 text-right font-bold whitespace-nowrap text-amber-950 dark:text-amber-50 ${stickyCls}`}><Money value={totals.inDrop} /></td>
                            <td style={stickyStyle} className={`px-2 py-2 text-right font-bold whitespace-nowrap text-amber-950 dark:text-amber-50 ${stickyCls}`}><Money value={totals.out} /></td>
                            <td style={stickyStyle} className={`px-2 py-2 text-right font-bold whitespace-nowrap text-success ${stickyCls}`}><Money value={totals.chipIn} /></td>
                            <td style={stickyStyle} className={`px-2 py-2 text-right font-bold whitespace-nowrap text-destructive ${stickyCls}`}><Money value={totals.chipOut} /></td>
                            <td style={stickyStyle} className={`px-2 py-2 text-right font-bold text-base whitespace-nowrap ${stickyCls} ${totals.result > 0 ? "cms-amount-positive" : totals.result < 0 ? "cms-amount-negative" : "text-amber-950 dark:text-amber-50"}`}>
                              <Money value={totals.result} sign />
                            </td>
                          </>
                        );
                      })()}
                      
                    </tr>
                  )}
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={5 + (showFinancials ? 7 : 0)} className="px-2 py-8 text-center text-muted-foreground text-xs">
                        No players to display
                      </td>
                    </tr>
                  ) : (
                    filtered.map((r, i) => renderRow(r, i))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </PageShell>
  );
};

function AvgBetPopover({
  playerId, businessDate, isSingleDay, canEdit, bets, fallback,
}: {
  playerId: string;
  businessDate: string;
  isSingleDay: boolean;
  canEdit: boolean;
  bets: { ar: number | null; bj: number | null; poker: number | null } | undefined;
  fallback: number;
}) {
  const ar = bets?.ar ?? null;
  const bj = bets?.bj ?? null;
  const poker = bets?.poker ?? null;
  const vals = [ar, bj, poker].filter((v): v is number => v != null && v > 0);
  const display = vals.length ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) : fallback;
  const setBet = useSetPlayerDailyAvgBet();
  const [open, setOpen] = useState(false);
  const [draftAr, setDraftAr] = useState("");
  const [draftBj, setDraftBj] = useState("");
  const [draftPoker, setDraftPoker] = useState("");

  if (!isSingleDay) {
    return display ? <span>{formatCurrency(display)}</span> : <span>·</span>;
  }

  const openEditor = () => {
    setDraftAr(ar ? formatInputWithSpaces(String(ar)) : "");
    setDraftBj(bj ? formatInputWithSpaces(String(bj)) : "");
    setDraftPoker(poker ? formatInputWithSpaces(String(poker)) : "");
    setOpen(true);
  };

  const commit = async () => {
    const next: Record<AvgBetGroup, number | null> = {
      ar: draftAr.trim() === "" ? null : parseSpacedNumber(draftAr) || null,
      bj: draftBj.trim() === "" ? null : parseSpacedNumber(draftBj) || null,
      poker: draftPoker.trim() === "" ? null : parseSpacedNumber(draftPoker) || null,
    };
    const current: Record<AvgBetGroup, number | null> = { ar, bj, poker };
    const writes: Array<Promise<unknown>> = [];
    (["ar", "bj", "poker"] as AvgBetGroup[]).forEach(g => {
      if (next[g] !== current[g]) {
        writes.push(setBet.mutateAsync({ playerId, businessDate, group: g, value: next[g] }));
      }
    });
    if (writes.length) await Promise.all(writes);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={(o) => { if (o && canEdit) openEditor(); else setOpen(o); }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`font-mono cursor-pointer hover:text-primary ${display ? "" : "text-muted-foreground"}`}
          title={canEdit ? "Click to edit AR / BJ / Poker" : "Avg Bet breakdown"}
        >
          {display ? formatCurrency(display) : "·"}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="bottom"
        sideOffset={6}
        collisionPadding={8}
        avoidCollisions
        className="w-56 p-3"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-[10px] uppercase text-muted-foreground tracking-wider mb-2 px-0.5">
          {canEdit ? "Edit Avg Bet" : "Avg Bet by Game"}
        </p>
        {canEdit ? (
          <>
            <div className="space-y-2">
              {([
                { label: "AR", value: draftAr, set: setDraftAr },
                { label: "BJ", value: draftBj, set: setDraftBj },
                { label: "Poker", value: draftPoker, set: setDraftPoker },
              ] as const).map(g => (
                <div key={g.label} className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-muted-foreground w-12">{g.label}</span>
                  <Input
                    value={g.value}
                    onChange={(e) => g.set(formatInputWithSpaces(e.target.value))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { e.preventDefault(); commit(); }
                      if (e.key === "Escape") { e.preventDefault(); setOpen(false); }
                    }}
                    inputMode="numeric"
                    placeholder="·"
                    className="h-9 text-right font-mono text-sm"
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2 mt-3">
              <Button size="sm" variant="ghost" className="h-8" onClick={() => setOpen(false)}>Cancel</Button>
              <Button size="sm" className="h-8" onClick={commit} disabled={setBet.isPending}>Save</Button>
            </div>
          </>
        ) : (
          <div className="space-y-1">
            {[
              { label: "AR", value: ar },
              { label: "BJ", value: bj },
              { label: "Poker", value: poker },
            ].map(g => (
              <div key={g.label} className="flex items-center justify-between px-1.5 py-1 rounded hover:bg-muted/40">
                <span className="text-xs font-semibold text-muted-foreground">{g.label}</span>
                <span className={`font-mono text-sm ${g.value == null ? "text-muted-foreground/40" : "text-card-foreground"}`}>
                  {g.value == null ? "·" : formatCurrency(g.value)}
                </span>
              </div>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function InlineChipCell({
  playerId, direction, value, canEdit,
}: {
  playerId: string;
  direction: "in" | "out";
  value: number;
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [raw, setRaw] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const create = useCreatePlayerChipAdjustment();

  useEffect(() => {
    if (editing) { inputRef.current?.focus(); inputRef.current?.select(); }
  }, [editing]);

  const display = value ? formatCurrency(value) : "·";

  if (!canEdit) {
    return <span className={value ? "" : "text-muted-foreground/60"}>{display}</span>;
  }

  const startEdit = () => { setRaw(""); setEditing(true); };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (value > 0) {
      setConfirmOpen(true);
    } else {
      startEdit();
    }
  };

  const commit = async () => {
    const newValue = parseSpacedNumber(raw) || 0;
    const delta = newValue - (value || 0);
    if (delta === 0) { setEditing(false); setRaw(""); return; }
    try {
      await create.mutateAsync({
        player_id: playerId,
        chip_in: direction === "in" ? delta : 0,
        chip_out: direction === "out" ? delta : 0,
      });
      setEditing(false);
      setRaw("");
    } catch {
      // toast handled by hook
    }
  };

  return (
    <>
      {!editing ? (
        <button
          type="button"
          onClick={handleClick}
          className={`font-mono cursor-pointer hover:text-primary text-right w-full ${value ? "" : "text-muted-foreground/60"}`}
          title={value > 0
            ? `Existing Chip ${direction === "in" ? "IN" : "OUT"} — click to replace`
            : `Add Chip ${direction === "in" ? "IN" : "OUT"} adjustment`}
        >
          {display}
        </button>
      ) : (
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          value={raw}
          onChange={(e) => setRaw(formatInputWithSpaces(e.target.value))}
          onBlur={() => { if (!create.isPending) { setEditing(false); setRaw(""); } }}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); commit(); }
            if (e.key === "Escape") { e.preventDefault(); setEditing(false); setRaw(""); }
          }}
          onClick={(e) => e.stopPropagation()}
          placeholder={value > 0 ? formatCurrency(value) : (direction === "in" ? "IN" : "OUT")}
          disabled={create.isPending}
          className={`no-spin w-full h-7 px-1.5 rounded border bg-background font-mono text-sm text-right ${
            direction === "in" ? "border-success/60 text-success" : "border-destructive/60 text-destructive"
          }`}
        />
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace existing Chip {direction === "in" ? "IN" : "OUT"}?</AlertDialogTitle>
            <AlertDialogDescription>
              Current value: <span className="font-mono font-semibold">{formatCurrency(value)}</span>.
              Entering a new amount will overwrite this total (recorded as an immutable audit delta).
              Enter 0 to clear it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setConfirmOpen(false); startEdit(); }}>
              Replace
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default PlayerStatistics;

