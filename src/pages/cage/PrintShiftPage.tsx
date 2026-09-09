/**
 * Dedicated print route for a freshly-closed live-game shift.
 *
 * Rendered at /cage/print/:shiftId so the mandatory print dialog survives the
 * unmount of CloseShiftPage once the shift is no longer active.
 */
import { useParams, useNavigate } from "react-router-dom";
import ReprintShiftDialog from "@/components/cage/ReprintShiftDialog";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Printer } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { clearPendingPrint } from "@/lib/pending-print";

const PrintShiftPage = () => {
  const { shiftId } = useParams<{ shiftId: string }>();
  const { casinoId } = useAuth();
  const nav = useNavigate();

  if (!shiftId || !casinoId) {
    return (
      <PageShell>
        <PageHeader icon={Printer} title="Print" subtitle="Shift ID is missing" />
      </PageShell>
    );
  }

  return (
    <ReprintShiftDialog
      open
      mandatory
      shiftId={shiftId}
      casinoId={casinoId}
      onClose={() => { clearPendingPrint(); nav("/cage", { replace: true }); }}
    />
  );
};

export default PrintShiftPage;
