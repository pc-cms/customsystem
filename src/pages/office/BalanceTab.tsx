/**
 * Office → Balance
 * Sverка кассы Office: Expected vs Actual vs Variance.
 * Formula: Starting Float + Live + Slots + Other Income ± Missed Chips − Expenses − Collections.
 */
import { useMemo, useState } from "react";
import { Scale, RotateCw } from "lucide-react";
import { PageShell, PageSection } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import FinanceCasinoSwitcher from "@/components/finances/FinanceCasinoSwitcher";
import { Button } from "@/components/ui/button";
import {
  DateRangePresets,
  type DatePreset,
  presetRange,
} from "@/components/ui/date-range-presets";
import { useSessionState } from "@/hooks/use-session-state";
import { useQueryClient } from "@tanstack/react-query";
import { useFinBalanceSnapshot, computeBalanceTotals } from "@/hooks/use-fin-balance";
import { WalletsCompactTable } from "@/components/office/WalletsCompactTable";
import { formatNumberSpaces } from "@/lib/currency";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import { CloseMonthWizard } from "./CloseMonthWizard";

/** Lifetime default = from the earliest starting_float_date up to today. */
const lifetimeRange = () => {
  const now = new Date();
  return { from: "2000-01-01", to: now.toISOString().slice(0, 10) };
};

export default function BalanceTab() {
  const { roles } = useAuth();
  const qc = useQueryClient();
  const isSuperAdmin = roles.includes("super_admin");

  const [preset, setPreset] = useSessionState<DatePreset | "lifetime">("balance.preset", "lifetime" as any);
  const [range, setRange] = useSessionState<{ from: string; to: string }>(
    "balance.range",
    lifetimeRange(),
  );
  const [closeOpen, setCloseOpen] = useState(false);

  const { data: snap, isFetching } = useFinBalanceSnapshot(range.from, range.to);
  const totals = useMemo(() => computeBalanceTotals(snap), [snap]);

  const varianceTone =
    Math.abs(totals.variance) < 1
      ? "neutral"
      : totals.variance > 0
        ? "positive"
        : "negative";

  const reconcileNow = () => {
    qc.invalidateQueries({ queryKey: ["fin-balance-snapshot"] });
    qc.invalidateQueries({ queryKey: ["fin-wallet-tx"] });
  };

  return (
    <PageShell>
      <PageHeader
        icon={Scale}
        title="Balance"
        subtitle="Office cash-desk reconciliation · Expected vs Actual"
      >
        <FinanceCasinoSwitcher allowNetwork={false} />
        <div className="flex gap-1">
          <Button
            variant={preset === "lifetime" ? "default" : "outline"}
            size="sm"
            onClick={() => {
              setPreset("lifetime" as any);
              setRange(lifetimeRange());
            }}
          >
            Lifetime
          </Button>
          <DateRangePresets
            preset={preset === ("lifetime" as any) ? "month" : (preset as DatePreset)}
            from={range.from}
            to={range.to}
            onChange={({ preset, from, to }) => {
              setPreset(preset);
              setRange({ from, to });
            }}
          />
        </div>
        <Button variant="outline" size="sm" onClick={reconcileNow}>
          <RotateCw className={cn("w-4 h-4", isFetching && "animate-spin")} /> Reconcile Now
        </Button>
        {isSuperAdmin && (
          <Button variant="secondary" size="sm" onClick={() => setCloseOpen(true)}>
            Close Month
          </Button>
        )}
      </PageHeader>

      {/* Top 3 KPIs */}
      <PageSection card={false}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <BigKpi label="Expected" v={totals.expected} tone="neutral" />
          <BigKpi label="Actual" v={totals.actual} tone="neutral" />
          <BigKpi
            label="Variance"
            v={totals.variance}
            tone={varianceTone as any}
            signed
          />
        </div>
      </PageSection>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* BREAKDOWN */}
        <PageSection title="Breakdown (Expected)" card={false}>
          <div className="rounded-md border border-border bg-card">
            <BreakdownRow
              label="Starting Float"
              v={snap?.starting_float?.grand_tzs || 0}
              positive
            />
            <BreakdownRow label="Live Game" v={snap?.incomes?.live_game || 0} positive />
            <BreakdownRow label="Slots" v={snap?.incomes?.slots || 0} positive />
            <BreakdownRow label="Other Income" v={snap?.incomes?.other || 0} positive />
            <BreakdownRow
              label="Missed Chips (±)"
              v={snap?.incomes?.missed_chips || 0}
              signed
            />
            <BreakdownRow label="− Expenses" v={snap?.expenses_total || 0} negative />
            <BreakdownRow
              label="− Collections"
              v={snap?.collections_total || 0}
              negative
            />
            <div className="border-t-2 border-border">
              <BreakdownRow label="= Expected" v={totals.expected} bold />
            </div>
          </div>
          <div className="text-[10px] text-muted-foreground mt-1">
            USD→TZS rate {formatNumberSpaces(snap?.rates?.usd_tzs || 0)} · Period{" "}
            {range.from} → {range.to}
          </div>
        </PageSection>

        {/* WALLETS */}
        <PageSection title="Wallets (Physical vs Ledger)" card={false}>
          <WalletsCompactTable
            wallets={snap?.wallets || []}
            usdTzs={snap?.rates?.usd_tzs || 2500}
          />
        </PageSection>
      </div>

      {isSuperAdmin && (
        <CloseMonthWizard
          open={closeOpen}
          onOpenChange={setCloseOpen}
          wallets={snap?.wallets || []}
          usdTzs={snap?.rates?.usd_tzs || 2500}
        />
      )}
    </PageShell>
  );
}

