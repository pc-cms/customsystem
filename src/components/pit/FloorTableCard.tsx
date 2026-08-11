import { cn } from "@/lib/utils";
import SeatedPlayerChip, { type SeatedPlayer } from "./SeatedPlayerChip";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Users, Lock } from "lucide-react";
import { useState } from "react";
import { formatNumberSpaces } from "@/lib/currency";

export interface FloorTable {
  id: string;
  name: string;
  game: string;
  status: "open" | "closed" | string;
  max_players?: number | null;
}

interface Props {
  table: FloorTable;
  players: SeatedPlayer[];
  onOpen: () => void;
  onPlayerDropped: (playerId: string) => void;
  onStopPlayer?: (playerId: string) => void;
  isTouch: boolean;
}

const PREVIEW_LIMIT = 4;

const FloorTableCard = ({ table, players, onOpen, onPlayerDropped, onStopPlayer, isTouch }: Props) => {
  const [dragOver, setDragOver] = useState(false);
  const isClosed = table.status === "closed";
  const count = players.length;
  const max = table.max_players || null;
  const preview = players.slice(0, PREVIEW_LIMIT);
  const overflow = Math.max(0, count - PREVIEW_LIMIT);

  const onDragOver = (e: React.DragEvent) => {
    if (isClosed) return;
    if (!e.dataTransfer.types.includes("text/cms-player-id")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (!dragOver) setDragOver(true);
  };
  const onDragLeave = () => setDragOver(false);
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (isClosed) return;
    const id = e.dataTransfer.getData("text/cms-player-id");
    if (id) onPlayerDropped(id);
  };

  const card = (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={cn(
        "cms-panel text-left w-full p-2 transition-all flex flex-col gap-1.5 min-h-[110px] cursor-pointer",
        "hover:border-primary/50 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary/40",
        isClosed && "opacity-50 hover:border-border hover:shadow-none cursor-not-allowed",
        dragOver && "border-primary ring-2 ring-primary/40 bg-primary/5"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className={cn("w-2 h-2 rounded-full shrink-0", isClosed ? "bg-destructive" : "bg-success")} />
          <span className="text-xs font-bold font-mono text-card-foreground truncate">{table.name}</span>
        </div>
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground shrink-0">
          {isClosed ? (
            <Lock className="w-3 h-3" />
          ) : (
            <>
              <Users className="w-3 h-3" />
              <span className="font-mono">{count}{max ? `/${max}` : ""}</span>
            </>
          )}
        </div>
      </div>
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{table.game}</div>

      <div className="flex flex-col gap-0.5 mt-auto">
        {preview.length === 0 ? (
          <span className="text-muted-foreground/40 text-[10px] font-mono">· · ·</span>
        ) : (
          preview.map(p => (
            <SeatedPlayerChip
              key={p.id}
              player={p}
              draggable={!isTouch && !isClosed}
              compact
              onStop={onStopPlayer}
            />
          ))
        )}
        {overflow > 0 && (
          <span className="text-[9px] font-mono text-muted-foreground pl-1">+{overflow} more</span>
        )}
      </div>
    </div>
  );

  if (count === 0) return card;

  return (
    <TooltipProvider delayDuration={400}>
      <Tooltip>
        <TooltipTrigger asChild>{card}</TooltipTrigger>
        <TooltipContent side="right" className="text-xs max-w-xs">
          <p className="font-semibold mb-1 font-mono">{table.name} · {count} player{count !== 1 ? "s" : ""}</p>
          <ul className="space-y-0.5">
            {players.map(p => (
              <li key={p.id} className="flex items-center justify-between gap-3 text-[10px]">
                <span>{p.first_name} {p.last_name}</span>
                <span className="font-mono text-muted-foreground">{p.avgBet > 0 ? formatNumberSpaces(p.avgBet) : "—"}</span>
              </li>
            ))}
          </ul>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default FloorTableCard;
