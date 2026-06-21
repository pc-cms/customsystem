import { Fragment, useMemo, useState } from "react";
import { useSessionState } from "@/hooks/use-session-state";
import { useNavigate, useParams, Link } from "react-router-dom";
import { ArrowLeft, Ban, User, Users as UsersIcon, BarChart3, Ticket, Trophy, History, MapPin, Gift, CalendarDays } from "lucide-react";

import BlacklistPlayerDialog from "@/components/player/BlacklistPlayerDialog";
import { formatCardId } from "@/lib/card-number";
import PlayerVisitsBreakdown from "@/components/player/PlayerVisitsBreakdown";
import PlayerChipAdjustmentsLog from "@/components/player/PlayerChipAdjustmentsLog";
import { canSeePlayerFinancials } from "@/lib/role-access";
import { PageShell, PageSection } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DateRangePresets, type DatePreset, presetRange } from "@/components/ui/date-range-presets";
import CategoryBadge, { type PlayerCategory } from "@/components/player/CategoryBadge";
import CasinoBadge from "@/components/player/CasinoBadge";
import PlayerStatusTagsEditor, { LevelPicker } from "@/components/player/PlayerStatusTagsEditor";
import PlayerEditDialog from "@/components/PlayerEditDialog";
import { fmtDate, fmtDateTime, fmtTime } from "@/lib/format-date";
import {
  usePlayer, usePlayerVisits, usePlayerSessions, usePlayerGroupHistory,
  usePlayerNotes, usePlayerTransactions, usePlayerEconomy, usePlayerExpenses,
  useCreatePlayerNote, useUpdatePlayerCategory,
} from "@/hooks/use-player-profile";
import { usePlayerChipAdjustments } from "@/hooks/use-player-chip-adjustments";
import { Textarea } from "@/components/ui/textarea";
import { PlayerNotesPanel } from "@/components/player/PlayerNotesPanel";
import { useAuth } from "@/lib/auth-context";
import { useBusinessDayFilter } from "@/hooks/use-business-day-filter";
import { edgeFor, theoFromHands, theoFromDrop, holdPct } from "@/lib/casino-edges";

// CCTV (surveillance) and finance_manager get read-only access on this page.
// Manager / Super Admin can edit via the dialog.

