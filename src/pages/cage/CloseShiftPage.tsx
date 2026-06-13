import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useActiveShift, useCloseShift } from "@/hooks/use-shift";
import { useTransactions, useExpenses, useGamingTables } from "@/hooks/use-casino-data";
import { useCageTransfers } from "@/hooks/use-cage-transfers";
import { useEffectiveBusinessDate } from "@/hooks/use-business-day-closure";
import { getBusinessDate } from "@/lib/business-day";
import { PageShell, PageSection } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Square, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import CloseShiftDialog from "@/components/cage/CloseShiftDialog";

/**
 * Close Shift route. Two-step in-page flow lives inside CloseShiftDialog
 * (entry → manager review → manager password). No modal: it renders inline
 * so cancel/back are real navigation, not a dialog dismissal.
 */
const CloseShiftPage = () => {
  const nav = useNavigate();
  const { data: shift, isLoading } = useActiveShift();
  const { data: tables = [] } = useGamingTables();
  const { data: serverDate } = useEffectiveBusinessDate();
  const businessDate = serverDate || getBusinessDate();
  const { data: transactions = [] } = useTransactions(businessDate);
  const { data: expenses = [] } = useExpenses(businessDate);
  const { data: cageTransfers = [] } = useCageTransfers(shift?.id);
  const closeShift = useCloseShift();

  useEffect(() => {
    if (!isLoading && !shift) nav("/cage", { replace: true });
  }, [isLoading, shift, nav]);

  const isInTx = (t: string) => t === "buy" || t === "in";
  const isOutTx = (t: string) => t === "cashout" || t === "out";

  const data = useMemo(() => {
    if (!shift) return null;
    const sTx = transactions.filter(t => t.shift_id === shift.id);
    const sEx = expenses.filter(e => e.shift_id === shift.id);
    const totalIns = sTx.filter(t => isInTx(t.type)).reduce((s, t) => s + Number(t.amount), 0);
    const totalOuts = sTx.filter(t => isOutTx(t.type)).reduce((s, t) => s + Number(t.amount), 0);
    const totalExpenses = sEx.reduce((s, e) => s + Number(e.amount), 0);
    const sumTransfers = (type: string) =>
      cageTransfers.filter(t => t.transfer_type === type).reduce((s, t) => s + Number(t.amount), 0);
    const addFloat = sumTransfers("add_float");
    const collection = sumTransfers("collection");
    const slotsOut = sumTransfers("slots_out");
    const slotsIn = sumTransfers("slots_in");
    const of = shift.opening_float as Record<string, unknown> | null;
    const totals = of?.totals as Record<string, number> | undefined;
    const openingFloat = totals?.total_tzs || 0;
    const openingChipsTzs = Number(totals?.chips_tzs || 0);
    const openingCash = Math.max(openingFloat - openingChipsTzs, 0);
    const cashResult = totalIns - totalOuts;
    return {
      cashResult, totalIns, totalOuts, totalExpenses,
      addFloat, collection, slotsOut, slotsIn,
      openingFloat, openingCash,
    };
  }, [shift, transactions, expenses, cageTransfers]);

  if (isLoading || !shift || !data) {
    return (
      <PageShell>
        <PageHeader icon={Square} title="Close Shift" subtitle="Loading…" />
      </PageShell>
    );
  }

  // Preflight: shift cannot be closed while any gaming table is still open.
  const openTables = (tables as any[]).filter(
    (t) => !t.is_archived && (t.closing_result === null || t.closing_result === undefined)
  );

  if (openTables.length > 0) {
    return (
      <PageShell>
        <PageHeader
          icon={Square}
          title="Close Shift"
          subtitle="Cannot close — tables still open"
        />
        <PageSection>
          <div className="flex flex-col items-start gap-4 p-2">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
              <div className="space-y-2">
                <p className="text-sm font-medium">
                  {openTables.length} table{openTables.length > 1 ? "s are" : " is"} still open. Close them first.
                </p>
                <ul className="text-sm text-muted-foreground list-disc pl-5">
                  {openTables.map((t: any) => (
                    <li key={t.id}>{t.name}</li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="default" onClick={() => nav("/tables/close")}>Go to Close Tables</Button>
              <Button variant="outline" onClick={() => nav("/cage")}>Back to Cage</Button>
            </div>
          </div>
        </PageSection>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader
        icon={Square}
        title="Close Shift"
        subtitle="Cashier enters the closing cash desk · Manager confirms with password"
      />
      <CloseShiftDialog
        open={true}
        onClose={() => nav("/cage")}
        shift={shift}
        cashResult={data.cashResult}
        totalBuyIns={data.totalIns}
        totalCashouts={data.totalOuts}
        totalExpenses={data.totalExpenses}
        floatAdded={data.addFloat}
        collectionTotal={data.collection}
        slotsIn={data.slotsIn}
        slotsOut={data.slotsOut}
        openingFloat={data.openingFloat}
        openingCash={data.openingCash}
        tables={tables}
        loading={closeShift.isPending}
        onConfirm={(d) => {
          closeShift.mutate({
            shift_id: shift.id,
            closing_count: d.closingCount,
            closing_cash: d.closingCash,
            notes: d.notes,
            cash_result: d.cashResult,
            miss_total: d.missTotal,
            shift_result: d.shiftResult,
            cashless_in_providers: d.cashlessInProviders,
            cashless_out_providers: d.cashlessOutProviders,
          }, { onSuccess: () => nav("/cage") });
        }}
      />
    </PageShell>
  );
};

export default CloseShiftPage;
