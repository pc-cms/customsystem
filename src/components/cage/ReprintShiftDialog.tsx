/**
 * ReprintShiftDialog — reopens the printable Consolidating Cash Desk Report
 * and Chips Movement Report for an already-closed shift so the manager can
 * re-print them later from /reports?tab=live.
 *
 * All numbers come from the immutable shift snapshot (closing_count,
 * opening_float, exchange_rates, miss_total) plus per-shift expenses.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer, X } from "lucide-react";
import { CHIP_DENOMS } from "@/lib/currency";
import { computeMissByDenom } from "@/components/cage/CageHelpers";
import ShiftClosingReport from "@/components/cage/ShiftClosingReport";
import ChipMovementReport from "@/components/cage/ChipMovementReport";
import PrintPortal from "@/components/cage/PrintPortal";
import type { Tables } from "@/integrations/supabase/types";

interface Props {
  open: boolean;
  onClose: () => void;
  shiftId: string;
  casinoId: string;
}

/** Business date for an EAT timestamp using the 07:00 rollover rule. */
const businessDateForEAT = (iso: string): string => {
  const d = new Date(iso);
  const eatHour = parseInt(
    d.toLocaleString("en-GB", { timeZone: "Africa/Dar_es_Salaam", hour: "2-digit", hour12: false }),
    10,
  );
  const target = eatHour < 7 ? new Date(d.getTime() - 24 * 60 * 60 * 1000) : d;
  return target.toLocaleDateString("en-CA", { timeZone: "Africa/Dar_es_Salaam" });
};

const ensureLiveGamePortraitPrintStyle = () => {
  const existing = document.head.querySelector<HTMLStyleElement>('style[data-live-game-print="1"]');
  const styleEl = existing || document.createElement("style");
  styleEl.setAttribute("data-live-game-print", "1");
  styleEl.textContent = `
    @media print {
      @page portrait { size: A4 portrait; margin: 8mm; }
    }
  `;
  if (!existing) document.head.appendChild(styleEl);
  return styleEl;
};

const printLiveGameReport = () => {
  const source = document.querySelector<HTMLElement>(".live-game-print-area");
  if (!source) return;
  ensureLiveGamePortraitPrintStyle();
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  const styles = Array.from(document.querySelectorAll<HTMLStyleElement | HTMLLinkElement>('style, link[rel="stylesheet"]'))
    .map((node) => node.outerHTML)
    .join("\n");
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument;
  if (!doc) {
    if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
    return;
  }
  doc.open();
  doc.write(`<!doctype html><html><head>${styles}<style>
    @media print {
      @page portrait { size: A4 portrait; margin: 8mm; }
      html, body { margin: 0 !important; background: white !important; }
      body, body * { visibility: visible !important; }
      .live-game-print-area { display: block !important; }
      #shift-print-area {
        page: portrait !important;
        width: 194mm !important;
        padding: 0 !important;
        page-break-after: always !important;
        break-after: page !important;
      }
      #chip-print-area {
        page: portrait !important;
        width: 194mm !important;
        padding: 0 !important;
        page-break-before: always !important;
        break-before: page !important;
        page-break-after: auto !important;
        break-after: auto !important;
      }
    }
  </style></head><body><div class="live-game-print-area cms-print-root">${source.innerHTML}</div></body></html>`);
  doc.close();
  const cleanup = () => {
    setTimeout(() => {
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
    }, 500);
  };
  let didPrint = false;
  const runPrint = () => {
    if (didPrint) return;
    didPrint = true;
    requestAnimationFrame(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      cleanup();
    });
  };
  iframe.onload = runPrint;
  setTimeout(runPrint, 250);
};

