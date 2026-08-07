import { useMemo } from "react";
import { Wallet } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { signedWalletTxTzs } from "@/lib/wallet-tx-sign";
import { useCasino } from "@/lib/casino-context";
import { PageShell, PageSection } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import FinanceCasinoSwitcher from "@/components/finances/FinanceCasinoSwitcher";
import {
  useFinWalletTx, useFinWalletBalances, useFinWallets, useFinBudget, useFinCategories,
} from "@/hooks/use-fin";
import { BentoGrid, BentoTile, BentoKpi } from "@/components/ui/bento-grid";
import { formatNumberSpaces } from "@/lib/currency";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, Legend, LineChart, Line, AreaChart, Area,
} from "recharts";

const Money = ({ v }: { v: number }) => (
  <span className={`font-mono ${v < 0 ? "cms-amount-negative" : v > 0 ? "cms-amount-positive" : ""}`}>
    {formatNumberSpaces(v)}
  </span>
);

const monthBounds = () => {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
  return { from, to, year: now.getFullYear(), month: now.getMonth() + 1, daysInMonth: new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() };
};

const PIE_COLORS = [
  "hsl(var(--primary))", "hsl(var(--cms-shift-teal))", "hsl(var(--cms-shift-amber))",
  "hsl(var(--cms-shift-sky))", "hsl(var(--cms-shift-emerald))", "hsl(var(--cms-shift-purple))",
  "hsl(var(--cms-shift-red))", "hsl(var(--cms-shift-orange))",
];

