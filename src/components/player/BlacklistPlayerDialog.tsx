import { useState } from "react";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Ban } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import ManagerOverrideDialog from "@/components/ManagerOverrideDialog";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onClose: () => void;
  playerId: string;
  playerName: string;
}

export const BlacklistPlayerDialog = ({ open, onClose, playerId, playerName }: Props) => {
  const qc = useQueryClient();
  const { user, roles } = useAuth();
  const [reason, setReason] = useState("");
  const [showOverride, setShowOverride] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const isManager = roles.includes("manager") || roles.includes("shift_manager") || roles.includes("super_admin");

  const handleConfirm = () => {
    if (!reason.trim()) return;
    if (isManager && user?.id) {
      void handleManagerVerified(user.id);
    } else {
      setShowOverride(true);
    }
  };

  const handleManagerVerified = async (managerId: string) => {
    setShowOverride(false);
    setSubmitting(true);
    try {
      const { error } = await supabase.rpc("manager_set_player_blacklist" as any, {
        _player_id: playerId,
        _manager_id: managerId,
        _status: "blacklist",
        _reason: reason.trim(),
      });
      if (error) throw error;
      toast.success(`${playerName} blacklisted`);
      qc.invalidateQueries({ queryKey: ["player", playerId] });
      qc.invalidateQueries({ queryKey: ["players"] });
      setReason("");
      onClose();
    } catch (e: any) {
      toast.error(e.message || "Failed to blacklist player");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <ResponsiveDialog
        open={open}
        onOpenChange={(o) => !o && onClose()}
        title={`Blacklist ${playerName}`}
        description="This restricts entry and financial activity for this player. A manager or floor manager password is required."
      >
        <div className="space-y-3">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Reason</div>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why is this player being blacklisted?"
            rows={4}
            autoFocus
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={handleConfirm}
              disabled={!reason.trim() || submitting}
            >
              <Ban className="w-4 h-4 mr-2" /> Blacklist Player
            </Button>
          </div>
        </div>
      </ResponsiveDialog>

      <ManagerOverrideDialog
        open={showOverride}
        onClose={() => setShowOverride(false)}
        onConfirm={handleManagerVerified}
        title="Manager Override Required"
        description={`Authenticate as manager or floor manager to blacklist ${playerName}.`}
        actionType="PLAYER_BLACKLIST_OVERRIDE"
        actionDetails={{ player_id: playerId, player_name: playerName, reason: reason.trim() }}
      />
    </>
  );
};

export default BlacklistPlayerDialog;