/* ============= Sub-components ============= */

const TONE_BAR: Record<string, string> = {
  positive: "border-l-4 border-l-emerald-500",
  negative: "border-l-4 border-l-red-500",
  neutral: "border-l-4 border-l-muted-foreground/40",
};

function BigKpi({
  label,
  v,
  tone = "neutral",
  signed,
}: {
  label: string;
  v: number;
  tone?: "positive" | "negative" | "neutral";
  signed?: boolean;
}) {
  const color = signed
    ? v > 0
      ? "cms-amount-positive"
      : v < 0
        ? "cms-amount-negative"
        : ""
    : "";
  const sign = signed && v > 0 ? "+" : signed && v < 0 ? "−" : "";
  return (
    <div className={cn("rounded-md border border-border bg-card p-4", TONE_BAR[tone])}>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className={cn("font-mono tabular-nums text-2xl font-semibold mt-1", color)}>
        {sign}
        {formatNumberSpaces(Math.abs(v))}
      </div>
      <div className="text-[10px] text-muted-foreground mt-0.5">TZS (Grand)</div>
    </div>
  );
}

function BreakdownRow({
  label,
  v,
  positive,
  negative,
  bold,
  signed,
}: {
  label: string;
  v: number;
  positive?: boolean;
  negative?: boolean;
  bold?: boolean;
  signed?: boolean;
}) {
  const cls = positive
    ? "cms-amount-positive"
    : negative
      ? "cms-amount-negative"
      : signed
        ? v > 0
          ? "cms-amount-positive"
          : v < 0
            ? "cms-amount-negative"
            : "text-muted-foreground"
        : "";
  const sign = positive ? "+" : negative ? "−" : signed && v > 0 ? "+" : signed && v < 0 ? "−" : "";
  return (
    <div className="flex items-center justify-between px-3 py-1.5 border-b border-border last:border-b-0 text-xs">
      <span className={cn("uppercase tracking-wider text-muted-foreground", bold && "text-foreground font-semibold")}>
        {label}
      </span>
      <span className={cn("font-mono tabular-nums", cls, bold && "font-semibold text-sm")}>
        {sign}
        {formatNumberSpaces(Math.abs(v))}
      </span>
    </div>
  );
}
