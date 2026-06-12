/**
 * ChipMovementReport — printable chips opening + closing report.
 *
 * Mirrors the legacy paper form: per-denomination grids for
 *   · Cash Desk Chips Opener
 *   · Opening Chips Diff (manual edits to opening chips)
 *   · Cash Desk Float Fill (chips received into cage during shift)
 *   · Cash Desk Float Credit (chips issued out of cage during shift)
 *   · Miss Chips
 *   · Cash Desk Chips Close
 *
 * Self-contained: fetches cage_transfers chips JSONB for the shift to compute
 * Float Fill / Credit per denomination. Designed to print as a second A4 page
 * after ShiftClosingReport.
 */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CHIP_DENOMS, formatNumberSpaces } from "@/lib/currency";
import { useChipColors, resolveChipColor, useVisibleChipDenoms } from "@/hooks/use-chip-colors";
import { fmtDate } from "@/lib/format-date";
import type { Tables } from "@/integrations/supabase/types";

interface Props {
  shift: Tables<"shifts">;
  openingChips: Record<number, number>;
  /** Manual diff applied to opening chips (denom -> qty), if any */
  openingDiff?: Record<number, number>;
  closingChips: Record<number, number>;
  missPerDenom: Record<number, number>;
  businessDate: string;
  casinoName?: string;
  cashierName?: string;
  managerName?: string;
}

const ChipMovementReport = ({
  shift, openingChips, openingDiff = {}, closingChips, missPerDenom,
  businessDate, casinoName = "Casino", cashierName, managerName,
}: Props) => {
  const [fillByDenom, setFillByDenom] = useState<Record<number, number>>({});
  const [creditByDenom, setCreditByDenom] = useState<Record<number, number>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!shift?.id) return;
      const { data } = await supabase
        .from("cage_transfers")
        .select("transfer_type, chips")
        .eq("shift_id", shift.id)
        .in("transfer_type", ["fill", "credit"]);
      if (cancelled) return;
      const fill: Record<number, number> = {};
      const credit: Record<number, number> = {};
      (data || []).forEach((r: any) => {
        const target = r.transfer_type === "fill" ? fill : credit;
        const chips = (r.chips || {}) as Record<string, number>;
        Object.entries(chips).forEach(([d, q]) => {
          const dn = Number(d);
          target[dn] = (target[dn] || 0) + (Number(q) || 0);
        });
      });
      setFillByDenom(fill);
      setCreditByDenom(credit);
    })();
    return () => { cancelled = true; };
  }, [shift?.id]);

  const total = (m: Record<number, number>) =>
    CHIP_DENOMS.reduce((s, d) => s + d * (m[d] || 0), 0);

  const totals = useMemo(() => ({
    opener: total(openingChips),
    diff: total(openingDiff),
    fill: total(fillByDenom),
    credit: total(creditByDenom),
    miss: total(missPerDenom),
    close: total(closingChips),
  }), [openingChips, openingDiff, fillByDenom, creditByDenom, missPerDenom, closingChips]);

  return (
    <div
      id="chip-print-area"
      className="bg-white text-black font-sans"
      style={{
        fontFamily: "Arial, sans-serif",
        fontSize: "10.5px",
        lineHeight: 1.25,
        width: "194mm",
        boxSizing: "border-box",
      }}
    >
      {/* Header */}
      <table className="w-full border-collapse mb-1.5" style={{ tableLayout: "fixed" }}>
        <colgroup>
          <col />
          <col style={{ width: "18mm" }} />
          <col style={{ width: "28mm" }} />
          <col style={{ width: "18mm" }} />
          <col style={{ width: "34mm" }} />
        </colgroup>
        <tbody>
          <tr>
            <td className="border border-black px-1.5 py-0.5 font-bold text-[12px]">
              {casinoName} Chips Movement Report
            </td>
            <td className="border border-black px-1.5 py-0.5 font-semibold text-center">Date</td>
            <td className="border border-black px-1.5 py-0.5 text-center">{fmtDate(businessDate)}</td>
            <td className="border border-black px-1.5 py-0.5 font-semibold text-center">Cashier</td>
            <td className="border border-black px-1.5 py-0.5 text-center uppercase">{cashierName || ""}</td>
          </tr>
        </tbody>
      </table>

      {/* 3 rows × 2 cols — compact, fits one A4 portrait */}
      <p className="font-semibold border-b border-black mb-1 text-[11px]">Chips Opening Report</p>
      <div className="grid grid-cols-2 gap-2 mb-2">
        <DenomTable title="Cash Desk Chips Opener" data={openingChips} total={totals.opener} />
        <DenomTable title="Opening Chips Diff" data={openingDiff} total={totals.diff} signed />
        <DenomTable title="Cash Desk Float Fill" data={fillByDenom} total={totals.fill} />
        <DenomTable title="Cash Desk Float Credit" data={creditByDenom} total={totals.credit} />
      </div>

      <p className="font-semibold border-b border-black mb-1 text-[11px]">Chips Closing Report</p>
      <div className="grid grid-cols-2 gap-2">
        <DenomTable title="Miss Chips" data={missPerDenom} total={totals.miss} signed />
        <DenomTable title="Cash Desk Chips Close" data={closingChips} total={totals.close} />
      </div>
    </div>
  );
};

