/**
 * ChipsMovementReportV2 — "Style A — Clear Cards" printable Casino Chips
 * Movement report (page 3 of the new 4-page set).
 *
 * Same props as the legacy ChipMovementReport. Six per-denomination blocks are
 * rendered as one matrix so the page always fits A4 portrait.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatNumberSpaces } from "@/lib/currency";
import { useVisibleChipDenoms } from "@/hooks/use-chip-colors";
import { PRINT_REPORT_ACCENTS_CSS } from "@/lib/print-report-accents";
import type { Tables } from "@/integrations/supabase/types";
import {
  A4_CLASS, A4_STYLE, Card, PageFooter, ReportHeader, Signatures, buildReportId, num, signed,
} from "./report-v2/primitives";
import { useReportSnapshot } from "@/hooks/use-report-snapshot";
import { loadChipsMovementData, type ChipsReportFrozen } from "@/lib/report-snapshots";


export type ChipsMovementReportV2Props = {
  shift: Tables<"shifts">;
  openingChips: Record<number, number>;
  openingDiff?: Record<number, number>;
  closingChips: Record<number, number>;
  missPerDenom: Record<number, number>;
  businessDate: string;
  casinoName?: string;
  cashierName?: string;
  managerName?: string;
  reportStatus?: string;
  fillByDenomOverride?: Record<number, number>;
  creditByDenomOverride?: Record<number, number>;
};

/** Chips sheet is landscape and read from a distance — bigger type, tighter top. */
const CHIPS_SHEET_CSS = `
.rv2-chips .rv2-head { padding: 4px 8px 5px; }
.rv2-chips .rv2-card { margin-bottom: 6px; }
.rv2-chips .rv2-table th,
.rv2-chips .rv2-table td { font-size: 14px; padding: 5px 7px; }
.rv2-chips .rv2-table th { font-size: 12.5px; }
.rv2-chips .rv2-sumtable td { font-size: 14px; }
`;

/** Live fill/credit per denomination — used only while a shift is still open. */
const useLiveChipsMovement = (shiftId: string | null | undefined) => {
  const { data } = useQuery({
    queryKey: ["chips-movement-live", shiftId],
    enabled: !!shiftId,
    queryFn: () => loadChipsMovementData(shiftId as string),
  });
  return {
    fillByDenom: data?.fillByDenom || {},
    creditByDenom: data?.creditByDenom || {},
  };
};

const ChipsMovementReportV2 = ({
  shift, openingChips, openingDiff = {}, closingChips, missPerDenom,
  businessDate, casinoName = "Casino", cashierName, managerName,
  reportStatus = "DRAFT — GBT APPROVAL PENDING",
  fillByDenomOverride, creditByDenomOverride,
}: ChipsMovementReportV2Props) => {
  const liveDenoms = useVisibleChipDenoms();
  const signCashier = cashierName || (shift as any)?.cashier_name || undefined;
  const signManager = managerName || (shift as any)?.manager_name || undefined;

  // Closed shift -> frozen chips movement (denominations included, so the
  // matrix never changes shape on a later reprint).
  const isClosed = !!(shift as any)?.closed_at;
  const { payload: snapshot } = useReportSnapshot<ChipsReportFrozen>({
    casinoId: (shift as any)?.casino_id,
    reportType: "chips_movement",
    sourceKey: shift?.id,
    businessDate,
    asOf: (shift as any)?.closed_at ?? null,
    freeze: isClosed,
    enabled: isClosed,
    build: () => loadChipsMovementData(shift.id, liveDenoms),
  });

  const denoms = snapshot?.denoms?.length ? snapshot.denoms : liveDenoms;
  const fillByDenom = snapshot?.fillByDenom || {};
  const creditByDenom = snapshot?.creditByDenom || {};
  const liveChips = useLiveChipsMovement(snapshot ? null : shift?.id);

  const effFill = fillByDenomOverride ?? (snapshot ? fillByDenom : liveChips.fillByDenom);
  const effCredit = creditByDenomOverride ?? (snapshot ? creditByDenom : liveChips.creditByDenom);

  const value = (m: Record<number, number>) => denoms.reduce((s, d) => s + d * (m[d] || 0), 0);
  const totals = useMemo(() => ({
    opening: value(openingChips),
    diff: value(openingDiff),
    fill: value(effFill),
    credit: value(effCredit),
    miss: value(missPerDenom),
    closing: value(closingChips),
  }), [openingChips, openingDiff, effFill, effCredit, missPerDenom, closingChips, denoms]);


  const blocks: Array<{ label: string; map: Record<number, number>; total: number; sign?: boolean }> = [
    { label: "Opening", map: openingChips, total: totals.opening },
    { label: "Opening Chips Difference", map: openingDiff, total: totals.diff, sign: true },
    { label: "Float Fill", map: effFill, total: totals.fill },
    { label: "Float Credit", map: effCredit, total: totals.credit },
    { label: "Closing", map: closingChips, total: totals.closing },
    { label: "Chip Difference", map: missPerDenom, total: totals.miss, sign: true },
  ];

  return (
    <div
      className={`${A4_CLASS} rv2-page-land rv2-chips bg-white text-black p-2 flex flex-col`}
      style={{ ...A4_STYLE, width: "281mm", fontSize: "13px" }}
    >
      <style>{PRINT_REPORT_ACCENTS_CSS}</style>
      <style>{CHIPS_SHEET_CSS}</style>

      <ReportHeader
        title="Casino Chips Movement Report"
        reportId={buildReportId("CHM", businessDate, shift?.id)}
        status={reportStatus}
        businessDate={businessDate}
        cashier={signCashier}
        manager={signManager}
      />


      <Card title="Quantity per Denomination">
        <table className="rv2-table" style={{ tableLayout: "auto", width: "100%" }}>
          <thead>
            <tr>
              <th className="rv2-l">Block</th>
              {denoms.map(d => (
                <th key={d} className="rv2-r">{formatNumberSpaces(d)}</th>
              ))}
              <th className="rv2-r" style={{ width: "12%" }}>Value TZS</th>
            </tr>
          </thead>
          <tbody>
            {blocks.map(b => (
              <tr key={b.label}>
                <td className="rv2-l rv2-sum-label">{b.label}</td>
                {denoms.map(d => {
                  const q = Number(b.map?.[d] || 0);
                  return (
                    <td key={d} className="rv2-r">
                      {q === 0 ? "·" : b.sign ? signed(q) : formatNumberSpaces(q)}
                    </td>
                  );
                })}
                <td className="rv2-r rv2-strong">
                  {b.sign ? signed(b.total) : num(b.total)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card title="Chips Control">
        <table className="rv2-table rv2-sumtable">
          <tbody>
            <tr>
              <td className="rv2-l rv2-sum-label">Opening + Fill − Credit</td>
              <td className="rv2-r">
                {num(totals.opening + totals.diff + totals.fill - totals.credit)}
              </td>
              <td className="rv2-l rv2-sum-label">Closing Counted</td>
              <td className="rv2-r">{num(totals.closing)}</td>
              <td className="rv2-l rv2-sum-label rv2-hl">Difference</td>
              <td className="rv2-r rv2-hl rv2-strong">
                {signed(totals.closing - (totals.opening + totals.diff + totals.fill - totals.credit))}
              </td>
            </tr>
          </tbody>
        </table>
      </Card>

      <Signatures left="Closing Cashier" right="Closing Manager" leftName={signCashier} rightName={signManager} />
      <PageFooter casinoName={casinoName} page={3} total={4} />
    </div>
  );
};

export default ChipsMovementReportV2;
