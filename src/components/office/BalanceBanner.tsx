/**
 * BalanceBanner — global variance banner shown on every Office tab.
 *
 * The banner ALWAYS follows the accounting window selected in the Office
 * header (same source as Wallets / Expenses / Monthly). It must never derive
 * its own period from the system clock: on the 1st of a month that showed the
 * previous month's Variance as a full-float "deficit".
 *
 * Red = deficit (variance < 0), Green = surplus (variance > 0).
 * A window without any physical wallet count is NOT a deficit — Actual is
 * simply unknown, so a neutral hint is shown instead.
 */
import { useMemo } from "react";
import { AlertTriangle, TrendingUp, Info } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { useFinBalanceSnapshot, computeBalanceTotals } from "@/hooks/use-fin-balance";
import { useOfficePeriod } from "@/components/office/office-shell";
import { formatNumberSpaces } from "@/lib/currency";
import { cn } from "@/lib/utils";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function BalanceBanner() {
  const [params, setParams] = useSearchParams();
  const { period } = useOfficePeriod();

  /** Accounting window from the Office header — never from `new Date()`. */
  const { from, to, label } = useMemo(() => {
    if (period.mode === "custom" && period.from && period.to) {
      return { from: period.from, to: period.to, label: `${period.from} — ${period.to}` };
    }
    const pad = (n: number) => String(n).padStart(2, "0");
    const last = new Date(period.year, period.month, 0).getDate();
    return {
      from: `${period.year}-${pad(period.month)}-01`,
      to: `${period.year}-${pad(period.month)}-${pad(last)}`,
      label: `${MONTHS[period.month - 1]} ${period.year}`,
    };
  }, [period.mode, period.from, period.to, period.year, period.month]);

  const { data } = useFinBalanceSnapshot(from, to);
  const totals = computeBalanceTotals(data);

  const countedWallets = (data?.wallets || []).filter((w) => w.actual_tzs != null).length;
  const currentTab = params.get("tab") || "wallets";
  const alreadyOnWallets = currentTab === "wallets" || currentTab === "balance";

  const goToBreakdown = () => {
    if (alreadyOnWallets) {
      document.getElementById("wallets-breakdown")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    const n = new URLSearchParams(params);
    n.set("tab", "wallets");
    setParams(n, { replace: true });
  };

  if (!data) return null;

  /* No physical count inside the window → Actual is unknown, not a deficit. */
  if (countedWallets === 0) {
    return (
      <button
        type="button"
        onClick={goToBreakdown}
        title="Open breakdown"
        className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-xs border border-border bg-muted/40 hover:bg-muted/60 transition text-muted-foreground"
      >
        <Info className="w-4 h-4 shrink-0" />
        <span className="font-semibold uppercase tracking-wider">{label} not counted yet</span>
        <span>Enter physical counts to see Variance</span>
      </button>
    );
  }

  if (Math.abs(totals.variance) < 1) return null;

  const isDeficit = totals.variance < 0;
  const abs = Math.abs(totals.variance);

  return (
    <button
      type="button"
      onClick={goToBreakdown}
      title="Open breakdown"
      className={cn(
        "w-full flex items-center gap-2 px-3 py-2 rounded-md text-xs border transition",
        isDeficit
          ? "bg-red-500/10 border-red-500/40 hover:bg-red-500/15 text-red-600 dark:text-red-400"
          : "bg-emerald-500/10 border-emerald-500/40 hover:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
      )}
    >
      {isDeficit ? (
        <AlertTriangle className="w-4 h-4 shrink-0" />
      ) : (
        <TrendingUp className="w-4 h-4 shrink-0" />
      )}
      <span className="font-semibold uppercase tracking-wider">
        {isDeficit ? "Cash Deficit" : "Cash Surplus"}
      </span>
      <span className="font-mono tabular-nums">
        {isDeficit ? "−" : "+"}{formatNumberSpaces(abs)} TZS
      </span>
      <span className="opacity-70">· {label}</span>
    </button>
  );
}