const DenomTable = ({ title, data, total, signed }: {
  title: string;
  data: Record<number, number>;
  total: number;
  signed?: boolean;
}) => {
  const { data: chipColorOverrides } = useChipColors();
  const visibleDenoms = useVisibleChipDenoms();
  const fmtQty = (q: number) => {
    if (!q) return "";
    return signed && q !== 0 ? `${q > 0 ? "+" : ""}${q}` : String(q);
  };
  const fmtVal = (v: number) => {
    if (!v) return "";
    return signed && v !== 0 ? `${v > 0 ? "+" : "-"}${formatNumberSpaces(Math.abs(v))}` : formatNumberSpaces(v);
  };
  const fmtTotal = (v: number) => {
    if (v === 0) return "0";
    return v > 0 ? formatNumberSpaces(v) : `-${formatNumberSpaces(Math.abs(v))}`;
  };
  return (
    <div className="flex flex-col">
      <p className="font-semibold text-center border border-black bg-gray-100 py-0.5 text-[10.5px]">{title}</p>
      <table className="w-full border-collapse text-[10px]" style={{ tableLayout: "fixed" }}>
        <colgroup>
          <col style={{ width: "40%" }} />
          <col style={{ width: "25%" }} />
          <col style={{ width: "35%" }} />
        </colgroup>
        <thead>
          <tr className="bg-gray-50">
            <th className="border border-black px-1 py-0.5 text-left font-semibold">Den</th>
            <th className="border border-black px-1 py-0.5 text-right font-semibold">Qty</th>
            <th className="border border-black px-1 py-0.5 text-right font-semibold">Value</th>
          </tr>
        </thead>
        <tbody>
          {CHIP_DENOMS.map(d => {
            const q = data[d] || 0;
            const v = q * d;
            const c = resolveChipColor(d, chipColorOverrides);
            return (
              <tr key={d}>
                <td className="border border-black px-1 py-0.5 tabular-nums">
                  <span
                    className="inline-block rounded-full border border-black px-1.5 py-0 text-[9px] font-bold tabular-nums leading-tight"
                    style={{ background: c.bg, color: c.text, borderColor: c.edge, WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" } as any}
                  >
                    {formatNumberSpaces(d)}
                  </span>
                </td>
                <td className="border border-black px-1 py-0.5 text-right tabular-nums">{fmtQty(q)}</td>
                <td className="border border-black px-1 py-0.5 text-right tabular-nums">{fmtVal(v)}</td>
              </tr>
            );
          })}
          <tr className="bg-gray-100 font-bold">
            <td className="border border-black px-1 py-0.5">Total</td>
            <td className="border border-black px-1 py-0.5" />
            <td className="border border-black px-1 py-0.5 text-right tabular-nums">{fmtTotal(total)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};

export default ChipMovementReport;
