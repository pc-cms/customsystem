/**
 * Coarse player POS status pill for the waiter UI.
 * Never shows monetary amounts — only Allowed / Warning / Need Approval.
 * Detailed numbers stay on manager/finance surfaces.
 */
import { Badge } from "@/components/ui/badge";
import { Check, AlertTriangle, ShieldAlert } from "lucide-react";
import { usePosPlayerStatus } from "@/hooks/use-pos-player-status";
import { cn } from "@/lib/utils";

interface Props {
  playerId: string | null;
  casinoId: string | null;
  className?: string;
}

const CFG = {
  allowed:  { label: "Allowed",       cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30", Icon: Check },
  warning:  { label: "Warning",       cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",         Icon: AlertTriangle },
  approval: { label: "Need Approval", cls: "bg-cms-amount-negative/15 text-cms-amount-negative border-cms-amount-negative/30", Icon: ShieldAlert },
} as const;

export default function PlayerPosStatusBadge({ playerId, casinoId, className }: Props) {
  const { data: status } = usePosPlayerStatus(playerId, casinoId);
  if (!playerId) return null;
  const cfg = CFG[status ?? "allowed"];
  const Icon = cfg.Icon;
  return (
    <Badge variant="outline" className={cn("gap-1 font-medium", cfg.cls, className)}>
      <Icon className="h-3 w-3" />
      {cfg.label}
    </Badge>
  );
}
