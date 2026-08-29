import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PlayCircle, Clock, Pencil } from "lucide-react";
import { LIVE_START_OPTIONS, startLabel } from "@/lib/live-hours";
import { useLiveStart, useStartLive, useCorrectLiveStart } from "@/hooks/use-live-start";
import { useAuth } from "@/lib/auth-context";
import { fmtDate } from "@/lib/format-date";

/**
 * Single manager action that sets the LIVE START for the current casino/business day.
 * It does NOT open tables, cashdesk or create breaklist entries — it only defines
 * from which hour live operations are allowed and visible.
 */
export function LiveStartControl({ date }: { date?: string }) {
  const { isManager } = useAuth();
  const live = useLiveStart(date);
  const startLive = useStartLive();
  const correct = useCorrectLiveStart();

  const [openStart, setOpenStart] = useState(false);
  const [openCorrect, setOpenCorrect] = useState(false);
  const [time, setTime] = useState<string>(startLabel(live.effective));
  const [reason, setReason] = useState("");

  const canEdit = isManager;

  const openStartDialog = () => {
    setTime(startLabel(live.effective));
    setOpenStart(true);
  };
  const openCorrectDialog = () => {
    setTime(startLabel(live.effective));
    setReason("");
    setOpenCorrect(true);
  };

  return (
    <div className="no-print flex items-center gap-2">
      {live.started ? (
        <Badge variant="outline" className="gap-1 border-emerald-500/40 text-emerald-600 dark:text-emerald-400">
          <Clock className="h-3 w-3" />
          LIVE STARTED · {live.label}
        </Badge>
      ) : (
        <Badge variant="outline" className="gap-1 text-muted-foreground">
          <Clock className="h-3 w-3" />
          Default start · {live.label}
        </Badge>
      )}

      {canEdit && !live.started && (
        <Button size="sm" onClick={openStartDialog} className="h-8 gap-1">
          <PlayCircle className="h-4 w-4" />
          LIVE START
        </Button>
      )}
      {canEdit && live.started && (
        <Button size="sm" variant="outline" onClick={openCorrectDialog} className="h-8 gap-1">
          <Pencil className="h-3.5 w-3.5" />
          Change Live Start
        </Button>
      )}

      {/* START */}
      <Dialog open={openStart} onOpenChange={setOpenStart}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Start Live Operations</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-xs text-muted-foreground">Business day {fmtDate(live.businessDate)}</div>
            <div className="space-y-1">
              <div className="text-sm">Opening time</div>
              <Select value={time} onValueChange={setTime}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LIVE_START_OPTIONS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenStart(false)}>Cancel</Button>
            <Button
              disabled={startLive.isPending}
              onClick={() =>
                startLive.mutate(
                  { businessDate: live.businessDate, time },
                  { onSuccess: () => setOpenStart(false) },
                )
              }
            >
              START LIVE
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CORRECTION */}
      <Dialog open={openCorrect} onOpenChange={setOpenCorrect}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Change Live Start</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-xs text-muted-foreground">
              Business day {fmtDate(live.businessDate)} · current {live.label}
            </div>
            <div className="space-y-1">
              <div className="text-sm">New opening time</div>
              <Select value={time} onValueChange={setTime}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LIVE_START_OPTIONS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <div className="text-sm">Reason</div>
              <Textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} placeholder="Why is the start time changed?" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenCorrect(false)}>Cancel</Button>
            <Button
              disabled={correct.isPending || !reason.trim()}
              onClick={() =>
                correct.mutate(
                  { businessDate: live.businessDate, time, reason: reason.trim() },
                  { onSuccess: () => setOpenCorrect(false) },
                )
              }
            >
              SAVE CORRECTION
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default LiveStartControl;
