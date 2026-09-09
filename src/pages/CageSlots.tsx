import { Coins } from "lucide-react";
import { Navigate, useSearchParams } from "react-router-dom";
import { getPendingPrint } from "@/lib/pending-print";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { CardSkeleton } from "@/components/LoadingSkeletons";
import { useActiveCageSlotsShift } from "@/hooks/use-cage-slots";
import { useAuth } from "@/lib/auth-context";
import { useReadOnlyMode } from "@/hooks/use-readonly-mode";
import OpenSlotsShiftScreen from "@/components/cage-slots/OpenSlotsShiftScreen";
import ActiveSlotsShiftView from "@/components/cage-slots/ActiveSlotsShiftView";
import CageSlotsHistoryView from "@/components/cage-slots/CageSlotsHistoryView";

const CageSlots = () => {
  const isReadOnly = useReadOnlyMode();
  const { roles, managerOverride } = useAuth();
  const [params] = useSearchParams();
  const canTransact =
    roles.includes("cashier_slots") ||
    roles.includes("super_admin") ||
    managerOverride.active;

  const { data: shift, isLoading } = useActiveCageSlotsShift();

  // Safety net: a slots shift was closed but the mandatory print pack never
  // opened (lost navigation, reload). Send the user back to the print route.
  const pendingPrint = getPendingPrint("slots");
  if (pendingPrint && params.get("view") !== "history") {
    return <Navigate to={`/cage-slots/print/${pendingPrint.shiftId}`} replace />;
  }

  // Explicit history view via ?view=history — available to anyone with access to this page
  if (params.get("view") === "history") return <CageSlotsHistoryView />;

  if (isReadOnly || !canTransact) return <CageSlotsHistoryView />;

  if (isLoading) {
    return (
      <PageShell>
        <PageHeader icon={Coins} title="Cage Slots" subtitle="Loading shift…" date />
        <CardSkeleton count={3} />
      </PageShell>
    );
  }

  if (!shift) return <OpenSlotsShiftScreen />;
  return <ActiveSlotsShiftView shift={shift} />;
};

export default CageSlots;
