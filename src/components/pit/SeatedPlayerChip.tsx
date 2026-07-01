import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { formatNumberSpaces } from "@/lib/currency";
import type { PlayerCategory } from "@/components/player/CategoryBadge";
import { X } from "lucide-react";

const CATEGORY_DOT: Record<PlayerCategory, string> = {
  casino: "bg-red-500",
  diamond: "bg-blue-500",
  platinum: "bg-purple-500",
  gold: "bg-yellow-500",
  normal: "bg-muted-foreground/40",
};

export interface SeatedPlayer {
  id: string;
  first_name: string;
  last_name: string;
  nickname?: string | null;
  photo_url?: string | null;
  category: PlayerCategory;
  avgBet: number;
  startedAt: Date | null;
  dropR: number;
  result: number;
}

interface Props {
  player: SeatedPlayer;
  draggable?: boolean;
  compact?: boolean;
  onClick?: () => void;
  onStop?: (playerId: string) => void;
}

const formatTime = (d: Date | null) => {
  if (!d) return "—";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

const initials = (p: SeatedPlayer) => {
  const f = p.first_name?.[0] ?? "";
  const l = p.last_name?.[0] ?? "";
  return `${f}${l}`.toUpperCase();
};

const SeatedPlayerChip = ({ player, draggable = false, compact = false, onClick, onStop }: Props) => {
  const onDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData("text/cms-player-id", player.id);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleStop = (e: { stopPropagation: () => void; preventDefault: () => void }) => {
    e.stopPropagation();
    e.preventDefault();
    onStop?.(player.id);
  };

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            role={onClick ? "button" : undefined}
            tabIndex={onClick ? 0 : undefined}
            draggable={draggable}
            onDragStart={draggable ? onDragStart : undefined}
            onClick={onClick}
            onKeyDown={onClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } } : undefined}
            className={cn(
              "group flex items-center gap-1.5 rounded-md border border-border bg-background/60 hover:bg-muted/70 transition-colors text-left",
              compact ? "px-1.5 py-0.5" : "px-2 py-1",
              draggable && "cursor-grab active:cursor-grabbing",
              onClick && "cursor-pointer"
            )}
          >
            <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", CATEGORY_DOT[player.category])} />
            <span className={cn("font-mono font-semibold text-card-foreground truncate", compact ? "text-[10px]" : "text-[11px]")}>
              {compact ? initials(player) : `${player.first_name} ${player.last_name[0] ?? ""}.`}
            </span>
            {player.avgBet > 0 && (
              <span className={cn("font-mono text-muted-foreground shrink-0", compact ? "text-[9px]" : "text-[10px]")}>
                {formatNumberSpaces(player.avgBet)}
              </span>
            )}
            {onStop && (
              <span
                role="button"
                tabIndex={0}
                aria-label="Stop session"
                title="Stop session"
                onClick={handleStop}
                onPointerDown={(e) => e.stopPropagation()}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") handleStop(e); }}
                className={cn(
                  "ml-auto inline-flex items-center justify-center rounded-sm shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer",
                  compact ? "w-3.5 h-3.5" : "w-4 h-4"
                )}
              >
                <X className={compact ? "w-2.5 h-2.5" : "w-3 h-3"} />
              </span>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          <div className="space-y-0.5">
            <p className="font-semibold">
              {player.first_name} {player.last_name}
              {player.nickname && <span className="text-muted-foreground"> "{player.nickname}"</span>}
            </p>
            <p className="font-mono text-[10px] text-muted-foreground">
              Avg bet: {formatNumberSpaces(player.avgBet)} · Since {formatTime(player.startedAt)}
            </p>
            {player.dropR > 0 && (
              <p className="font-mono text-[10px] text-muted-foreground">
                Drop: {formatNumberSpaces(player.dropR)}
              </p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default SeatedPlayerChip;