const ReprintShiftDialog = ({ open, onClose, shiftId, casinoId }: Props) => {
  const { data, isLoading } = useQuery({
    queryKey: ["reprint-shift", shiftId],
    enabled: open && !!shiftId && !!casinoId,
    queryFn: async () => {
      const [{ data: shift }, { data: tables }, { data: exp }] = await Promise.all([
        supabase.from("shifts").select("*").eq("id", shiftId).maybeSingle(),
        supabase.from("gaming_tables").select("*").eq("casino_id", casinoId),
        supabase.from("expenses").select("amount").eq("shift_id", shiftId),
      ]);
      const totalExpenses = (exp || []).reduce((s: number, r: any) => s + Number(r.amount || 0), 0);
      return { shift, tables: tables || [], totalExpenses };
    },
  });

  const shift = data?.shift as Tables<"shifts"> | undefined;
  const tables = (data?.tables || []) as Tables<"gaming_tables">[];

  const openingChips = useMemo(() => {
    const opening = (shift?.opening_float as any)?.chips as Record<string, number> | undefined;
    const out: Record<number, number> = {};
    CHIP_DENOMS.forEach(d => { out[d] = Number(opening?.[d] ?? opening?.[String(d)] ?? 0); });
    return out;
  }, [shift]);

  const closingCount = (shift?.closing_count as any) || {};
  const chipCounts = useMemo(() => {
    const c = closingCount.chips as Record<string, number> | undefined;
    const out: Record<number, number> = {};
    CHIP_DENOMS.forEach(d => { out[d] = Number(c?.[d] ?? c?.[String(d)] ?? 0); });
    return out;
  }, [closingCount]);

  const missPerDenom = useMemo(() => {
    const stored = closingCount.chip_miss_by_denom || closingCount.chip_miss;
    if (stored && typeof stored === "object") {
      const out: Record<number, number> = {};
      CHIP_DENOMS.forEach(d => { out[d] = Number((stored as any)[d] ?? (stored as any)[String(d)] ?? 0); });
      return out;
    }
    return computeMissByDenom(openingChips, chipCounts, CHIP_DENOMS);
  }, [closingCount, openingChips, chipCounts]);

  const businessDate = useMemo(
    () => (shift?.closed_at ? businessDateForEAT(shift.closed_at) : ""),
    [shift?.closed_at],
  );

  // Canonical columns (filled by DB trigger compute_shift_balance) are the
  // source of truth. Snapshot fields in `closing_count` are kept only as a
  // fallback for very old rows where the trigger never ran.
  const resultTable = Number(
    shift?.tables_result ?? closingCount.result_table ?? shift?.shift_result ?? 0,
  );
  const balance = Number(shift?.balance ?? closingCount.cash_desk_balance ?? 0);
  const snapshotMiss = Number(closingCount.chip_miss_total ?? 0);
  const missTotal = Number(shift?.miss_total ?? -snapshotMiss);
  const rates = (shift?.exchange_rates || {}) as Record<string, number>;

  // Add a body class while open so global @media print rules can target it.
  useEffect(() => {
    if (!open) return;
    document.body.classList.add("reprint-shift-open");
    return () => document.body.classList.remove("reprint-shift-open");
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Reprint Shift Reports</DialogTitle>
        </DialogHeader>

        {isLoading || !shift ? (
          <div className="text-center text-muted-foreground py-10 text-sm">Loading…</div>
        ) : (
          <>
            {/* On-screen preview only — print is handled by PrintPortal below
                so the printed output escapes the dialog's transform/clip. */}
            <div className="border border-border rounded-md overflow-auto bg-white text-black print:hidden max-h-[55vh]">
              <div className="origin-top-left scale-[0.5] w-[200%]">
                <ShiftClosingReport
                  shift={shift}
                  tables={tables}
                  closingCount={closingCount}
                  openingFloat={shift.opening_float as any}
                  exchangeRates={rates}
                  totalExpenses={data?.totalExpenses || 0}
                  missTotal={missTotal}
                  resultTable={resultTable}
                  balance={balance}
                  businessDate={businessDate}
                />
                <ChipMovementReport
                  shift={shift}
                  openingChips={openingChips}
                  closingChips={chipCounts}
                  missPerDenom={missPerDenom}
                  businessDate={businessDate}
                />
              </div>
            </div>

            <PrintPortal>
              <div className="live-game-print-area hidden print:block">
                <ShiftClosingReport
                  shift={shift}
                  tables={tables}
                  closingCount={closingCount}
                  openingFloat={shift.opening_float as any}
                  exchangeRates={rates}
                  totalExpenses={data?.totalExpenses || 0}
                  missTotal={missTotal}
                  resultTable={resultTable}
                  balance={balance}
                  businessDate={businessDate}
                />
                <ChipMovementReport
                  shift={shift}
                  openingChips={openingChips}
                  closingChips={chipCounts}
                  missPerDenom={missPerDenom}
                  businessDate={businessDate}
                />
              </div>
            </PrintPortal>

            <DialogFooter className="print:hidden">
              <Button variant="outline" onClick={onClose} className="gap-1.5">
                <X className="w-4 h-4" /> Close
              </Button>
              <Button onClick={printLiveGameReport} className="gap-1.5">
                <Printer className="w-4 h-4" /> Print Reports
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ReprintShiftDialog;
