import { useMemo, useState } from "react";
import { Receipt, LayoutDashboard, Users } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CardSkeleton, PlayerListSkeleton } from "@/components/LoadingSkeletons";
import { usePlayers, useTransactions, useGamingTables } from "@/hooks/use-casino-data";
import { useDashboardTableResults } from "@/hooks/use-dashboard-table-results";
import { useAuth } from "@/lib/auth-context";
import { Link, Navigate } from "react-router-dom";
import { formatCurrency } from "@/lib/currency";
import { canSeePlayerFinancials } from "@/lib/role-access";
import { getBusinessDate } from "@/lib/business-day";
import { useEffectiveBusinessDate } from "@/hooks/use-business-day-closure";
import { useTotalDrop } from "@/lib/drop-source";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { CCTVDashboardSection } from "@/components/dashboard/CCTVDashboardSection";
import { useCasino } from "@/lib/casino-context";
import { useAceLiveSlotsResult } from "@/hooks/use-ace-finance";

/** Compact KPI tile for the top row (Expenses / Headcount / Total). */
const StatTile = ({
  label,
  value,
  hint,
  icon: Icon,
  href,
  signed,
  emphasis,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  icon?: any;
  href?: string;
  signed?: number;
  emphasis?: boolean;
}) => {
  const colorCls =
    signed === undefined ? "" : signed < 0 ? "cms-amount-negative" : signed > 0 ? "cms-amount-positive" : "";
  const body = (
    <div
      className={`rounded-md border bg-card px-4 py-3 h-full flex flex-col justify-between gap-2 ${
        emphasis ? "border-primary/40 bg-primary/5" : "border-border"
      }`}
    >
      <span className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-bold">
        {Icon && <Icon className="w-3.5 h-3.5 text-primary shrink-0" />}
        <span className="truncate">{label}</span>
      </span>
      <span
        className={`font-mono font-extrabold tabular-nums whitespace-nowrap ${
          emphasis ? "text-3xl" : "text-3xl"
        } ${colorCls || "text-foreground"}`}
      >
        {value}
      </span>
      {hint && <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{hint}</span>}
    </div>
  );
  return href ? (
    <Link to={href} className="block hover:opacity-90 transition-opacity">
      {body}
    </Link>
  ) : (
    body
  );
};

/**
 * Single-panel summary strip — one bordered card, one row per metric.
 * Replaces multi-tile bento rows so values always stay on one line
 * and dashboards never show empty containers around tiny numbers.
 */
const SummaryPanel = ({
  title,
  rows,
  total,
}: {
  title?: string;
  rows: Array<{
    label: string;
    value: React.ReactNode;
    icon?: any;
    href?: string;
    signed?: number;  // value sign for color (>0 pos, <0 neg, 0 neutral)
  }>;
  total?: { label: string; value: React.ReactNode; signed?: number };
}) => (
  <section className="rounded-md border border-border bg-card mb-6">
    {title && (
      <header className="px-4 pt-3 pb-2 border-b border-border/60">
        <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-bold">{title}</p>
      </header>
    )}
    <div className="divide-y divide-border/40">
      {rows.map((r, i) => {
        const Icon = r.icon;
        const colorCls = r.signed === undefined
          ? ""
          : r.signed < 0 ? "cms-amount-negative" : r.signed > 0 ? "cms-amount-positive" : "";
        const content = (
          <div className="flex items-center justify-between gap-4 px-4 py-2.5">
            <span className="inline-flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground font-semibold min-w-0">
              {Icon && <Icon className="w-3.5 h-3.5 text-primary shrink-0" />}
              <span className="truncate">{r.label}</span>
            </span>
            <span className={`font-mono font-bold tabular-nums whitespace-nowrap text-xl ${colorCls}`}>
              {r.value}
            </span>
          </div>
        );
        return r.href ? (
          <Link key={i} to={r.href} className="block hover:bg-accent/40 transition-colors">{content}</Link>
        ) : (
          <div key={i}>{content}</div>
        );
      })}
      {total && (() => {
        const colorCls = total.signed === undefined
          ? ""
          : total.signed < 0 ? "cms-amount-negative" : total.signed > 0 ? "cms-amount-positive" : "";
        return (
          <div className="flex items-center justify-between gap-4 px-4 py-3 bg-primary/5 border-t-2 border-primary/40">
            <span className="text-sm uppercase tracking-[0.14em] text-foreground font-bold">{total.label}</span>
            <span className={`font-mono font-extrabold tabular-nums whitespace-nowrap text-2xl ${colorCls || "text-foreground"}`}>
              {total.value}
            </span>
          </div>
        );
      })()}
    </div>
  </section>
);

