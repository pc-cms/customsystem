/**
 * POS manager PIN prompt. The PIN is sent to a server RPC which verifies it;
 * the client never decides whether approval is valid.
 */
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ResponsiveDialog, ResponsiveDialogFooter } from "@/components/ui/responsive-dialog";
import { toast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: React.ReactNode;
  askReason?: boolean;
  confirmLabel?: string;
  onConfirm: (pin: string, reason: string) => Promise<void>;
}

export const ManagerPinDialog = ({ open, onOpenChange, title, description, askReason, confirmLabel = "Approve", onConfirm }: Props) => {
  const [pin, setPin] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (open) { setPin(""); setReason(""); } }, [open]);

  const submit = async () => {
    if (pin.length < 4) return;
    if (askReason && !reason.trim()) {
      toast({ title: "Reason required", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      await onConfirm(pin, reason.trim());
    } catch (e: any) {
      toast({ title: "Not approved", description: e?.message, variant: "destructive" });
    } finally {
      setBusy(false);
      setPin("");
    }
  };

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} title={title} size="md">
      <div className="space-y-3">
        {description}
        {askReason && (
          <Input placeholder="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />
        )}
        <Input
          type="password"
          inputMode="numeric"
          autoComplete="off"
          placeholder="POS manager PIN"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
          onKeyDown={(e) => { if (e.key === "Enter") void submit(); }}
          className="text-center text-2xl tracking-[0.5em] font-mono h-14"
        />
        <ResponsiveDialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={busy || pin.length < 4}>{busy ? "Checking…" : confirmLabel}</Button>
        </ResponsiveDialogFooter>
      </div>
    </ResponsiveDialog>
  );
};

export default ManagerPinDialog;
