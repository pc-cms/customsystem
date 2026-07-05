/**
 * BalanceBanner — global variance banner shown on every Office tab.
 * Red = недостача (variance < 0), Green = излишек (variance > 0).
 * Click → Balance tab.
 */
import { useMemo } from "react";
import { AlertTriangle, TrendingUp } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { useFinBalanceSnapshot, computeBalanceTotals } from "@/hooks/use-fin-balance";
import { formatNumberSpaces } from "@/lib/currency";
import { cn } from "@/lib/utils";

export function BalanceBanner() {
  const [, setParams] = useSearchParams();

  // Lifetime scope: from 1970 to today. Cheap because RPC aggregates server-side.
  const to = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const from = "2000-01-01";

  const { data } = useFinBalanceSnapshot(from, to);
  const totals = computeBalanceTotals(data);

  if (!data || Math.abs(totals.variance) < 1) return null;

  const isDeficit = totals.variance < 0;
  const abs = Math.abs(totals.variance);

  return (
    <button
      type="button"
      onClick={() => setParams((p) => {
        const n = new URLSearchParams(p);
        n.set("tab", "balance");
        return n;
      }, { replace: true })}
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
      <span className="ml-auto text-[10px] opacity-70">Click for details →</span>
    </button>
  );
}
