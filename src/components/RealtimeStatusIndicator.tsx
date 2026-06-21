import { useEffect, useState } from "react";
import { Radio, RadioTower, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getRealtimeState,
  subscribeRealtimeState,
  type RealtimeStatus,
} from "@/lib/realtime-status";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const fmtAge = (ts: number | null): string => {
  if (!ts) return "—";
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  return `${Math.round(s / 3600)}h ago`;
};

const cfg: Record<RealtimeStatus, { label: string; bg: string; text: string; dot: string }> = {
  connecting: { label: "Connecting", bg: "bg-amber-500/15", text: "text-amber-500", dot: "bg-amber-500" },
  connected:  { label: "Live",       bg: "bg-emerald-500/15", text: "text-emerald-500", dot: "bg-emerald-500" },
  error:      { label: "Error",      bg: "bg-destructive/15", text: "text-destructive", dot: "bg-destructive" },
  closed:     { label: "Offline",    bg: "bg-muted",         text: "text-muted-foreground", dot: "bg-muted-foreground" },
};

export const RealtimeStatusIndicator = () => {
  const [s, setS] = useState(getRealtimeState());
  const [, tick] = useState(0);

  useEffect(() => subscribeRealtimeState(setS), []);
  // re-render every 5s to refresh "Xs ago"
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 5000);
    return () => clearInterval(id);
  }, []);

  const c = cfg[s.status];
  const Icon = s.status === "error" ? AlertCircle : s.status === "connected" ? RadioTower : Radio;

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              "no-print inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-mono uppercase tracking-wider cursor-default",
              c.bg, c.text,
            )}
            role="status"
            aria-label={`Realtime ${c.label}`}
          >
            <span className={cn("w-1.5 h-1.5 rounded-full", c.dot, s.status === "connecting" && "animate-pulse")} />
            <Icon className="w-3 h-3" />
            <span>RT {c.label}</span>
            <span className="text-muted-foreground normal-case tracking-normal">· {fmtAge(s.lastEventAt)}</span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          <div>Realtime: <b>{c.label}</b></div>
          <div>Last event: {s.lastEventAt ? new Date(s.lastEventAt).toLocaleTimeString() : "—"}</div>
          {s.lastTable && <div className="text-muted-foreground">Table: {s.lastTable}</div>}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
