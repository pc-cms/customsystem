/**
 * Dedicated print route for a freshly-closed live-game shift.
 *
 * Rendered at /cage/print/:shiftId as a FULL PAGE (no modal): the closing pack
 * preview plus Print / Close without printing. A page cannot be swallowed by a
 * re-render the way an overlay could when the shift stopped being active.
 */
import { useParams, useNavigate, Navigate } from "react-router-dom";
import ReprintShiftDialog from "@/components/cage/ReprintShiftDialog";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { clearPendingPrint } from "@/lib/pending-print";

const PrintShiftPage = () => {
  const { shiftId } = useParams<{ shiftId: string }>();
  const { casinoId } = useAuth();
  const nav = useNavigate();

  // Dead end guard: clear the pending mark so /cage does not bounce back here.
  if (!shiftId) {
    clearPendingPrint();
    return <Navigate to="/cage" replace />;
  }

  // casinoId can still be hydrating — keep the page mounted and wait, but
  // always offer a way back so the cashier is never stuck here.
  if (!casinoId) {
    return (
      <PageShell>
        <PageHeader icon={Printer} title="Print Shift Closing Pack" subtitle="Loading…" />
        <div className="flex justify-end">
          <Button
            variant="outline"
            onClick={() => { clearPendingPrint(); nav("/cage", { replace: true }); }}
          >
            Close shift
          </Button>
        </div>
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