export default function FinancesDashboardPage() {
  const { from, to, year, month, daysInMonth } = monthBounds();
  const { data: tx = [] } = useFinWalletTx({ from, to });
  const { data: balances } = useFinWalletBalances();
  const { data: wallets = [] } = useFinWallets();
  const { data: budget = [] } = useFinBudget(year, month);
  const { data: categories = [] } = useFinCategories();

  const stats = useMemo(() => {
    let income = 0, expense = 0;
    tx.forEach((r: any) => {
      const v = Number(r.amount_tzs || 0);
      if (r.kind === "income") income += v;
      // Expenses may be stored positive (new rows) or negative (legacy) —
      // the direction lives in `kind`, so always take the magnitude.
      if (r.kind === "expense" || r.kind === "reversal") expense += Math.abs(v);
    });
    return { income, expense, net: income - expense };
  }, [tx]);


  const totalBalance = useMemo(() => {
    if (!balances) return 0;
    let s = 0;
    balances.forEach((v) => { s += v; });
    return s;
  }, [balances]);

  // Daily series: income + expense per day of month
  const dailySeries = useMemo(() => {
    const buckets: Record<string, { day: string; income: number; expense: number }> = {};
    for (let d = 1; d <= daysInMonth; d++) {
      const k = String(d).padStart(2, "0");
      buckets[k] = { day: k, income: 0, expense: 0 };
    }
    tx.forEach((r: any) => {
      const d = String(r.business_date || "").slice(8, 10);
      const b = buckets[d];
      if (!b) return;
      const v = Number(r.amount_tzs || 0);
      if (r.kind === "income") b.income += v;
      if (r.kind === "expense" || r.kind === "reversal") b.expense += Math.abs(v);
    });
    return Object.values(buckets);
  }, [tx, daysInMonth]);

  // Expense by group (pie)
  const byGroup = useMemo(() => {
    const map = new Map<string, number>();
    tx.forEach((r: any) => {
      if (r.kind !== "expense" && r.kind !== "reversal") return;
      const grp = r.fin_categories?.group_name || "Other";
      map.set(grp, (map.get(grp) || 0) + Math.abs(Number(r.amount_tzs || 0)));
    });
    return Array.from(map.entries())
      .filter(([, v]) => v > 0)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [tx]);

  // Budget vs Actual per group
  const budgetVsActual = useMemo(() => {
    const plan = new Map<string, number>();
    (budget || []).forEach((r: any) => {
      const grp = r.fin_categories?.group_name || "Other";
      plan.set(grp, (plan.get(grp) || 0) + Number(r.planned_amount || 0));
    });
    const actual = new Map<string, number>();
    tx.forEach((r: any) => {
      if (r.kind !== "expense" && r.kind !== "reversal") return;
      const grp = r.fin_categories?.group_name || "Other";
      actual.set(grp, (actual.get(grp) || 0) + Math.abs(Number(r.amount_tzs || 0)));
    });
    const groups = new Set([...plan.keys(), ...actual.keys()]);
    return Array.from(groups).map((g) => ({
      group: g,
      Plan: Math.round(plan.get(g) || 0),
      Actual: Math.round(actual.get(g) || 0),
    })).sort((a, b) => b.Plan + b.Actual - (a.Plan + a.Actual));
  }, [budget, tx]);

  const plannedTotal = useMemo(
    () => (budget || []).reduce((s: number, r: any) => s + Number(r.planned_amount || 0), 0),
    [budget]
  );

  // 12-month P&L trend (year-to-date)
  const { activeCasinoId, isSummaryMode } = useCasino();
  const yearStart = new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10);
  const { data: yearTx = [] } = useQuery({
    queryKey: ["fin-dashboard-yearly", isSummaryMode ? "all" : activeCasinoId, yearStart],
    queryFn: async () => {
      let q = supabase
        .from("fin_wallet_tx")
        .select("business_date, amount_tzs, kind")
        .gte("business_date", yearStart);
      if (!isSummaryMode && activeCasinoId) q = q.eq("casino_id", activeCasinoId);
      const { data } = await q;
      return data || [];
    },
    enabled: isSummaryMode || !!activeCasinoId,
  });

  const yearlyPnl = useMemo(() => {
    const months: Record<string, { month: string; income: number; expense: number; net: number }> = {};
    for (let m = 0; m < 12; m++) {
      const k = String(m + 1).padStart(2, "0");
      months[k] = { month: k, income: 0, expense: 0, net: 0 };
    }
    yearTx.forEach((r: any) => {
      const mo = String(r.business_date || "").slice(5, 7);
      const b = months[mo];
      if (!b) return;
      const v = Number(r.amount_tzs || 0);
      if (r.kind === "income") b.income += v;
      if (r.kind === "expense" || r.kind === "reversal") b.expense += Math.abs(v);
    });
    Object.values(months).forEach((m) => { m.net = m.income - m.expense; });
    return Object.values(months);
  }, [yearTx]);

  // Wallet balance trend (cumulative by day, this month)
  const walletTrend = useMemo(() => {
    const sorted = [...tx].sort((a: any, b: any) => (a.business_date || "").localeCompare(b.business_date || ""));
    let cum = totalBalance - sorted.reduce((s: number, r: any) => s + signedWalletTxTzs(r), 0);
    const buckets: Record<string, { day: string; balance: number }> = {};
    for (let d = 1; d <= daysInMonth; d++) {
      const k = String(d).padStart(2, "0");
      buckets[k] = { day: k, balance: cum };
    }
    sorted.forEach((r: any) => {
      cum += signedWalletTxTzs(r);
      const d = String(r.business_date || "").slice(8, 10);
      if (buckets[d]) buckets[d].balance = cum;
    });
    // Forward-fill
    let last = 0;
    Object.keys(buckets).sort().forEach((k) => {
      if (buckets[k].balance === 0 && Number(k) > 1) buckets[k].balance = last;
      last = buckets[k].balance;
    });
    return Object.values(buckets);
  }, [tx, totalBalance, daysInMonth]);

  const byCcy = useMemo(() => {
    const m = new Map<string, number>();
    wallets.forEach((w: any) => {
      const v = Number(balances?.get(w.id) || 0);
      m.set(w.currency, (m.get(w.currency) || 0) + v);
    });
    const order = ["TZS", "USD", "EUR", "GBP", "KES"];
    return Array.from(m.entries()).sort(
      (a, b) => (order.indexOf(a[0]) === -1 ? 99 : order.indexOf(a[0])) - (order.indexOf(b[0]) === -1 ? 99 : order.indexOf(b[0]))
    );
  }, [wallets, balances]);

  return (
    <PageShell>
      <PageHeader icon={Wallet} title="Finances Dashboard" subtitle="Month-to-date overview" date>
        <FinanceCasinoSwitcher />
      </PageHeader>

      {/* KPI bento */}
      <BentoGrid className="mb-3">
        {[
          { k: "Month Income", v: stats.income },
          { k: "Month Expense", v: stats.expense },
          { k: "Net (Month)", v: stats.net },
          { k: "Total Balance", v: totalBalance },
        ].map((x) => (
          <BentoTile key={x.k} col={3} title={x.k}>
            <BentoKpi value={<Money v={x.v} />} />
          </BentoTile>
        ))}
      </BentoGrid>

      <PageSection title="P&L · last 12 months">
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={yearlyPnl}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => formatNumberSpaces(v / 1000) + "k"} />
              <Tooltip formatter={(v: any) => formatNumberSpaces(Number(v))} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="income" fill="hsl(var(--cms-amount-positive))" />
              <Bar dataKey="expense" fill="hsl(var(--cms-amount-negative))" />
              <Bar dataKey="net" fill="hsl(var(--primary))" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </PageSection>

      <div className="grid lg:grid-cols-2 gap-3">
        <PageSection title="Total Balance · daily trend">
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={walletTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => formatNumberSpaces(v / 1000) + "k"} />
                <Tooltip formatter={(v: any) => formatNumberSpaces(Number(v))} />
                <Area type="monotone" dataKey="balance" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.2)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </PageSection>

        <PageSection title="Income vs Expense · daily">
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dailySeries}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => formatNumberSpaces(v / 1000) + "k"} />
                <Tooltip formatter={(v: any) => formatNumberSpaces(Number(v))} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="income" stroke="hsl(var(--cms-amount-positive))" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="expense" stroke="hsl(var(--cms-amount-negative))" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </PageSection>
      </div>

      <div className="grid lg:grid-cols-2 gap-3">
        <PageSection title="Expense by group · MTD">
          <div className="h-56">
            {byGroup.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-muted-foreground">No expenses</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={byGroup} dataKey="value" nameKey="name" outerRadius={75} label={(e: any) => e.name}>
                    {byGroup.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: any) => formatNumberSpaces(Number(v))} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </PageSection>

        <PageSection title="Budget vs Actual · this month" titleRight={<span className="text-[10px] text-muted-foreground">Plan {formatNumberSpaces(plannedTotal)} · Actual {formatNumberSpaces(stats.expense)}</span>}>
          <div className="h-56">
            {budgetVsActual.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-muted-foreground">No budget data</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={budgetVsActual}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="group" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => formatNumberSpaces(v / 1000) + "k"} />
                  <Tooltip formatter={(v: any) => formatNumberSpaces(Number(v))} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="Plan" fill="hsl(var(--muted-foreground))" />
                  <Bar dataKey="Actual" fill="hsl(var(--primary))" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </PageSection>
      </div>

      <PageSection
        title="Balances"
        titleRight={<span className="text-[10px] text-muted-foreground">{wallets.length} wallets · {categories.length} categories</span>}
      >
        {/* Cash by currency strip */}
        {byCcy.length > 0 && (
          <div className="rounded-md border border-border bg-card grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 divide-x divide-y sm:divide-y-0 divide-border mb-3">
            {byCcy.map(([ccy, v]) => (
              <div key={ccy} className="px-3 py-2">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{ccy}</div>
                <div className="text-sm font-mono tabular-nums mt-0.5"><Money v={v} /></div>
              </div>
            ))}
          </div>
        )}
        {/* Wallets list */}
        {wallets.length ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-1">
            {wallets.map((w: any) => (
              <div key={w.id} className="flex items-center justify-between border-b border-border/60 py-1 text-[12px]">
                <span className="truncate pr-2">{w.name} <span className="text-muted-foreground">· {w.currency}</span></span>
                <Money v={Number(balances?.get(w.id) || 0)} />
              </div>
            ))}
          </div>
        ) : (
          <div className="text-xs text-muted-foreground text-center py-4">No wallets configured.</div>
        )}
      </PageSection>
    </PageShell>
  );
}
