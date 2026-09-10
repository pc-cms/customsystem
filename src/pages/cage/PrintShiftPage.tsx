/**
 * Dedicated print route for a freshly-closed live-game shift.
 *
 * Rendered at /cage/print/:shiftId as a FULL PAGE (no modal): the closing pack
 * preview plus Print / Close without printing. A page cannot be swallowed by a
 * re-render the way an overlay could when the shift stopped being active.
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

  if (!shiftId) {
    return (
      <PageShell>
        <PageHeader icon={Printer} title="Print" subtitle="Shift ID is missing" />
      </PageShell>
    );
  }

  // casinoId can still be hydrating — keep the page mounted and wait.
  if (!casinoId) {
    return (
      <PageShell>
        <PageHeader icon={Printer} title="Print Shift Closing Pack" subtitle="Loading…" />
      </PageShell>
    );
  }

  return (
    <PageShell>
      <ReprintShiftDialog
        open
        mandatory
        asPage
        shiftId={shiftId}
        casinoId={casinoId}
        onClose={() => { clearPendingPrint(); nav("/cage", { replace: true }); }}
      />
    </PageShell>
  );
};

export default PrintShiftPage;
