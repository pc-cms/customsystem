/**
 * Dedicated print route for a freshly-closed slots shift.
 *
 * Rendered at /cage-slots/print/:shiftId so the mandatory print dialog
 * survives the unmount of ActiveSlotsShiftView after the shift becomes
 * "closed". The same component is also used from Manager Review.
 */
import { useParams, useNavigate } from "react-router-dom";
import PrintSlotsShiftDialog from "@/components/cage-slots/PrintSlotsShiftDialog";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Printer } from "lucide-react";

const PrintSlotsShiftPage = () => {
  const { shiftId } = useParams<{ shiftId: string }>();
  const nav = useNavigate();

  if (!shiftId) {
    return (
      <PageShell>
        <PageHeader icon={Printer} title="Print" subtitle="Shift ID is missing" />
      </PageShell>
    );
  }

  return (
    <PrintSlotsShiftDialog
      open
      mandatory
      shiftId={shiftId}
      onClose={() => nav("/cage-slots", { replace: true })}
    />
  );
};

export default PrintSlotsShiftPage;
