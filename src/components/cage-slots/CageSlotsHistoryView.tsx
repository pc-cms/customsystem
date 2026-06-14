import { Fragment, KeyboardEvent, useState } from "react";
import { ChevronDown, ChevronRight, Coins, Printer, Pencil } from "lucide-react";
import { PageShell, PageSection } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, DTHead, DTBody, DTRow, DTHeader, DTCell } from "@/components/ui/data-table";
import { MoneyCell } from "@/components/ui/money-cell";
import { useMoneyMode } from "@/components/ui/data-table-toolbar";
import { fmtDate, fmtDateTime } from "@/lib/format-date";
import { useCageSlotsHistory, useSlotsCashlessAggByShift, useSlotsClosingTotalsByShift } from "@/hooks/use-cage-slots";
import PrintSlotsShiftDialog from "./PrintSlotsShiftDialog";
import SlotsShiftReportBody from "./SlotsShiftReportBody";
import EditClosedCashlessDialog from "./EditClosedCashlessDialog";
import { useAuth } from "@/lib/auth-context";

const NORMALIZE_PROVIDER = (k: string): string | null => {
  const v = String(k || "").toLowerCase().replace(/[\s_-]+/g, "");
  if (v.includes("mpesa")) return "MPESA";
  if (v.includes("tigo") || v.includes("tpesa")) return "TIGO";
  if (v.includes("halo") || v.includes("hpesa")) return "HALOTEL";
  if (v.includes("airtel")) return "AIRTEL";
  return null;
};

