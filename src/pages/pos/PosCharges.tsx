/**
 * /pos/charges — outstanding charges placed against player accounts at POS close.
 * Cashier/manager/finance/super_admin may mark a charge as settled (e.g. paid in cash at cage).
 */
import { useState } from "react";
import { useSessionState } from "@/hooks/use-session-state";
import { ReceiptText, Check, X } from "lucide-react";
import { PageShell, PageSection } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ResponsiveDialog, ResponsiveDialogFooter } from "@/components/ui/responsive-dialog";
import { useCasino } from "@/lib/casino-context";
import {
  usePlayerCharges,
  useSettlePlayerCharge,
  useVoidPlayerCharge,
  type PlayerChargeRow,
} from "@/hooks/use-pos-player-charges";
import { formatNumberSpaces } from "@/lib/currency";
import { fmtDateOnly } from "@/lib/format-date";
import { toast } from "@/hooks/use-toast";

type FilterStatus = "open" | "settled" | "voided" | "all";

export default function PosCharges() {
  const { activeCasinoId } = useCasino();
  const [status, setStatus] = useSessionState<FilterStatus>("status", "open");
  const { data: rows = [], isLoading } = usePlayerCharges(activeCasinoId, { status });
  const settleMut = useSettlePlayerCharge();
  const voidMut = useVoidPlayerCharge();

  const [settleRow, setSettleRow] = useState<PlayerChargeRow | null>(null);
  const [settleRef, setSettleRef] = useState("");
  const [voidRow, setVoidRow] = useState<PlayerChargeRow | null>(null);
  const [voidReason, setVoidReason] = useState("");

  const openSettle = (r: PlayerChargeRow) => { setSettleRow(r); setSettleRef(""); };
  const openVoid = (r: PlayerChargeRow) => { setVoidRow(r); setVoidReason(""); };

  const confirmSettle = async () => {
    if (!settleRow) return;
    try {
      await settleMut.mutateAsync({ id: settleRow.id, ref: settleRef.trim() || undefined });
      toast({ title: "Charge settled" });
      setSettleRow(null);
    } catch (e: any) {
      toast({ title: "Settle failed", description: e?.message, variant: "destructive" });
    }
  };
  const confirmVoid = async () => {
    if (!voidRow) return;
    if (voidReason.trim().length < 3) {
      toast({ title: "Reason required (min 3 chars)", variant: "destructive" });
      return;
    }
    try {
      await voidMut.mutateAsync({ id: voidRow.id, reason: voidReason.trim() });
      toast({ title: "Charge voided" });
      setVoidRow(null);
    } catch (e: any) {
      toast({ title: "Void failed", description: e?.message, variant: "destructive" });
    }
  };

  const outstandingTotal = rows
    .filter(r => r.status === "open")
    .reduce((s, r) => s + (Number(r.amount_tzs) || 0), 0);

  return (
    <PageShell>
      <PageHeader icon={ReceiptText} title="POS — Player Charges" subtitle="Postpaid F&B settled at cage">
        {(["open", "settled", "voided", "all"] as FilterStatus[]).map(s => (
          <Button key={s} size="sm" variant={status === s ? "default" : "outline"} onClick={() => setStatus(s)}>
            {s[0].toUpperCase() + s.slice(1)}
          </Button>
        ))}
      </PageHeader>

      <PageSection>
        {status === "open" && (
          <div className="cms-panel p-3 mb-3 flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">Outstanding total</span>
            <span className="font-mono text-2xl font-bold tabular-nums">
              {formatNumberSpaces(outstandingTotal)} <span className="text-sm">TZS</span>
            </span>
          </div>
        )}

        <div className="cms-panel">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr className="border-b border-border">
                <th className="text-left px-3 py-2 text-xs uppercase text-muted-foreground">Date</th>
                <th className="text-left px-3 py-2 text-xs uppercase text-muted-foreground">Player</th>
                <th className="text-right px-3 py-2 text-xs uppercase text-muted-foreground">Amount</th>
                <th className="text-left px-3 py-2 text-xs uppercase text-muted-foreground">Status</th>
                <th className="text-left px-3 py-2 text-xs uppercase text-muted-foreground">Ref / note</th>
                <th className="text-right px-3 py-2 text-xs uppercase text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">Loading…</td></tr>
              )}
              {!isLoading && rows.length === 0 && (
                <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">No charges</td></tr>
              )}
              {rows.map(r => (
                <tr key={r.id} className="border-b border-border/50 last:border-0">
                  <td className="px-3 py-2 font-mono">{fmtDateOnly(r.business_date)}</td>
                  <td className="px-3 py-2">{r.player_name ?? r.player_id.slice(0, 8)}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">{formatNumberSpaces(r.amount_tzs)}</td>
                  <td className="px-3 py-2">
                    {r.status === "open" && <Badge variant="outline">Open</Badge>}
                    {r.status === "settled" && <Badge>Settled</Badge>}
                    {r.status === "voided" && <Badge variant="destructive">Voided</Badge>}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground text-xs">
                    {r.status === "settled" ? (r.settlement_ref ?? "—") :
                     r.status === "voided" ? (r.void_reason ?? "—") : "·"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {r.status === "open" && (
                      <div className="inline-flex gap-1">
                        <Button size="sm" variant="default" onClick={() => openSettle(r)}>
                          <Check className="w-4 h-4 mr-1" /> Settle
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => openVoid(r)}>
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PageSection>

      <ResponsiveDialog
        open={!!settleRow}
        onOpenChange={(o) => { if (!o) setSettleRow(null); }}
        title="Settle charge"
      >
        <div className="space-y-3">
          <div className="rounded-md bg-muted/40 px-3 py-2 flex items-baseline justify-between">
            <span className="text-sm text-muted-foreground">{settleRow?.player_name ?? "Player"}</span>
            <span className="font-mono text-xl font-bold tabular-nums">
              {formatNumberSpaces(settleRow?.amount_tzs ?? 0)} TZS
            </span>
          </div>
          <div>
            <div className="text-xs uppercase text-muted-foreground mb-1">Settlement reference</div>
            <Input value={settleRef} onChange={(e) => setSettleRef(e.target.value)} placeholder="e.g. cage receipt #, cash, comp" />
          </div>
          <ResponsiveDialogFooter>
            <Button variant="outline" onClick={() => setSettleRow(null)}>Cancel</Button>
            <Button onClick={confirmSettle} disabled={settleMut.isPending}>
              {settleMut.isPending ? "Settling…" : "Mark settled"}
            </Button>
          </ResponsiveDialogFooter>
        </div>
      </ResponsiveDialog>

      <ResponsiveDialog
        open={!!voidRow}
        onOpenChange={(o) => { if (!o) setVoidRow(null); }}
        title="Void charge"
      >
        <div className="space-y-3">
          <div className="text-sm text-muted-foreground">
            Voiding {settleRow?.player_name ?? voidRow?.player_name ?? "this charge"} — amount{" "}
            <span className="font-mono font-bold">{formatNumberSpaces(voidRow?.amount_tzs ?? 0)} TZS</span>
          </div>
          <Input value={voidReason} onChange={(e) => setVoidReason(e.target.value)} placeholder="Reason (min 3 chars)" />
          <ResponsiveDialogFooter>
            <Button variant="outline" onClick={() => setVoidRow(null)}>Cancel</Button>
            <Button variant="destructive" onClick={confirmVoid} disabled={voidMut.isPending}>
              {voidMut.isPending ? "Voiding…" : "Void"}
            </Button>
          </ResponsiveDialogFooter>
        </div>
      </ResponsiveDialog>
    </PageShell>
  );
}
