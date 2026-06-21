/**
 * POS Bar Display — kanban (pending → preparing → ready) for the bartender.
 * Realtime; advance buttons move orders forward; 'ready' auto-closes to 'served'.
 * Manager ⋮ menu (when has pos_manager/manager role): Mark Problem, Force Close.
 * Force Close is hidden on `pending` orders — server trigger would reject anyway.
 */
import { useMemo, useState } from "react";
import { useCasino } from "@/lib/casino-context";
import {
  usePosBarOrders,
  useAdvancePosOrder,
  useMarkOrderProblem,
  useForceCloseOrder,
  type PosBarOrder,
} from "@/hooks/use-pos-bar-orders";
import { usePosLocations } from "@/hooks/use-pos-locations";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatNumberSpaces } from "@/lib/currency";
import { ChevronRight, Check, Clock, Flame, MoreVertical, AlertTriangle, User, MapPin } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import type { PosOrderStatus } from "@/hooks/use-pos-orders";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

const COLS: { key: PosOrderStatus; title: string; icon: typeof Clock; next?: "preparing" | "ready" | "served"; nextLabel?: string }[] = [
  { key: "pending",   title: "New",       icon: Clock, next: "preparing", nextLabel: "Accept" },
  { key: "preparing", title: "Preparing", icon: Flame, next: "ready",     nextLabel: "Ready" },
  { key: "ready",     title: "Ready",     icon: Check },
];

function ageMinutes(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
}

function tabLabel(o: PosBarOrder): string {
  return o.tab?.player_name || o.tab?.walkin_label || "Walk-in";
}

function OrderCard({
  order,
  onAdvance,
  isManager,
  onMarkProblem,
  onForceClose,
}: {
  order: PosBarOrder;
  onAdvance?: () => void;
  isManager: boolean;
  onMarkProblem: (o: PosBarOrder) => void;
  onForceClose: (o: PosBarOrder) => void;
}) {
  const age = ageMinutes(order.created_at);
  const urgent = age >= 10 && order.status !== "ready";
  const problem = order.is_problem;
  const waiterName = order.waiter?.display_name || "—";
  return (
    <Card
      className={`p-3 ${problem ? "border-cms-amount-negative bg-cms-amount-negative/5" : urgent ? "border-destructive" : ""}`}
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="font-semibold truncate">{tabLabel(order)}</div>
        <div className="flex items-center gap-1 shrink-0">
          <Badge variant={urgent ? "destructive" : "secondary"}>{age}m</Badge>
          {isManager && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onMarkProblem(order)}>
                  <AlertTriangle className="h-4 w-4 mr-2" /> Mark as problem
                </DropdownMenuItem>
                {order.status !== "pending" && (
                  <DropdownMenuItem onClick={() => onForceClose(order)} className="text-cms-amount-negative">
                    Force close
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
      <div className="text-xs text-muted-foreground flex items-center gap-1 mb-2">
        <User className="h-3 w-3" /> {waiterName}
      </div>
      {problem && order.problem_reason && (
        <div className="text-xs text-cms-amount-negative mb-2 px-2 py-1 rounded bg-cms-amount-negative/10">
          ⚠ {order.problem_reason}
        </div>
      )}
      <ul className="text-sm space-y-1 mb-2">
        {order.items.map((it) => (
          <li key={it.id} className="flex justify-between gap-2">
            <span className="truncate">{it.item_name}</span>
            <span className="text-muted-foreground shrink-0">×{it.qty}</span>
          </li>
        ))}
      </ul>
      {order.notes && (
        <div className="text-xs italic text-muted-foreground mb-2 px-2 py-1 rounded bg-muted/50">
          📝 {order.notes}
        </div>
      )}
      {onAdvance && (
        <Button size="sm" className="w-full" onClick={onAdvance}>
          {COLS.find((c) => c.key === order.status)?.nextLabel ?? "Next"}
          <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      )}
      {order.status === "ready" && (
        <div className="text-[11px] text-center text-muted-foreground">
          Auto-closing to Served…
        </div>
      )}
    </Card>
  );
}

export default function PosBar() {
  const { activeCasinoId } = useCasino();
  const { roles } = useAuth();
  const roleSet = roles as readonly string[];
  const isManager = roleSet.includes("pos_manager")
    || roleSet.includes("manager")
    || roleSet.includes("super_admin");


  const { data: orders = [], isLoading } = usePosBarOrders(activeCasinoId);
  const advance = useAdvancePosOrder();
  const markProblem = useMarkOrderProblem();
  const forceClose = useForceCloseOrder();

  const grouped = useMemo(() => {
    const m: Record<PosOrderStatus, PosBarOrder[]> = { pending: [], preparing: [], ready: [], served: [], void: [] };
    for (const o of orders) m[o.status]?.push(o);
    return m;
  }, [orders]);

  const handleAdvance = (o: PosBarOrder, to: "preparing" | "ready" | "served") => {
    advance.mutate(
      { order_id: o.id, to },
      {
        onSuccess: () => {
          if (to === "preparing") toast.success(`Accepted: ${tabLabel(o)}`);
          if (to === "ready") toast.success(`Ready → Served: ${tabLabel(o)}`);
        },
        onError: (e) => toast.error((e as Error).message),
      },
    );
  };

  const handleMarkProblem = (o: PosBarOrder) => {
    const reason = window.prompt(`Mark as problem — reason?\n(${tabLabel(o)})`, "");
    if (!reason || !reason.trim()) return;
    markProblem.mutate(
      { order_id: o.id, reason: reason.trim() },
      {
        onSuccess: () => toast.success("Marked as problem"),
        onError: (e) => toast.error((e as Error).message),
      },
    );
  };

  const handleForceClose = (o: PosBarOrder) => {
    if (o.status === "pending") {
      toast.error("Pending orders cannot be force-closed. Accept the order first, or void it.");
      return;
    }
    const reason = window.prompt(`Force close — reason?\n(${tabLabel(o)})`, "");
    if (!reason || !reason.trim()) return;
    forceClose.mutate(
      { order_id: o.id, current_status: o.status, reason: reason.trim() },
      {
        onSuccess: () => toast.success("Order force-closed"),
        onError: (e) => toast.error((e as Error).message),
      },
    );
  };

  return (
    <div className="p-4 h-full flex flex-col">
      <div className="flex items-baseline justify-between mb-3">
        <h1 className="text-xl font-semibold">Bar Display</h1>
        <span className="text-xs text-muted-foreground">
          {isLoading ? "Loading…" : `${orders.length} active`}
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 flex-1 min-h-0">
        {COLS.map((col) => {
          const Icon = col.icon;
          const items = grouped[col.key] ?? [];
          return (
            <div key={col.key} className="flex flex-col min-h-0 bg-muted/30 rounded-lg">
              <div className="flex items-center gap-2 px-3 py-2 border-b">
                <Icon className="h-4 w-4" />
                <span className="font-medium">{col.title}</span>
                <Badge variant="outline" className="ml-auto">{items.length}</Badge>
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {items.length === 0 ? (
                  <div className="text-center text-xs text-muted-foreground py-6">·</div>
                ) : (
                  items.map((o) => (
                    <OrderCard
                      key={o.id}
                      order={o}
                      onAdvance={col.next ? () => handleAdvance(o, col.next!) : undefined}
                      isManager={isManager}
                      onMarkProblem={handleMarkProblem}
                      onForceClose={handleForceClose}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