const Dashboard = () => {
  const { displayName, roles, casinoId } = useAuth();
  // Boss role lands on the TV overview instead of the operational dashboard.
  if (roles.includes("boss") && !roles.includes("super_admin")) {
    return <Navigate to="/boss-dashboard" replace />;
  }
  const { data: serverBusinessDate } = useEffectiveBusinessDate();
  const businessDate = serverBusinessDate || getBusinessDate();
  const { data: players = [], isLoading: loadingPlayers } = usePlayers();
  const { data: transactions = [], isLoading: loadingTx } = useTransactions(businessDate);
  const { data: tables = [] } = useGamingTables();
  // (live-game expenses fetched separately via pending count query below)
  const { data: tableResultMap = {} } = useDashboardTableResults(businessDate);

  const isInitialLoading = loadingPlayers && loadingTx;
  const showFinancials = canSeePlayerFinancials(roles);
  // Total Drop — single source of truth: `player_day_drop_cache` (same value
  // shown on Player Statistics). Per-table Drop is never displayed.
  const { data: totalDrop = 0 } = useTotalDrop({ casinoId, fromDate: businessDate });

  // Pending expenses across BOTH cages (Live Game + Slots) — drives the
  // Approvals tile for manager / shift_manager / finance_manager / super_admin.
  const { data: pendingExpensesAll = 0 } = useQuery({
    queryKey: ["expenses-approvals-count", casinoId],
    queryFn: async () => {
      if (!casinoId) return 0;
      const { count, error } = await supabase
        .from("expenses")
        .select("id", { count: "exact", head: true })
        .eq("casino_id", casinoId)
        .eq("approved", false);
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!casinoId,
    staleTime: 1000 * 20,
  });
  const pendingExpenses = pendingExpensesAll;
  const canApproveExpenses =
    roles.includes("manager") ||
    roles.includes("shift_manager") ||
    roles.includes("finance_manager") ||
    roles.includes("super_admin");
  // Headcount = total visits today (distinct player_id rows in casino_visits for the business date).
  const { data: headcountToday = 0 } = useQuery({
    queryKey: ["dashboard-headcount", casinoId, businessDate],
    queryFn: async () => {
      if (!casinoId) return 0;
      const { count, error } = await supabase
        .from("casino_visits")
        .select("id", { count: "exact", head: true })
        .eq("casino_id", casinoId)
        .eq("date", businessDate);
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!casinoId,
    staleTime: 1000 * 30,
  });
  // Active players = distinct players with at least one transaction today.
  const activePlayersToday = useMemo(() => {
    const s = new Set<string>();
    transactions.forEach((t: any) => { if (t.player_id) s.add(t.player_id); });
    return s.size;
  }, [transactions]);

  // Table RESULT = canonical per-shift RPC sum (same source as shifts.tables_result).
  const tableStats = useMemo(() => {
    const stats: Record<string, { result: number }> = {};
    tables.forEach(t => {
      stats[t.id] = { result: Number(tableResultMap[t.id] || 0) };
    });
    return stats;
  }, [tables, tableResultMap]);


  const gameTypeTotals = useMemo(() => {
    const totals: Record<string, { result: number; label: string }> = {};
    const gameLabels: Record<string, string> = {
      "American Roulette": "TOTAL ARs",
      "Poker": "TOTAL POKER",
      "Texas Holdem": "TOTAL POKER",
      "Omaha": "TOTAL POKER",
      "PLO": "TOTAL POKER",
      "Club Poker": "TOTAL POKER",
      "Blackjack": "TOTAL BJ",
    };
    tables.forEach(t => {
      const label = gameLabels[t.game] || `Total ${t.game}`;
      if (!totals[label]) totals[label] = { result: 0, label };
      const r = tableStats[t.id] || { result: 0 };
      totals[label].result += r.result;
    });
    return totals;
  }, [tables, tableStats]);

  const totalResult = Object.values(tableStats).reduce((s, r) => s + r.result, 0);

  // Top players of the business day: aggregate today's transactions per player.
  // Cut-off: Drop > 1 000 000 OR |Result| > 1 000 000; max 10 rows, sorted by Drop.
  const TOP_DROP_THRESHOLD = 1_000_000;
  const TOP_RESULT_THRESHOLD = 1_000_000;
  const topPlayersToday = useMemo(() => {
    const byId = new Map<string, { id: string; drop: number; cashout: number }>();
    for (const t of transactions as any[]) {
      if (!t.player_id) continue;
      const cur = byId.get(t.player_id) || { id: t.player_id, drop: 0, cashout: 0 };
      const amt = Number(t.amount) || 0;
      if (t.type === "buy" || t.type === "in") cur.drop += amt;
      else if (t.type === "cashout" || t.type === "out") cur.cashout += amt;
      byId.set(t.player_id, cur);
    }
    const nameById = new Map<string, string>();
    (players as any[]).forEach(p => {
      nameById.set(p.id, [p.first_name, p.last_name].filter(Boolean).join(" ") || p.nickname || "—");
    });
    return Array.from(byId.values())
      .map(r => ({ ...r, name: nameById.get(r.id) || "—", result: r.drop - r.cashout }))
      .filter(r => r.drop > TOP_DROP_THRESHOLD || Math.abs(r.result) > TOP_RESULT_THRESHOLD)
      .sort((a, b) => b.drop - a.drop)
      .slice(0, 10);
  }, [transactions, players]);


  if (isInitialLoading) {
    return (
      <PageShell>
        <PageHeader icon={LayoutDashboard} title="Dashboard" subtitle="Loading…" date />
        <CardSkeleton count={4} />
        <PlayerListSkeleton count={4} />
      </PageShell>
    );
  }

  const gameTypeCount = Object.keys(gameTypeTotals).length;

  return (
    <PageShell>
      <PageHeader
        icon={LayoutDashboard}
        title="Dashboard"
        subtitle={displayName ?? undefined}
        date
      />

      {(roles.includes("surveillance") || roles.includes("super_admin")) && (
        <CCTVDashboardSection />
      )}

      {/* Top KPI tiles + Slots / Live Table columns. */}
      {(() => {
        const isSurveillance = roles.includes("surveillance") && !roles.includes("manager") && !roles.includes("super_admin");
        if (!showFinancials) return null;

        const DOT = "·";
        const slotsResult = ace.fresh ? Number(ace.netWin ?? 0) : 0;
        const grandTotal = totalResult + slotsResult;
        const aceHint = ace.fresh
          ? `ACE Live · ${Math.max(0, Math.round((ace.ageMs ?? 0) / 60000))}m ago`
          : "No ACE data";

        const slotsRows = [
          {
            label: "Drop",
            value: ace.fresh ? formatCurrency(Number(ace.totalDrop ?? 0)) : DOT,
          },
          { label: "Active Credits", value: DOT },
        ];

        const tableRows = Object.entries(gameTypeTotals).map(([_, t]) => ({
          label: t.label,
          signed: t.result,
          href: "/tables",
          value: `${t.result >= 0 ? "+" : ""}${formatCurrency(t.result)}`,
        }));
        tableRows.push({
          label: "Total Drop",
          signed: undefined as unknown as number,
          href: "/tables",
          value: formatCurrency(totalDrop),
        });

        return (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              <StatTile
                label="Expenses"
                value={!isSurveillance && canApproveExpenses ? pendingExpenses : DOT}
                icon={Receipt}
                href={!isSurveillance && canApproveExpenses ? "/expenses" : undefined}
              />
              <StatTile
                label="Headcount"
                value={headcountToday}
                hint={`${activePlayersToday} active players`}
                icon={Users}
                href="/reception"
              />
              <StatTile
                label="Total · Live Table + Slots"
                value={`${grandTotal >= 0 ? "+" : ""}${formatCurrency(grandTotal)}`}
                signed={grandTotal}
                hint={ace.fresh ? "incl. ACE slots net win" : "slots not included (no ACE)"}
                emphasis
              />
            </div>

            <div className="grid lg:grid-cols-2 gap-4">
              <SummaryPanel
                title={`Slots · ${aceHint}`}
                rows={slotsRows}
                total={{
                  label: "Result",
                  signed: ace.fresh ? slotsResult : undefined,
                  value: ace.fresh
                    ? `${slotsResult >= 0 ? "+" : ""}${formatCurrency(slotsResult)}`
                    : DOT,
                }}
              />
              <SummaryPanel
                title="Live Table"
                rows={tableRows}
                total={{
                  label: "Result",
                  signed: totalResult,
                  value: `${totalResult >= 0 ? "+" : ""}${formatCurrency(totalResult)}`,
                }}
              />
            </div>
          </>
        );
      })()}


      {/* Top players today — Drop ≥ 1 000 000 or a non-zero result, max 10 rows. */}
      {showFinancials && (
        <div className="cms-panel flex flex-col">
          <div className="cms-header flex items-center justify-between gap-2 flex-wrap">
            <span>Top players today</span>
            <span className="text-xs font-mono text-muted-foreground">{topPlayersToday.length} players</span>
          </div>
          <div className="flex-1 overflow-y-auto">
            {topPlayersToday.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No significant players yet today</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card z-10">
                  <tr className="border-b border-border">
                    <th className="text-left px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">#</th>
                    <th className="text-left px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Player</th>
                    <th className="text-right px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Drop</th>
                    <th className="text-right px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Cashout</th>
                    <th className="text-right px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {topPlayersToday.map((p, i) => (
                    <tr key={p.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-1.5 font-mono text-xs text-muted-foreground">{i + 1}</td>
                      <td className="px-4 py-1.5 text-card-foreground font-medium">
                        <Link to={`/players/${p.id}`} className="hover:underline">{p.name}</Link>
                      </td>
                      <td className="px-4 py-1.5 text-right font-mono tabular-nums">{formatCurrency(p.drop)}</td>
                      <td className="px-4 py-1.5 text-right font-mono tabular-nums">{formatCurrency(p.cashout)}</td>
                      <td className={`px-4 py-1.5 text-right font-mono tabular-nums ${p.result > 0 ? "cms-amount-positive" : p.result < 0 ? "cms-amount-negative" : ""}`}>
                        {p.result >= 0 ? "+" : ""}{formatCurrency(p.result)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

    </PageShell>
  );
};

export default Dashboard;
