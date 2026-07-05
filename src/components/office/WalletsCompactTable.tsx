/**
 * WalletsCompactTable — Cash Desk-style compact rows: Type · Wallet · Physical · Ledger · Diff.
 * Used on Balance page.
 */
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { formatNumberSpaces } from "@/lib/currency";
import { cn } from "@/lib/utils";
import type { WalletBalanceRow } from "@/hooks/use-fin-balance";

const KIND_ORDER: Record<string, number> = { cash: 0, safe: 1, cage: 2, bank: 3, external: 4 };

export function WalletsCompactTable({
  wallets,
  usdTzs,
}: {
  wallets: WalletBalanceRow[];
  usdTzs: number;
}) {
  const sorted = [...wallets].sort((a, b) => {
    const ka = KIND_ORDER[a.kind] ?? 9;
    const kb = KIND_ORDER[b.kind] ?? 9;
    if (ka !== kb) return ka - kb;
    return a.name.localeCompare(b.name);
  });

  let grandTzs = 0;
  sorted.forEach((w) => {
    const v = Number(w.physical ?? w.ledger ?? 0);
    grandTzs += w.currency === "USD" ? v * usdTzs : v;
  });

  return (
    <div className="rounded-md border border-border overflow-hidden bg-card">
      <table className="w-full text-xs">
        <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
          <tr className="[&>th]:px-2 [&>th]:py-1.5 [&>th]:font-medium">
            <th className="text-left w-14">Type</th>
            <th className="text-left">Wallet</th>
            <th className="text-right">Physical</th>
            <th className="text-right">Ledger</th>
            <th className="text-center w-8">•</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((w) => {
            const phys = w.physical == null ? null : Number(w.physical);
            const ledger = Number(w.ledger || 0);
            const diff = phys == null ? 0 : phys - ledger;
            const ok = phys == null || Math.abs(diff) < 1;
            return (
              <tr key={w.wallet_id} className="border-t border-border hover:bg-muted/30 [&>td]:px-2 [&>td]:py-1">
                <td className="text-[10px] uppercase text-muted-foreground">{w.kind}</td>
                <td className="font-medium">
                  {w.name} <span className="text-[10px] text-muted-foreground">{w.currency}</span>
                </td>
                <td className={cn("text-right font-mono tabular-nums", phys == null && "text-muted-foreground/60")}>
                  {phys == null ? "·" : formatNumberSpaces(phys)}
                </td>
                <td className="text-right font-mono tabular-nums text-muted-foreground">
                  {formatNumberSpaces(ledger)}
                </td>
                <td className="text-center">
                  {phys == null ? (
                    <span className="text-muted-foreground/60">·</span>
                  ) : ok ? (
                    <CheckCircle2 className="w-3.5 h-3.5 inline cms-amount-positive" />
                  ) : (
                    <AlertTriangle className="w-3.5 h-3.5 inline text-amber-500" />
                  )}
                </td>
              </tr>
            );
          })}
          {!sorted.length && (
            <tr>
              <td colSpan={5} className="text-center text-muted-foreground py-4">
                No wallets
              </td>
            </tr>
          )}
        </tbody>
        <tfoot className="border-t-2 border-border bg-muted/30">
          <tr className="[&>td]:px-2 [&>td]:py-1.5">
            <td colSpan={2} className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Grand TZS
            </td>
            <td colSpan={2} className="text-right font-mono tabular-nums font-semibold">
              {formatNumberSpaces(grandTzs)}
            </td>
            <td></td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