const CageSlotsHistoryView = () => {
  const { data: shifts = [], isLoading } = useCageSlotsHistory(60);
  const shiftIds = shifts.map(s => s.id);
  const { data: cashlessAgg = {} } = useSlotsCashlessAggByShift(shiftIds);
  const { data: closingTotals = {} } = useSlotsClosingTotalsByShift(shiftIds);
  const [printShiftId, setPrintShiftId] = useState<string | null>(null);
  const [editCashlessShift, setEditCashlessShift] = useState<{ id: string; providers: Record<string, number> } | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [mode, MoneyToggle] = useMoneyMode("cage-slots-history");
  const { isManager } = useAuth();

  return (
    <PageShell>
      <PageHeader
        icon={Coins}
        title="Cage Slots · History"
        subtitle="Closed and reviewed slots shifts (read-only)"
        date
      />
      <PageSection
        title={`Recent shifts (${shifts.length})`}
        titleRight={<MoneyToggle />}
      >
        {isLoading && <p className="text-xs text-muted-foreground">Loading…</p>}
        <DataTable>
          <DTHead>
            <DTRow>
              <DTHeader type="date">Business Day</DTHeader>
              <DTHeader type="status">Status</DTHeader>
              <DTHeader type="date">Opened</DTHeader>
              <DTHeader type="date">Closed</DTHeader>
              <DTHeader type="money">System</DTHeader>
              <DTHeader type="money">Slots Result</DTHeader>
              <DTHeader type="money">Cash Desk</DTHeader>
              <DTHeader type="money">Cards Miss</DTHeader>
              <DTHeader type="money">Cashless IN</DTHeader>
              <DTHeader type="money">Cashless OUT</DTHeader>
              <DTHeader type="money">Cashless NET</DTHeader>
              <DTHeader type="money">Balance</DTHeader>
              <DTHeader type="actions" />
            </DTRow>
          </DTHead>
          <DTBody>
            {shifts.length === 0 && !isLoading && (
              <DTRow>
                <DTCell colSpan={13} className="text-center text-muted-foreground py-4">·</DTCell>
              </DTRow>
            )}
            {shifts.map(s => {
              const ct = closingTotals[s.id];
              const balance = Number(s.balance ?? ct?.shift_balance ?? 0);
              const cdr = Number(s.cash_desk_result ?? s.actual_cage_result ?? 0);
              const cMiss = Number(s.cards_miss || 0);
              const sysRes = Number(s.system_shift_result || 0);
              const slotsRes = Number(s.slots_result || 0);
              const providersFromShift: Record<string, { in: number; out: number }> = {};
              const addProv = (raw: Record<string, any> | null | undefined, dir: "in" | "out") => {
                if (!raw || typeof raw !== "object") return;
                Object.entries(raw).forEach(([k, v]) => {
                  const norm = NORMALIZE_PROVIDER(k);
                  if (!norm) return;
                  const pv = (providersFromShift[norm] ||= { in: 0, out: 0 });
                  pv[dir] += Number(v || 0);
                });
              };
              addProv((s as any).cashless_in_providers, "in");
              addProv((s as any).cashless_out_providers, "out");
              const shiftClIn = Object.values(providersFromShift).reduce((a, p) => a + p.in, 0);
              const shiftClOut = Object.values(providersFromShift).reduce((a, p) => a + p.out, 0);

              const txAgg = cashlessAgg[s.id];
              const txIn = txAgg?.in || 0;
              const txOut = txAgg?.out || 0;

              const clIn = txIn || shiftClIn || (ct?.cashless_in ?? 0);
              const clOut = txOut || shiftClOut || (ct?.cashless_out ?? 0);
              const clNet = clIn - clOut;
              const isExpanded = expandedId === s.id;
              const toggleExpanded = () => setExpandedId(isExpanded ? null : s.id);
              const onRowKeyDown = (event: KeyboardEvent<HTMLTableRowElement>) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  toggleExpanded();
                }
              };
              return (
                <Fragment key={s.id}>
                  <DTRow
                    className={`cursor-pointer ${isExpanded ? "bg-accent/20" : ""}`}
                    onClick={toggleExpanded}
                    onKeyDown={onRowKeyDown}
                    tabIndex={0}
                    role="button"
                    aria-expanded={isExpanded}
                  >
                    <DTCell type="date">
                      <span className="inline-flex items-center gap-1">
                        {isExpanded
                          ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                          : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
                        {fmtDate(s.business_date)}
                      </span>
                    </DTCell>
                    <DTCell type="status">
                      <Badge variant="outline" className="text-[10px] uppercase">{s.status.replace("_", " ")}</Badge>
                    </DTCell>
                    <DTCell type="date" className="text-muted-foreground">{fmtDateTime(s.opened_at)}</DTCell>
                    <DTCell type="date" className="text-muted-foreground">{s.closed_at ? fmtDateTime(s.closed_at) : "·"}</DTCell>
                    <DTCell type="money"><MoneyCell value={sysRes} mode={mode} /></DTCell>
                    <DTCell type="money"><MoneyCell value={slotsRes} mode={mode} signed /></DTCell>
                    <DTCell type="money"><MoneyCell value={cdr} mode={mode} signed /></DTCell>
                    <DTCell type="money"><MoneyCell value={cMiss} mode={mode} signed empty="·" /></DTCell>
                    <DTCell type="money"><MoneyCell value={clIn || null} mode={mode} signed empty="·" /></DTCell>
                    <DTCell type="money"><MoneyCell value={clOut ? -clOut : null} mode={mode} signed empty="·" /></DTCell>
                    <DTCell type="money"><MoneyCell value={clNet || null} mode={mode} signed empty="·" /></DTCell>
                    <DTCell type="money"><MoneyCell value={balance} mode={mode} signed /></DTCell>
                    <DTCell type="actions" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        {isManager && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditCashlessShift({
                              id: s.id,
                              providers: ((s as any).cashless_final_providers || {}) as Record<string, number>,
                            })}
                            className="gap-1 h-7"
                            title="Backfill per-provider cashless balance"
                          >
                            <Pencil className="w-3.5 h-3.5" /> Cashless
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" onClick={() => setPrintShiftId(s.id)} className="gap-1 h-7">
                          <Printer className="w-3.5 h-3.5" /> Print
                        </Button>
                      </div>
                    </DTCell>
                  </DTRow>
                  {isExpanded && (
                    <DTRow className="bg-muted/10">
                      <DTCell colSpan={13} className="p-3">
                        <SlotsShiftReportBody id={s.id} showHeader={false} compact />
                      </DTCell>
                    </DTRow>
                  )}
                </Fragment>
              );
            })}
          </DTBody>
        </DataTable>
      </PageSection>
      {printShiftId && (
        <PrintSlotsShiftDialog
          open
          shiftId={printShiftId}
          onClose={() => setPrintShiftId(null)}
        />
      )}
      {editCashlessShift && (
        <EditClosedCashlessDialog
          open
          shiftId={editCashlessShift.id}
          current={editCashlessShift.providers}
          onClose={() => setEditCashlessShift(null)}
        />
      )}
    </PageShell>
  );
};

export default CageSlotsHistoryView;
