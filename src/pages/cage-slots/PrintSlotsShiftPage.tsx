/**
 * Dedicated print route for a freshly-closed slots shift.
 *
 * Rendered at /cage-slots/print/:shiftId as a FULL PAGE (no modal): the closing
 * pack preview plus Print / Close without printing. Keeping it a page means the
 * pack cannot disappear when the shift stops being active.
 */
import { useParams, useNavigate, Navigate } from "react-router-dom";
import PrintSlotsShiftDialog from "@/components/cage-slots/PrintSlotsShiftDialog";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Printer } from "lucide-react";
import { clearPendingPrint } from "@/lib/pending-print";

const PrintSlotsShiftPage = () => {
  const { shiftId } = useParams<{ shiftId: string }>();
  const nav = useNavigate();

  // Dead end guard: clear the pending mark so /cage-slots does not bounce back.
  if (!shiftId) {
    clearPendingPrint();
    return <Navigate to="/cage-slots" replace />;
  }

  return (
    <PageShell>
      <PrintSlotsShiftDialog
        open
        mandatory
        asPage
        shiftId={shiftId}
        onClose={() => { clearPendingPrint(); nav("/cage-slots", { replace: true }); }}
      />
    </PageShell>
  );
};

export default PrintSlotsShiftPage;
