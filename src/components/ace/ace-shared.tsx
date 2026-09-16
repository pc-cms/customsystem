/**
 * Shared primitives for the ACE Analytics workspace.
 *
 * Canon (do NOT mix with table-game formulas):
 *   Slot Drop   = EGM IN (drop_amount)
 *   Handle      = verified ACE total_in only; missing => N/A, never derived
 *   Slot Result = IN - OUT (casino perspective)
 *   Avg Bet     = Handle / Games, only when both are present
 *   Jackpot Paid is informational and already inside OUT.
 */
import * as React from "react";
import { formatMoneyFull } from "@/lib/format-money";
import { cn } from "@/lib/utils";

export type AceMode = "live" | "closed";

export interface AceScope {
  casinoId: string | null;
  from: string;
  to: string;
  mode: AceMode;
}

export const NA = <span className="text-muted-foreground">N/A</span>;
export const DASH = <span className="text-muted-foreground">—</span>;

export const money = (v: number | null | undefined): React.ReactNode =>
  v === null || v === undefined ? NA : formatMoneyFull(Number(v));

export const signedMoney = (v: number | null | undefined): React.ReactNode => {
  if (v === null || v === undefined) return NA;
  const n = Number(v);
  return (
    <span className={n >= 0 ? "cms-amount-positive" : "cms-amount-negative"}>
      {formatMoneyFull(n)}
    </span>
  );
};

export const intOrNa = (v: number | null | undefined): React.ReactNode =>
  v === null || v === undefined ? NA : Number(v).toLocaleString("en-US").replace(/,/g, " ");

/** Avg Bet = Handle / Games, only when both are present. Never derived otherwise. */
export const avgBet = (
  handle: number | null | undefined,
  games: number | null | undefined,
): number | null =>
  handle === null || handle === undefined || !games ? null : Number(handle) / Number(games);

/** Sum that keeps null when nothing was reported (explicit 0 stays 0). */
export const sumOrNull = (values: (number | null | undefined)[]): number | null => {
  const present = values.filter((v) => v !== null && v !== undefined) as number[];
  return present.length ? present.reduce((a, b) => a + Number(b), 0) : null;
};

export const AceEmpty = ({ what }: { what: string }) => (
  <div className="py-10 text-center text-sm text-muted-foreground">
    No {what} for the selected branch and period.
  </div>
);

export const Kpi = ({
  label,
  value,
  hint,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  className?: string;
}) => (
  <div className={cn("rounded-md border border-border bg-card p-3", className)}>
    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
    <div className="mt-0.5 font-mono text-lg font-semibold tabular-nums">{value}</div>
    {hint && <div className="mt-0.5 text-[10px] text-muted-foreground">{hint}</div>}
  </div>
);