const fmtDuration = (minutes: number) => {
  if (!minutes || minutes < 0) return "—";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

const visitDuration = (v: any) => {
  if (!v.checked_out_at) return 0;
  const start = new Date(v.checked_in_at).getTime();
  const end = new Date(v.checked_out_at).getTime();
  return Math.max(0, Math.round((end - start) / 60000));
};

const fmtMoney = (n: number) => {
  const sign = n < 0 ? "-" : "";
  return `${sign}${Math.abs(n).toLocaleString()}`;
};

const dot = () => <span className="text-muted-foreground">·</span>;

const PlayerProfile = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { roles, isManager } = useAuth();
  const showFinancials = canSeePlayerFinancials(roles);
  const canEditLevel = roles.some((r) => ["super_admin", "manager", "shift_manager", "finance_manager"].includes(r));
  const updateCategory = useUpdatePlayerCategory();

  const { data: player, isLoading } = usePlayer(id);
  const { data: visits = [] } = usePlayerVisits(id);
  const { data: transactions = [] } = usePlayerTransactions(id);
  const { data: groupHistory = [] } = usePlayerGroupHistory(id);
  const { data: economy = null } = usePlayerEconomy(id);
  const { data: expenses = [] } = usePlayerExpenses(id);
  const canSeeNotes = roles.some(r => ["pit", "surveillance", "manager", "shift_manager"].includes(r)) || isManager;
  const { data: notes = [] } = usePlayerNotes(id, canSeeNotes);
  const { data: chipAdjustments = [] } = usePlayerChipAdjustments(id);

  // Pit / Cashier / Reception are restricted to the current business day
  // unless the Manager Access override is active.
  const { restrictedToToday, businessDate } = useBusinessDayFilter();
  const initialPreset: DatePreset = restrictedToToday ? "day" : "month";
  const [preset, setPreset] = useSessionState<DatePreset>("preset", initialPreset);
  const [range, setRange] = useSessionState("range", () => restrictedToToday
    ? { from: businessDate!, to: businessDate! }
    : presetRange("month"));
  const { data: sessions = [] } = usePlayerSessions(id, range);

  const [editOpen, setEditOpen] = useState(false);
  const [expandedVisit, setExpandedVisit] = useState<string | null>(null);
  const [blacklistOpen, setBlacklistOpen] = useState(false);

  // Range bounds (apply to all tabs).
  const rangeStartMs = useMemo(() => new Date(`${range.from}T00:00:00`).getTime(), [range.from]);
  const rangeEndMs = useMemo(() => new Date(`${range.to}T23:59:59`).getTime(), [range.to]);

  // Filter visits by BUSINESS date (v.date YYYY-MM-DD) — not by checked_in_at
  // timestamp. A visit that opens after midnight but before 07:00 EAT still
  // belongs to the previous business day (date stays the same), so a
  // calendar-day timestamp filter would drop it. Use string compare which
  // is safe for YYYY-MM-DD ordering.
  const visitsInRange = useMemo(
    () => visits.filter((v: any) => {
      const d = v.date as string | null;
      if (!d) return false;
      return d >= range.from && d <= range.to;
    }),
    [visits, range.from, range.to]
  );

  const txInRange = useMemo(
    () => transactions.filter((t: any) => {
      const ts = new Date(t.created_at).getTime();
      return ts >= rangeStartMs && ts <= rangeEndMs;
    }),
    [transactions, rangeStartMs, rangeEndMs]
  );

  const expensesInRange = useMemo(
    () => expenses.filter((e: any) => {
      const ts = new Date(e.created_at).getTime();
      return ts >= rangeStartMs && ts <= rangeEndMs;
    }),
    [expenses, rangeStartMs, rangeEndMs]
  );

  const chipAdjInRange = useMemo(
    () => (chipAdjustments as any[]).filter((c: any) => {
      const ts = new Date(c.created_at).getTime();
      return ts >= rangeStartMs && ts <= rangeEndMs;
    }),
    [chipAdjustments, rangeStartMs, rangeEndMs]
  );

  // Map transactions to visits (same casino + within check-in / check-out window).
  // dropR = NEP-aware external drop per visit (computed via lifetime walk).
  const visitFinancials = useMemo(() => {
    const map = new Map<string, { totalIn: number; cashout: number; comps: number; dropR: number; chipIn: number; chipOut: number }>();
    for (const v of visits) {
      map.set(v.id, { totalIn: 0, cashout: 0, comps: 0, dropR: 0, chipIn: 0, chipOut: 0 });
    }
    // Sort visits per casino by check-in for window matching.
    const visitsByCasino = new Map<string, any[]>();
    for (const v of visits) {
      const arr = visitsByCasino.get(v.casino_id) || [];
      arr.push(v);
      visitsByCasino.set(v.casino_id, arr);
    }
    const findVisit = (casinoId: string, ts: number) => {
      const arr = visitsByCasino.get(casinoId);
      if (!arr) return null;
      for (const v of arr) {
        const start = new Date(v.checked_in_at).getTime();
        const end = v.checked_out_at ? new Date(v.checked_out_at).getTime() : start + 24 * 3600 * 1000;
        if (ts >= start && ts <= end) return v;
      }
      return null;
    };
    // NEP walk over all transactions chronologically. NEP resets at the start
    // of every business day (Africa/Dar_es_Salaam, 05:00 rollover) so each day
    // stands alone — lifetime is the sum of per-day results.
    const sorted = [...transactions].sort((a: any, b: any) => String(a.created_at).localeCompare(String(b.created_at)));
    const businessDateOf = (iso: string) => {
      const d = new Date(iso);
      // Africa/Dar_es_Salaam = UTC+3; subtract 5h to get business date
      const eat = new Date(d.getTime() + 3 * 3600 * 1000 - 5 * 3600 * 1000);
      return eat.toISOString().slice(0, 10);
    };
    let nep = 0;
    let prevBd: string | null = null;
    for (const t of sorted as any[]) {
      const amt = Number(t.amount) || 0;
      const ts = new Date(t.created_at).getTime();
      const v = findVisit(t.casino_id, ts);
      const bd = businessDateOf(t.created_at);
      if (bd !== prevBd) { nep = 0; prevBd = bd; }
      if (t.type === "buy" || t.type === "in") {
        const rec = nep < 0 ? Math.min(amt, -nep) : 0;
        const ext = amt - rec;
        nep += amt;
        if (v) {
          const f = map.get(v.id)!;
          f.totalIn += amt;
          f.dropR += ext;
        }
      } else if (t.type === "cashout" || t.type === "out") {
        nep -= amt;
        if (v) {
          const f = map.get(v.id)!;
          f.cashout += amt;
        }
      }
    }
    for (const e of expenses) {
      const ts = new Date(e.created_at).getTime();
      const v = findVisit(e.casino_id, ts);
      if (v) {
        const f = map.get(v.id)!;
        f.comps += Number(e.amount) || 0;
      }
    }
    // Chip adjustments per visit (audit-only; affect Result/Total but never NEP/Drop R).
    for (const c of chipAdjustments as any[]) {
      const ts = new Date(c.created_at).getTime();
      const v = findVisit(c.casino_id, ts);
      if (v) {
        const f = map.get(v.id)!;
        f.chipIn += Number(c.chip_in) || 0;
        f.chipOut += Number(c.chip_out) || 0;
      }
    }
    return map;
  }, [visits, transactions, expenses, chipAdjustments]);

  // Per-visit transactions list (for the expandable row showing every IN/OUT with time + table).
  const visitTxs = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const v of visits) map.set(v.id, []);
    for (const t of transactions as any[]) {
      if (t.type !== "buy" && t.type !== "in" && t.type !== "cashout" && t.type !== "out") continue;
      const ts = new Date(t.created_at).getTime();
      for (const v of visits) {
        if (v.casino_id !== t.casino_id) continue;
        const start = new Date(v.checked_in_at).getTime();
        const end = v.checked_out_at ? new Date(v.checked_out_at).getTime() : start + 24 * 3600 * 1000;
        if (ts >= start && ts <= end) { map.get(v.id)!.push(t); break; }
      }
    }
    for (const list of map.values()) {
      list.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    }
    return map;
  }, [visits, transactions]);

  // Lifetime KPIs — perspective: PLAYER (positive = player won, negative = player lost).
  // result = (cashout + chipOut) − (drop + chipIn)   (clean play + chip adjustments)
  // total  = result − comps                          (with comps/expenses)
  const lifetime = useMemo(() => {
    const totalMins = visits.reduce((s, v) => s + visitDuration(v), 0);
    const dropGross = Number(economy?.total_drop) || 0;
    const dropR = Number((economy as any)?.total_drop_r) || 0;
    const drop = dropR; // Lifetime "Drop" KPI = NEP-aware Drop R (External part of cash-in)
    const cashout = Number(economy?.total_cashout) || 0;
    const comps = Number(economy?.total_expenses) || 0;
    let chipIn = 0, chipOut = 0;
    for (const c of chipAdjustments as any[]) {
      chipIn += Number(c.chip_in) || 0;
      chipOut += Number(c.chip_out) || 0;
    }
    const result = (cashout + chipOut) - (dropGross + chipIn); // result includes chip adjustments
    const total = result - comps;
    const hold = holdPct(dropGross, cashout, comps); // Hold % stays on cash drop only (audit-only chips don't bias hold)
    const firstVisit = visits.length ? visits[visits.length - 1].checked_in_at : null;
    const lastVisit = visits[0] ? (visits[0].checked_out_at || visits[0].checked_in_at) : null;
    const daysSinceLast = lastVisit
      ? Math.floor((Date.now() - new Date(lastVisit).getTime()) / 86400000)
      : null;
    const avgSession = visits.length ? Math.round(totalMins / visits.length) : 0;
    return {
      visitCount: visits.length,
      totalMins,
      avgSession,
      drop,
      cashout,
      comps,
      chipIn,
      chipOut,
      result,
      total,
      hold,
      firstVisit,
      lastVisit,
      daysSinceLast,
    };
  }, [visits, economy, chipAdjustments]);

  // Period summary (NEP-aware Drop R: lifetime walk, attribute External part to in-range cash-ins).
  const period = useMemo(() => {
    const sorted = [...transactions].sort((a: any, b: any) => String(a.created_at).localeCompare(String(b.created_at)));
    let nep = 0, pIn = 0, pOut = 0;
    for (const t of sorted as any[]) {
      const amt = Number(t.amount) || 0;
      const ts = new Date(t.created_at).getTime();
      const inRange = ts >= rangeStartMs && ts <= rangeEndMs;
      if (t.type === "buy" || t.type === "in") {
        const rec = nep < 0 ? Math.min(amt, -nep) : 0;
        const ext = amt - rec;
        nep += amt;
        if (inRange) pIn += ext; // Drop R only
      } else if (t.type === "cashout" || t.type === "out") {
        nep -= amt;
        if (inRange) pOut += amt;
      }
    }
    const pComps = expensesInRange.reduce((s, e: any) => s + (Number(e.amount) || 0), 0);
    const pMins = visitsInRange.reduce((s, v) => s + visitDuration(v), 0);
    let pChipIn = 0, pChipOut = 0;
    for (const c of chipAdjInRange) {
      pChipIn += Number(c.chip_in) || 0;
      pChipOut += Number(c.chip_out) || 0;
    }
    const result = (pOut + pChipOut) - (pIn + pChipIn);
    const total = result - pComps;
    return { pIn, pOut, pComps, pMins, pChipIn, pChipOut, result, total, hold: holdPct(pIn, pOut, pComps), visits: visitsInRange.length };
  }, [transactions, rangeStartMs, rangeEndMs, expensesInRange, visitsInRange, chipAdjInRange]);

  // Per-table aggregates (Position / Sessions / Hands / Avg bet / Duration / IN / OUT / Theo / Result / Hold).
  const tableStats = useMemo(() => {
    type Row = {
      key: string; name: string; game: string;
      sessions: number; hands: number; betSum: number;
      minutes: number; totalIn: number; totalOut: number;
    };
    const map = new Map<string, Row>();

    for (const s of sessions as any[]) {
      const key = s.table_id || "unknown";
      const name = s.gaming_tables?.name || "—";
      const game = s.gaming_tables?.game || "—";
      const cur = map.get(key) || { key, name, game, sessions: 0, hands: 0, betSum: 0, minutes: 0, totalIn: 0, totalOut: 0 };
      cur.sessions += 1;
      cur.hands += s.hands_played || 0;
      cur.betSum += (Number(s.avg_bet) || 0) * (s.hands_played || 0);
      cur.minutes += s.duration_minutes || 0;
      map.set(key, cur);
    }
    for (const t of txInRange as any[]) {
      const key = t.table_id || "unknown";
      const name = t.gaming_tables?.name || "—";
      const game = t.gaming_tables?.game || "—";
      const cur = map.get(key) || { key, name, game, sessions: 0, hands: 0, betSum: 0, minutes: 0, totalIn: 0, totalOut: 0 };
      const amt = Number(t.amount) || 0;
      if (t.type === "buy" || t.type === "in") cur.totalIn += amt;
      else if (t.type === "cashout" || t.type === "out") cur.totalOut += amt;
      if (cur.name === "—" && name !== "—") cur.name = name;
      if (cur.game === "—" && game !== "—") cur.game = game;
      map.set(key, cur);
    }

    const rows = Array.from(map.values())
      .filter(r => r.minutes > 0 || r.totalIn > 0 || r.totalOut > 0)
      .sort((a, b) => (b.totalIn - b.totalOut) - (a.totalIn - a.totalOut));

    const total = rows.reduce(
      (acc, r) => ({
        sessions: acc.sessions + r.sessions,
        hands: acc.hands + r.hands,
        minutes: acc.minutes + r.minutes,
        totalIn: acc.totalIn + r.totalIn,
        totalOut: acc.totalOut + r.totalOut,
        betSum: acc.betSum + r.betSum,
      }),
      { sessions: 0, hands: 0, minutes: 0, totalIn: 0, totalOut: 0, betSum: 0 }
    );
    return { rows, total };
  }, [sessions, txInRange]);

  // Per-game aggregates.
  const gameStats = useMemo(() => {
    type Row = { game: string; sessions: number; hands: number; minutes: number; totalIn: number; totalOut: number };
    const map = new Map<string, Row>();
    for (const r of tableStats.rows) {
      const key = r.game;
      const cur = map.get(key) || { game: key, sessions: 0, hands: 0, minutes: 0, totalIn: 0, totalOut: 0 };
      cur.sessions += r.sessions;
      cur.hands += r.hands;
      cur.minutes += r.minutes;
      cur.totalIn += r.totalIn;
      cur.totalOut += r.totalOut;
      map.set(key, cur);
    }
    return Array.from(map.values()).sort((a, b) => (b.totalIn - b.totalOut) - (a.totalIn - a.totalOut));
  }, [tableStats.rows]);

  // Per-casino aggregates (only useful when player visited multiple casinos).
  const casinoStats = useMemo(() => {
    const map = new Map<string, { id: string; name: string; visits: number; totalIn: number; totalOut: number; comps: number }>();
    for (const v of visitsInRange as any[]) {
      const k = v.casino_id;
      const cur = map.get(k) || { id: k, name: v.casinos?.name || "—", visits: 0, totalIn: 0, totalOut: 0, comps: 0 };
      cur.visits += 1;
      const f = visitFinancials.get(v.id);
      if (f) { cur.totalIn += f.totalIn; cur.totalOut += f.cashout; cur.comps += f.comps; }
      map.set(k, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.totalIn - a.totalIn);
  }, [visitsInRange, visitFinancials]);

  // Weekday × hour heatmap (all visits, lifetime).
  const heatmap = useMemo(() => {
    const grid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
    for (const v of visits as any[]) {
      const d = new Date(v.checked_in_at);
      grid[d.getDay()][d.getHours()] += 1;
    }
    let max = 0;
    for (const row of grid) for (const c of row) if (c > max) max = c;
    return { grid, max };
  }, [visits]);

  if (isLoading) {
    return (
      <PageShell>
        <div className="text-center text-muted-foreground py-12">Loading player…</div>
      </PageShell>
    );
  }

  if (!player) {
    return (
      <PageShell>
        <div className="text-center text-muted-foreground py-12">
          Player not found.
          <div className="mt-3">
            <Button size="sm" variant="outline" onClick={() => navigate("/player-statistics")}>Back</Button>
          </div>
        </div>
      </PageShell>
    );
  }

  const fullName = `${player.first_name} ${player.last_name}`.trim();
  const tagRows = (player.player_tags || []) as Array<{ tag: string; source?: string | null }>;
  const activeCard = (player.player_cards || []).find((c: any) => c.is_active)?.card_number
    || player.player_cards?.[0]?.card_number;

  return (
    <PageShell>
      {/* Top bar */}
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate("/player-statistics")} className="h-9">
          <ArrowLeft className="w-4 h-4 mr-1" /> Players
        </Button>
        <div className="flex items-center gap-2">
          {(roles.some(r => ["pit", "manager", "shift_manager", "surveillance", "super_admin"].includes(r)) || (roles.includes("reception") && isManager)) && player.status !== "blacklist" && (
            <Button variant="outline" size="sm" className="h-9 text-destructive border-destructive/50 hover:bg-destructive/10" onClick={() => setBlacklistOpen(true)}>
              <Ban className="w-3.5 h-3.5 mr-1.5" /> Add to Blacklist
            </Button>
          )}
          {(isManager || roles.some(r => ["super_admin", "manager", "shift_manager", "reception", "pit"].includes(r))) && (
            <Button variant="outline" size="sm" className="h-9" onClick={() => setEditOpen(true)}>
              Edit player
            </Button>
          )}
        </div>
      </div>

      {/* Header card: photo left, info right */}
      <PageSection card>
        <div className="flex flex-col md:flex-row gap-4">
          <div className="w-full md:w-[180px] shrink-0">
            <div className="aspect-[4/5] w-full rounded-lg bg-muted flex items-center justify-center overflow-hidden border border-border">
              {player.photo_url ? (
                <img src={player.photo_url} className="w-full h-full object-cover" alt={fullName} />
              ) : (
                <User className="w-16 h-16 text-muted-foreground" />
              )}
            </div>
          </div>

          <div className="flex-1 min-w-0 space-y-3">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-2xl font-semibold text-card-foreground">{fullName}</h1>
                  <LevelPicker
                    value={(player.category as PlayerCategory) || "normal"}
                    onPick={(v) => updateCategory.mutate({ player_id: player.id, category: v })}
                    canEdit={canEditLevel}
                  />
                  {player.status === "blacklist" && (
                    <span className="text-xs font-bold text-destructive border border-destructive rounded px-1.5 py-0.5">BL</span>
                  )}
                  {player.casino_id && <CasinoBadge casinoId={player.casino_id} />}
                </div>
                {player.nickname && (
                  <div className="text-sm text-muted-foreground mt-0.5">"{player.nickname}"</div>
                )}
              </div>
              <div className="text-right">
                {activeCard && <div className="font-mono text-2xl font-bold text-foreground">{formatCardId(activeCard)}</div>}
                {player.id_number && <div className="font-mono text-xs text-muted-foreground">Doc: {player.id_number}</div>}
              </div>
            </div>

            {/* Tags moved up — right after name + level, in two columns. */}
            <PlayerStatusTagsEditor playerId={player.id} tagRows={tagRows} />

            {/* KPIs: financials on row 1, time/visits on row 2 (5 cols on lg). */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
              {showFinancials && (
                <>
                  <Kpi label="Drop" value={fmtMoney(lifetime.drop)} />
                  <Kpi label="Cashout" value={fmtMoney(lifetime.cashout)} />
                  <Kpi
                    label="Result"
                    value={fmtMoney(lifetime.result)}
                    valueClass={lifetime.result === 0 ? undefined : lifetime.result > 0 ? "cms-amount-positive" : "cms-amount-negative"}
                  />
                  <Kpi label="Comps" value={fmtMoney(lifetime.comps)} />
                  <Kpi
                    label="Total"
                    value={fmtMoney(lifetime.total)}
                    valueClass={lifetime.total === 0 ? undefined : lifetime.total > 0 ? "cms-amount-positive" : "cms-amount-negative"}
                  />
                </>
              )}
              <Kpi label="Visits" value={lifetime.visitCount.toString()} />
              <Kpi label="Total time" value={fmtDuration(lifetime.totalMins)} />
              <Kpi label="Avg session" value={lifetime.avgSession ? fmtDuration(lifetime.avgSession) : "—"} />
              {showFinancials && (
                <Kpi
                  label="Hold %"
                  value={lifetime.hold === null ? "—" : `${lifetime.hold.toFixed(1)}%`}
                />
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 text-xs text-muted-foreground">
              <Field label="Phone" value={player.phone || "—"} />
              <Field label="Birth date" value={player.birth_date ? fmtDate(player.birth_date) : "—"} />
              <Field label="Player type" value={player.player_type || "—"} />
              <Field label="Status" value={player.status || "active"} />
              <Field label="First visit" value={lifetime.firstVisit ? fmtDate(lifetime.firstVisit) : "—"} />
              <Field
                label="Last visit"
                value={lifetime.lastVisit ? fmtDateTime(lifetime.lastVisit) : "—"}
              />
              <Field
                label="Days since last"
                value={lifetime.daysSinceLast === null ? "—" : `${lifetime.daysSinceLast}d`}
              />
            </div>
          </div>
        </div>
      </PageSection>

      {/* Tabs */}
      <Tabs defaultValue="info" className="w-full">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <TabsList className="w-full sm:w-auto overflow-x-auto justify-start">
            <TabsTrigger value="info"><History className="w-3.5 h-3.5 mr-1" /> Info & History</TabsTrigger>
            {showFinancials && <TabsTrigger value="visits"><CalendarDays className="w-3.5 h-3.5 mr-1" /> Visits</TabsTrigger>}
            {showFinancials && <TabsTrigger value="stats"><BarChart3 className="w-3.5 h-3.5 mr-1" /> Statistics</TabsTrigger>}
            <TabsTrigger value="connections"><UsersIcon className="w-3.5 h-3.5 mr-1" /> Connections</TabsTrigger>
            <TabsTrigger value="lotteries"><Trophy className="w-3.5 h-3.5 mr-1" /> Lotteries</TabsTrigger>
            <TabsTrigger value="tickets"><Ticket className="w-3.5 h-3.5 mr-1" /> Tickets</TabsTrigger>
          </TabsList>
          {restrictedToToday ? (
            <div className="text-[10px] uppercase font-mono text-muted-foreground px-2 py-1 rounded bg-muted/40 border border-border">
              Business day · {businessDate}
            </div>
          ) : (
            <DateRangePresets
              preset={preset}
              from={range.from}
              to={range.to}
              onChange={(next) => { setPreset(next.preset); setRange({ from: next.from, to: next.to }); }}
            />
          )}
        </div>

        {/* TAB 1 */}
        <TabsContent value="info" className="space-y-4">
          {canSeeNotes && (
            <PageSection card title={`Notes (${notes.length})`}>
              <PlayerNotesPanel
                playerId={(player as any).id}
                selfFetch={false}
                notes={notes}
                canPost={roles.some(r => ["pit","manager","shift_manager","surveillance","super_admin","reception"].includes(r))}
              />
            </PageSection>
          )}

          <PageSection card title={`Visits (${visitsInRange.length})`}>
            {visitsInRange.length === 0 ? (
              <div className="text-sm text-muted-foreground">No visits in this period.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-muted-foreground uppercase">
                      <th className="text-left py-2 px-2">Date</th>
                      <th className="text-left py-2 px-2">Casino</th>
                      <th className="text-left py-2 px-2">Check-in</th>
                      <th className="text-left py-2 px-2">Check-out</th>
                      <th className="text-left py-2 px-2">Duration</th>
                      {showFinancials && <th className="text-right py-2 px-2" title="Drop — NEP-aware (external cash only)">Drop</th>}
                      {showFinancials && <th className="text-right py-2 px-2" title="Total cash in (all buy-ins)">Cash In</th>}
                      {showFinancials && <th className="text-right py-2 px-2">Cashout</th>}
                      {showFinancials && <th className="text-right py-2 px-2" title="Chip adjustments in (+)">Chip In</th>}
                      {showFinancials && <th className="text-right py-2 px-2" title="Chip adjustments out (−)">Chip Out</th>}
                      {showFinancials && <th className="text-right py-2 px-2">Result</th>}
                      {showFinancials && <th className="text-right py-2 px-2">Comps</th>}
                      {showFinancials && <th className="text-right py-2 px-2">Total</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {visitsInRange.slice(0, 200).map((v: any) => {
                      const f = visitFinancials.get(v.id) || { totalIn: 0, cashout: 0, comps: 0, dropR: 0, chipIn: 0, chipOut: 0 };
                      const result = (f.cashout + f.chipOut) - (f.totalIn + f.chipIn);
                      const total = result - f.comps;
                      const colCount = 5 + (showFinancials ? 8 : 0);
                      const isExpanded = expandedVisit === v.id;
                      const txs = visitTxs.get(v.id) || [];
                      return (
                        <Fragment key={v.id}>
                        <tr
                          key={v.id}
                          className={`border-t border-border cursor-pointer hover:bg-muted/40 ${isExpanded ? "bg-muted/30" : ""}`}
                          onClick={() => setExpandedVisit(isExpanded ? null : v.id)}
                          title={`${txs.length} IN/OUT transactions — click to ${isExpanded ? "hide" : "show"}`}
                        >
                          <td className="py-1.5 px-2 font-mono text-xs">
                            <span className="inline-block w-3 text-muted-foreground">{isExpanded ? "▾" : "▸"}</span> {fmtDate(v.date)}
                          </td>
                          <td className="py-1.5 px-2">{v.casinos?.name || "—"}</td>
                           <td className="py-1.5 px-2 font-mono text-xs">{fmtTime(v.checked_in_at)}</td>
                           <td className="py-1.5 px-2 font-mono text-xs">{v.checked_out_at ? fmtTime(v.checked_out_at) : "—"}</td>
                          <td className="py-1.5 px-2">{fmtDuration(visitDuration(v))}</td>
                          
                          {showFinancials && <td className="py-1.5 px-2 font-mono text-xs text-right">{f.dropR ? fmtMoney(f.dropR) : dot()}</td>}
                          {showFinancials && <td className="py-1.5 px-2 font-mono text-xs text-right">{f.totalIn ? fmtMoney(f.totalIn) : dot()}</td>}
                          {showFinancials && <td className="py-1.5 px-2 font-mono text-xs text-right">{f.cashout ? fmtMoney(f.cashout) : dot()}</td>}
                          {showFinancials && <td className="py-1.5 px-2 font-mono text-xs text-right text-success">{f.chipIn ? fmtMoney(f.chipIn) : dot()}</td>}
                          {showFinancials && <td className="py-1.5 px-2 font-mono text-xs text-right text-destructive">{f.chipOut ? fmtMoney(f.chipOut) : dot()}</td>}
                          {showFinancials && (
                            <td className={`py-1.5 px-2 font-mono text-xs text-right ${result === 0 ? "text-muted-foreground" : result > 0 ? "cms-amount-positive" : "cms-amount-negative"}`}>
                              {result === 0 ? "·" : fmtMoney(result)}
                            </td>
                          )}
                          {showFinancials && <td className="py-1.5 px-2 font-mono text-xs text-right">{f.comps ? fmtMoney(f.comps) : dot()}</td>}
                          {showFinancials && (
                            <td className={`py-1.5 px-2 font-mono text-xs text-right ${total === 0 ? "text-muted-foreground" : total > 0 ? "cms-amount-positive" : "cms-amount-negative"}`}>
                              {total === 0 ? "·" : fmtMoney(total)}
                            </td>
                          )}
                        </tr>
                        {isExpanded && (
                          <tr className="bg-muted/20 border-t border-border">
                            <td colSpan={colCount} className="px-4 py-2">
                              {txs.length === 0 ? (
                                <div className="text-xs text-muted-foreground py-1">No IN/OUT transactions during this visit.</div>
                              ) : (
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
                                      <th className="text-left py-1 px-2 w-20">Time</th>
                                      <th className="text-left py-1 px-2 w-16">Type</th>
                                      <th className="text-left py-1 px-2">Table</th>
                                      {showFinancials && <th className="text-right py-1 px-2 w-28">Amount</th>}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {txs.map((t: any) => {
                                      const isIn = t.type === "buy" || t.type === "in";
                                      return (
                                        <tr key={t.id} className="border-t border-border/40">
                                          <td className="py-1 px-2 font-mono">{new Date(t.created_at).toLocaleTimeString("en-GB", { timeZone: "Africa/Dar_es_Salaam", hour: "2-digit", minute: "2-digit" })}</td>
                                          <td className="py-1 px-2">
                                            <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold ${isIn ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"}`}>
                                              {isIn ? "IN" : "OUT"}
                                            </span>
                                          </td>
                                          <td className="py-1 px-2">{t.gaming_tables?.name || <span className="text-muted-foreground">—</span>}</td>
                                          {showFinancials && (
                                            <td className={`py-1 px-2 text-right font-mono font-semibold ${isIn ? "cms-amount-negative" : "cms-amount-positive"}`}>
                                              {isIn ? "−" : "+"}{fmtMoney(Number(t.amount) || 0)}
                                            </td>
                                          )}
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              )}
                            </td>
                          </tr>
                        )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    {(() => {
                      const periodMins = visitsInRange.reduce((s, v) => s + visitDuration(v), 0);
                      let pDropR = 0, pIn = 0, pOut = 0, pComps = 0;
                      for (const v of visitsInRange) {
                        const f = visitFinancials.get(v.id);
                        if (!f) continue;
                        pDropR += f.dropR; pIn += f.totalIn; pOut += f.cashout; pComps += f.comps;
                      }
                      const pRes = pOut - pIn;
                      const pTotal = pRes - pComps;
                      return (
                        <tr className="border-t-2 border-border font-semibold">
                          <td className="py-2 px-2 text-xs uppercase text-muted-foreground" colSpan={4}>Total (period)</td>
                          <td className="py-2 px-2">{fmtDuration(periodMins)}</td>
                          {showFinancials && <td className="py-2 px-2 font-mono text-xs text-right">{fmtMoney(pDropR)}</td>}
                          {showFinancials && <td className="py-2 px-2 font-mono text-xs text-right">{fmtMoney(pIn)}</td>}
                          {showFinancials && <td className="py-2 px-2 font-mono text-xs text-right">{fmtMoney(pOut)}</td>}
                          {showFinancials && <td className={`py-2 px-2 font-mono text-xs text-right ${pRes === 0 ? "" : pRes > 0 ? "cms-amount-positive" : "cms-amount-negative"}`}>{fmtMoney(pRes)}</td>}
                          {showFinancials && <td className="py-2 px-2 font-mono text-xs text-right">{fmtMoney(pComps)}</td>}
                          {showFinancials && <td className={`py-2 px-2 font-mono text-xs text-right ${pTotal === 0 ? "" : pTotal > 0 ? "cms-amount-positive" : "cms-amount-negative"}`}>{fmtMoney(pTotal)}</td>}
                        </tr>
                      );
                    })()}
                  </tfoot>
                </table>
              </div>
            )}
          </PageSection>
        </TabsContent>

        {/* TAB — Visits (Month → Week → Day breakdown, full lifetime) */}
        <TabsContent value="visits" className="space-y-4">
          <PageSection card title="Visits breakdown">
            <PlayerVisitsBreakdown
              visits={visits as any}
              transactions={transactions as any}
              expenses={expenses as any}
              showFinancials={canSeePlayerFinancials(roles)}
            />
          </PageSection>

          {canSeePlayerFinancials(roles) && id && (
            <PageSection card title="Chip Adjustments (lifetime)">
              <PlayerChipAdjustmentsLog playerId={id} />
            </PageSection>
          )}
        </TabsContent>

        {/* TAB 2 — Statistics */}
        <TabsContent value="stats" className="space-y-4">
          {/* Period summary strip */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2">
            <Kpi label="Visits" value={period.visits.toString()} />
            <Kpi label="Time" value={fmtDuration(period.pMins)} />
            <Kpi label="Drop" value={fmtMoney(period.pIn)} />
            <Kpi label="Cashout" value={fmtMoney(period.pOut)} />
            <Kpi
              label="Result"
              value={fmtMoney(period.result)}
              valueClass={period.result === 0 ? undefined : period.result > 0 ? "cms-amount-positive" : "cms-amount-negative"}
            />
            <Kpi label="Comps" value={fmtMoney(period.pComps)} />
            <Kpi
              label="Total"
              value={fmtMoney(period.total)}
              valueClass={period.total === 0 ? undefined : period.total > 0 ? "cms-amount-positive" : "cms-amount-negative"}
            />
          </div>

          <PageSection card title={`By table (${tableStats.rows.length})`}>
            {tableStats.rows.length === 0 ? (
              <div className="text-sm text-muted-foreground">No table activity in this period.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-muted-foreground uppercase">
                      <th className="text-left py-2 px-2">Position</th>
                      <th className="text-left py-2 px-2">Game</th>
                      <th className="text-right py-2 px-2">Sess.</th>
                      <th className="text-right py-2 px-2">Hands</th>
                      <th className="text-right py-2 px-2">Avg bet</th>
                      <th className="text-right py-2 px-2">Duration</th>
                      <th className="text-right py-2 px-2">IN</th>
                      <th className="text-right py-2 px-2">OUT</th>
                      <th className="text-right py-2 px-2">Theo</th>
                      <th className="text-right py-2 px-2">Result</th>
                      <th className="text-right py-2 px-2">Hold %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tableStats.rows.map((r) => {
                      const result = r.totalOut - r.totalIn;
                      const avgBet = r.hands ? r.betSum / r.hands : 0;
                      const theo = r.hands
                        ? theoFromHands(avgBet, r.hands, r.game)
                        : theoFromDrop(r.totalIn, r.game);
                      const hold = holdPct(r.totalIn, r.totalOut, 0);
                      return (
                        <tr key={r.key} className="border-t border-border">
                          <td className="py-1.5 px-2">{r.name}</td>
                          <td className="py-1.5 px-2 text-xs text-muted-foreground">{r.game}</td>
                          <td className="py-1.5 px-2 text-right font-mono">{r.sessions || dot()}</td>
                          <td className="py-1.5 px-2 text-right font-mono">{r.hands || dot()}</td>
                          <td className="py-1.5 px-2 text-right font-mono">{avgBet ? fmtMoney(Math.round(avgBet)) : dot()}</td>
                          <td className="py-1.5 px-2 text-right font-mono">{r.minutes ? fmtDuration(r.minutes) : dot()}</td>
                          <td className="py-1.5 px-2 text-right font-mono">{r.totalIn ? fmtMoney(r.totalIn) : dot()}</td>
                          <td className="py-1.5 px-2 text-right font-mono">{r.totalOut ? fmtMoney(r.totalOut) : dot()}</td>
                          <td className="py-1.5 px-2 text-right font-mono text-muted-foreground">{theo ? fmtMoney(theo) : dot()}</td>
                          <td className={`py-1.5 px-2 text-right font-mono ${result === 0 ? "text-muted-foreground" : result > 0 ? "cms-amount-positive" : "cms-amount-negative"}`}>
                            {result === 0 ? "·" : fmtMoney(result)}
                          </td>
                          <td className="py-1.5 px-2 text-right font-mono text-xs">
                            {hold === null ? dot() : `${hold.toFixed(1)}%`}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    {(() => {
                      const t = tableStats.total;
                      const avgBet = t.hands ? t.betSum / t.hands : 0;
                      const result = t.totalOut - t.totalIn;
                      const hold = holdPct(t.totalIn, t.totalOut, 0);
                      return (
                        <tr className="border-t-2 border-border bg-muted/30 font-semibold">
                          <td className="py-2 px-2 uppercase text-xs text-muted-foreground" colSpan={2}>Total</td>
                          <td className="py-2 px-2 text-right font-mono">{t.sessions}</td>
                          <td className="py-2 px-2 text-right font-mono">{t.hands}</td>
                          <td className="py-2 px-2 text-right font-mono">{avgBet ? fmtMoney(Math.round(avgBet)) : "—"}</td>
                          <td className="py-2 px-2 text-right font-mono">{fmtDuration(t.minutes)}</td>
                          <td className="py-2 px-2 text-right font-mono">{fmtMoney(t.totalIn)}</td>
                          <td className="py-2 px-2 text-right font-mono">{fmtMoney(t.totalOut)}</td>
                          <td className="py-2 px-2 text-right font-mono text-muted-foreground">—</td>
                          <td className={`py-2 px-2 text-right font-mono ${result >= 0 ? "cms-amount-positive" : "cms-amount-negative"}`}>{fmtMoney(result)}</td>
                          <td className="py-2 px-2 text-right font-mono text-xs">
                            {hold === null ? "—" : `${hold.toFixed(1)}%`}
                          </td>
                        </tr>
                      );
                    })()}
                  </tfoot>
                </table>
              </div>
            )}
          </PageSection>

          {gameStats.length > 0 && (
            <PageSection card title={`By game type (${gameStats.length})`}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-muted-foreground uppercase">
                      <th className="text-left py-2 px-2">Game</th>
                      <th className="text-right py-2 px-2">Sess.</th>
                      <th className="text-right py-2 px-2">Hands</th>
                      <th className="text-right py-2 px-2">Duration</th>
                      <th className="text-right py-2 px-2">IN</th>
                      <th className="text-right py-2 px-2">OUT</th>
                      <th className="text-right py-2 px-2">Result</th>
                      <th className="text-right py-2 px-2">Hold %</th>
                      <th className="text-right py-2 px-2">Edge</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gameStats.map((g) => {
                      const result = g.totalOut - g.totalIn;
                      const hold = holdPct(g.totalIn, g.totalOut, 0);
                      return (
                        <tr key={g.game} className="border-t border-border">
                          <td className="py-1.5 px-2">{g.game}</td>
                          <td className="py-1.5 px-2 text-right font-mono">{g.sessions || dot()}</td>
                          <td className="py-1.5 px-2 text-right font-mono">{g.hands || dot()}</td>
                          <td className="py-1.5 px-2 text-right font-mono">{g.minutes ? fmtDuration(g.minutes) : dot()}</td>
                          <td className="py-1.5 px-2 text-right font-mono">{g.totalIn ? fmtMoney(g.totalIn) : dot()}</td>
                          <td className="py-1.5 px-2 text-right font-mono">{g.totalOut ? fmtMoney(g.totalOut) : dot()}</td>
                          <td className={`py-1.5 px-2 text-right font-mono ${result === 0 ? "text-muted-foreground" : result > 0 ? "cms-amount-positive" : "cms-amount-negative"}`}>
                            {result === 0 ? "·" : fmtMoney(result)}
                          </td>
                          <td className="py-1.5 px-2 text-right font-mono text-xs">{hold === null ? dot() : `${hold.toFixed(1)}%`}</td>
                          <td className="py-1.5 px-2 text-right font-mono text-xs text-muted-foreground">{(edgeFor(g.game) * 100).toFixed(2)}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </PageSection>
          )}

          {casinoStats.length > 1 && (
            <PageSection card title={`By casino (${casinoStats.length})`}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-muted-foreground uppercase">
                      <th className="text-left py-2 px-2">Casino</th>
                      <th className="text-right py-2 px-2">Visits</th>
                      <th className="text-right py-2 px-2">Drop</th>
                      <th className="text-right py-2 px-2">Cashout</th>
                      <th className="text-right py-2 px-2">Result</th>
                      <th className="text-right py-2 px-2">Comps</th>
                      <th className="text-right py-2 px-2">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {casinoStats.map((c) => {
                      const result = c.totalOut - c.totalIn;
                      const total = result - c.comps;
                      return (
                        <tr key={c.id} className="border-t border-border">
                          <td className="py-1.5 px-2">{c.name}</td>
                          <td className="py-1.5 px-2 text-right font-mono">{c.visits}</td>
                          <td className="py-1.5 px-2 text-right font-mono">{c.totalIn ? fmtMoney(c.totalIn) : dot()}</td>
                          <td className="py-1.5 px-2 text-right font-mono">{c.totalOut ? fmtMoney(c.totalOut) : dot()}</td>
                          <td className={`py-1.5 px-2 text-right font-mono ${result === 0 ? "text-muted-foreground" : result > 0 ? "cms-amount-positive" : "cms-amount-negative"}`}>
                            {result === 0 ? "·" : fmtMoney(result)}
                          </td>
                          <td className="py-1.5 px-2 text-right font-mono">{c.comps ? fmtMoney(c.comps) : dot()}</td>
                          <td className={`py-1.5 px-2 text-right font-mono ${total === 0 ? "text-muted-foreground" : total > 0 ? "cms-amount-positive" : "cms-amount-negative"}`}>
                            {total === 0 ? "·" : fmtMoney(total)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </PageSection>
          )}

          <PageSection card title="Visit rhythm (lifetime, weekday × hour)">
            {heatmap.max === 0 ? (
              <div className="text-sm text-muted-foreground">Not enough visits.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="text-[10px] font-mono border-separate" style={{ borderSpacing: 2 }}>
                  <thead>
                    <tr>
                      <th className="text-left pr-2 text-muted-foreground"></th>
                      {Array.from({ length: 24 }, (_, h) => (
                        <th key={h} className="w-6 text-center text-muted-foreground">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((label, dow) => (
                      <tr key={label}>
                        <td className="pr-2 text-muted-foreground uppercase">{label}</td>
                        {heatmap.grid[dow].map((count, h) => {
                          const intensity = count / heatmap.max;
                          const bg = count === 0
                            ? "transparent"
                            : `hsl(var(--primary) / ${0.15 + intensity * 0.85})`;
                          return (
                            <td
                              key={h}
                              title={`${label} ${h}:00 — ${count} visit${count === 1 ? "" : "s"}`}
                              className="w-6 h-5 text-center rounded-sm border border-border/40"
                              style={{ background: bg, color: intensity > 0.55 ? "hsl(var(--primary-foreground))" : undefined }}
                            >
                              {count > 0 ? count : ""}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </PageSection>

          {expensesInRange.length > 0 && (
            <PageSection card title={`Comps in period (${expensesInRange.length})`}>
              <div className="space-y-1.5 max-h-[280px] overflow-y-auto">
                {expensesInRange.slice(0, 50).map((e: any) => (
                  <div key={e.id} className="flex items-center justify-between text-xs border-b border-border/40 py-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <Gift className="w-3 h-3 text-muted-foreground shrink-0" />
                      <span className="text-[10px] uppercase font-mono text-muted-foreground">{e.category}</span>
                      <span className="text-card-foreground truncate">{e.description || "—"}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="font-mono">{fmtMoney(Number(e.amount) || 0)}</span>
                      <span className="text-muted-foreground">{fmtDate(e.created_at)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </PageSection>
          )}
        </TabsContent>

        {/* TAB 3 */}
        <TabsContent value="connections" className="space-y-4">
          <PageSection card title={`Group memberships (${groupHistory.length})`}>
            {groupHistory.length === 0 ? (
              <div className="text-sm text-muted-foreground">Not part of any group.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-muted-foreground uppercase">
                      <th className="text-left py-2 px-2">Group</th>
                      <th className="text-left py-2 px-2">Joined</th>
                      <th className="text-left py-2 px-2">Left</th>
                      <th className="text-left py-2 px-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupHistory.map((m: any) => (
                      <tr key={m.id} className="border-t border-border">
                        <td className="py-1.5 px-2">
                          <Link to="/groups" className="text-primary hover:underline">
                            {m.player_groups?.name || "—"}
                          </Link>
                        </td>
                        <td className="py-1.5 px-2 font-mono text-xs">{m.joined_at ? fmtDateTime(m.joined_at) : "—"}</td>
                        <td className="py-1.5 px-2 font-mono text-xs">{m.left_at ? fmtDateTime(m.left_at) : "—"}</td>
                        <td className="py-1.5 px-2">
                          {m.left_at ? (
                            <span className="text-xs text-muted-foreground">Left</span>
                          ) : (
                            <span className="text-xs text-success">Active</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </PageSection>
        </TabsContent>

        {/* TAB 4 */}
        <TabsContent value="lotteries">
          <PageSection card title="Lotteries & Raffles history">
            <div className="text-sm text-muted-foreground py-6 text-center">
              <Trophy className="w-8 h-8 mx-auto mb-2 opacity-50" />
              Lottery module is not active yet. Past entries will appear here.
            </div>
          </PageSection>
        </TabsContent>

        {/* TAB 5 */}
        <TabsContent value="tickets">
          <PageSection card title="Tickets for upcoming raffles">
            <div className="text-sm text-muted-foreground py-6 text-center">
              <Ticket className="w-8 h-8 mx-auto mb-2 opacity-50" />
              No upcoming tickets. Once the lottery module is enabled, active tickets will be listed here.
            </div>
          </PageSection>
        </TabsContent>
      </Tabs>

      <PlayerEditDialog
        player={player as any}
        open={editOpen}
        onOpenChange={setEditOpen}
      />


      <BlacklistPlayerDialog
        open={blacklistOpen}
        onClose={() => setBlacklistOpen(false)}
        playerId={(player as any).id}
        playerName={fullName}
      />
    </PageShell>
  );
};

const Kpi = ({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) => (
  <div className="rounded-md border border-border bg-muted/30 px-2.5 py-2 min-w-0 overflow-hidden">
    <div className="text-[10px] uppercase tracking-wider text-muted-foreground whitespace-nowrap truncate">{label}</div>
    <div
      className={`mt-0.5 font-mono font-bold tabular-nums whitespace-nowrap leading-tight text-[clamp(11px,1.05vw,15px)] ${valueClass || "text-card-foreground"}`}
      title={value}
    >
      {value}
    </div>
  </div>
);

const Field = ({ label, value }: { label: string; value: string }) => (
  <div>
    <div className="text-[10px] uppercase tracking-wider">{label}</div>
    <div className="text-sm text-card-foreground">{value}</div>
  </div>
);

/* moved */

const NotesPanel = ({ playerId, notes, canPost }: { playerId: string; notes: any[]; canPost: boolean }) => {
  const [text, setText] = useState("");
  const create = useCreatePlayerNote();
  const submit = async () => {
    if (!text.trim()) return;
    await create.mutateAsync({ player_id: playerId, content: text });
    setText("");
  };
  return (
    <div className="space-y-3">
      {canPost && (
        <div className="space-y-2">
          <Textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Write a note about this player…"
            rows={2}
            className="text-sm resize-none"
          />
          <div className="flex justify-end">
            <Button size="sm" onClick={submit} disabled={!text.trim() || create.isPending}>
              Post Note
            </Button>
          </div>
        </div>
      )}
      {notes.length === 0 ? (
        <div className="text-sm text-muted-foreground">No notes yet.</div>
      ) : (
        <div className="space-y-2 max-h-[320px] overflow-y-auto">
          {notes.map((n: any) => (
            <div key={n.id} className="text-xs p-2 rounded bg-muted/40 border border-border border-l-2 border-l-primary">
              <div className="text-[9px] font-mono uppercase text-muted-foreground">{n.note_type || "info"}</div>
              <div className="text-card-foreground mt-0.5 whitespace-pre-wrap">{n.content}</div>
              <div className="text-[10px] text-muted-foreground mt-1">{fmtDateTime(n.created_at)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
export default PlayerProfile;
