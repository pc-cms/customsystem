/**
 * POS Manager — Problem & force-closed orders.
 * Read-only history with reason, waiter, status, and audit timestamps.
 */
import { useCasino } from "@/lib/casino-context";
import { usePosProblemOrders } from "@/hooks/use-pos-bar-orders";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { fmtDateTime } from "@/lib/format-date";
import { formatNumberSpaces } from "@/lib/currency";
import { AlertTriangle, XCircle } from "lucide-react";

export default function PosManagerProblemOrders() {
  const { activeCasinoId } = useCasino();
  const { data: rows = [], isLoading } = usePosProblemOrders(activeCasinoId);

  return (
    <div className="p-4 space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Problem & force-closed orders</h1>
        <p className="text-xs text-muted-foreground">
          All orders marked as problem or force-closed by a manager. Read-only audit trail.
        </p>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="text-sm text-muted-foreground">No problem orders.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {rows.map((o: any) => (
            <Card key={o.id} className="p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold truncate">
                    {o.tab?.player_name || o.tab?.walkin_label || "Walk-in"}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {fmtDateTime(o.created_at)}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <Badge variant="secondary">{o.status}</Badge>
                  <span className="font-mono tabular-nums text-sm">
                    {formatNumberSpaces(o.total_tzs)} TZS
                  </span>
                </div>
              </div>
              <ul className="mt-2 text-sm space-y-1">
                {(o.items ?? []).map((it: any) => (
                  <li key={it.id} className="flex justify-between">
                    <span className="truncate">{it.item_name}</span>
                    <span className="text-muted-foreground shrink-0">×{it.qty}</span>
                  </li>
                ))}
              </ul>
              {o.notes && (
                <div className="mt-2 text-xs italic text-muted-foreground bg-muted/40 rounded px-2 py-1">
                  📝 {o.notes}
                </div>
              )}
              {o.is_problem && (
                <div className="mt-2 text-xs text-cms-amount-negative bg-cms-amount-negative/10 rounded px-2 py-1 flex items-start gap-1">
                  <AlertTriangle className="h-3 w-3 mt-0.5" />
                  <div>
                    <div className="font-semibold">Problem</div>
                    <div>{o.problem_reason || "(no reason)"}</div>
                    {o.problem_marked_at && (
                      <div className="text-muted-foreground">{fmtDateTime(o.problem_marked_at)}</div>
                    )}
                  </div>
                </div>
              )}
              {o.force_closed_at && (
                <div className="mt-2 text-xs text-cms-amount-negative bg-cms-amount-negative/10 rounded px-2 py-1 flex items-start gap-1">
                  <XCircle className="h-3 w-3 mt-0.5" />
                  <div>
                    <div className="font-semibold">Force-closed</div>
                    <div>{o.force_close_reason || "(no reason)"}</div>
                    <div className="text-muted-foreground">{fmtDateTime(o.force_closed_at)}</div>
                  </div>
                </div>
              )}
              {o.auto_closed_at && (
                <div className="mt-2 text-[11px] text-muted-foreground">
                  Auto-closed by system at {fmtDateTime(o.auto_closed_at)}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
