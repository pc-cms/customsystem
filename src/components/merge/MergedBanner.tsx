import { Link } from "react-router-dom";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePlayerMergeHistory, useUndoMergePlayers } from "@/hooks/use-merge-players";
import { useAuth } from "@/lib/auth-context";
import { fmtDate } from "@/lib/format-date";

interface Props {
  playerId: string;
  mergedIntoId?: string | null;
}

const canManageMerge = (roles: string[]) =>
  roles.includes("super_admin") || roles.includes("manager") || roles.includes("shift_manager");

export const MergedBanner = ({ playerId, mergedIntoId }: Props) => {
  const { roles } = useAuth();
  const { data: history = [] } = usePlayerMergeHistory(playerId);
  const undo = useUndoMergePlayers();

  const isManager = canManageMerge(roles);

  // Case A: this player was merged into another → show link to survivor
  if (mergedIntoId) {
    const rec = history.find(h => h.loser_ids.includes(playerId) && !h.undone_at);
    return (
      <div className="rounded-lg border-2 border-amber-500/60 bg-amber-500/10 p-3 flex items-start gap-3 text-sm">
        <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
        <div className="flex-1">
          <div className="font-semibold">This profile was merged</div>
          <div className="text-muted-foreground">
            All activity now belongs to{" "}
            <Link className="underline font-medium" to={`/players/${mergedIntoId}`}>the surviving profile</Link>
            {rec && <> · merged {fmtDate(rec.performed_at)}</>}
          </div>
        </div>
        {rec && isManager && !rec.undone_at && (
          <Button size="sm" variant="outline" onClick={() => undo.mutate(rec.id)} disabled={undo.isPending}>
            <RotateCcw className="h-3.5 w-3.5 mr-1" /> Undo
          </Button>
        )}
      </div>
    );
  }

  // Case B: this player is a survivor of one or more merges
  const asSurvivor = history.filter(h => h.survivor_id === playerId && !h.undone_at);
  if (asSurvivor.length === 0) return null;

  const total = asSurvivor.reduce((n, h) => n + h.loser_ids.length, 0);
  const latest = asSurvivor[0];

  return (
    <div className="rounded-lg border bg-muted/40 p-3 flex items-start gap-3 text-sm">
      <div className="flex-1">
        <div className="font-semibold">Merged from {total} duplicate profile{total !== 1 ? "s" : ""}</div>
        <div className="text-xs text-muted-foreground">
          Last merge on {fmtDate(latest.performed_at)} — {latest.reason}
        </div>
      </div>
      {isManager && (
        <Button size="sm" variant="outline" onClick={() => undo.mutate(latest.id)} disabled={undo.isPending}>
          <RotateCcw className="h-3.5 w-3.5 mr-1" /> Undo last
        </Button>
      )}
    </div>
  );
};
