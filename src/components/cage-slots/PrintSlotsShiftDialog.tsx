/**
 * PrintSlotsShiftDialog — fetches all data for a given slots shift and
 * renders SlotsConsolidatedReport in a preview dialog + via PrintPortal for
 * proper A4 printing. Used both from /cage-slots/report/:id and from the
 * History list (per-row Print button) so managers/super admins can print any
 * closed slots shift.
 */
import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer, X } from "lucide-react";
import PrintPortal from "@/components/cage/PrintPortal";
import SlotsConsolidatedReport from "./SlotsConsolidatedReport";
import { useCasino } from "@/lib/casino-context";
import { tipsBucketOf } from "@/lib/slots-tips-bucket";

interface Props {
  open: boolean;
  onClose: () => void;
  shiftId: string;
}

const PROVIDER_NORMALIZE = (raw: string) => {
  const v = String(raw || "").toUpperCase();
  if (v === "M_PESA" || v === "MPESA") return "MPESA";
  if (v === "TIGO" || v === "T_PESA" || v === "TIGOPESA") return "TIGO";
  if (v === "HALOTEL" || v === "HALO" || v === "H_PESA") return "HALOTEL";
  if (v === "AIRTEL" || v === "AIRTELMONEY") return "AIRTEL";
  return v;
};

const PROV_KEY_FROM_SNAPSHOT_KEY = (k: string): string | null => {
  const v = String(k || "").toLowerCase().replace(/[\s_-]+/g, "");
  if (v.includes("mpesa")) return "MPESA";
  if (v.includes("tigo") || v.includes("tpesa")) return "TIGO";
  if (v.includes("halo") || v.includes("hpesa")) return "HALOTEL";
  if (v.includes("airtel")) return "AIRTEL";
  return null;
};

const ensureSlotsPortraitPrintStyle = () => {
  const existing = document.head.querySelector<HTMLStyleElement>('style[data-slots-print="1"]');
  const styleEl = existing || document.createElement("style");
  styleEl.setAttribute("data-slots-print", "1");
  styleEl.textContent = `
    @media print {
      @page { size: 210mm 297mm !important; margin: 8mm !important; }
      .slots-print-area { width: 194mm !important; min-height: 281mm !important; }
    }
  `;
  if (!existing) document.head.appendChild(styleEl);
  return styleEl;
};

const PrintSlotsShiftDialog = ({ open, onClose, shiftId }: Props) => {
  const { activeCasino } = useCasino();

  const printSlotsReport = () => {
    const source = document.querySelector<HTMLElement>(".slots-print-area");
    if (!source) return;
    ensureSlotsPortraitPrintStyle();
    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    // Give the iframe a real A4-portrait viewport. Chromium can paint a
    // BLANK page when the iframe is 0×0 because layout collapses before
    // print() rasterizes the document.
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "794px";   // ≈ 210mm @ 96dpi
    iframe.style.height = "1123px"; // ≈ 297mm @ 96dpi
    iframe.style.border = "0";
    iframe.style.opacity = "0";
    iframe.style.pointerEvents = "none";
    const baseHref = `${location.origin}/`;
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
    doc.write(`<!doctype html><html><head><base href="${baseHref}">${styles}<style>@media print { @page { size: 210mm 297mm !important; margin: 8mm !important; } html, body { margin: 0 !important; background: white !important; } body, body * { visibility: visible !important; } .slots-print-area { display: block !important; width: 194mm !important; min-height: 281mm !important; page: auto !important; page-break-after: auto !important; break-after: auto !important; } } html, body { margin: 0; background: white; }</style></head><body><div class="slots-print-area cms-print-root">${source.innerHTML}</div></body></html>`);
    doc.close();
    const cleanup = () => {
      setTimeout(() => {
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      }, 1000);
    };
    let didPrint = false;
    const runPrint = async () => {
      if (didPrint) return;
      didPrint = true;
      try {
        // Wait for every <link rel="stylesheet"> inside the iframe to finish
        // loading. Without this, print() can fire before Tailwind CSS lands
        // and the printed page comes out blank.
        const links = Array.from(doc.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'));
        await Promise.all(links.map((l) => {
          if ((l as any).sheet) return Promise.resolve();
          return new Promise<void>((resolve) => {
            const done = () => resolve();
            l.addEventListener("load", done, { once: true });
            l.addEventListener("error", done, { once: true });
            setTimeout(done, 3000); // hard cap so we never hang
          });
        }));
        await new Promise((r) => requestAnimationFrame(() => r(null)));
        await new Promise((r) => setTimeout(r, 80));
      } catch { /* ignore */ }
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      cleanup();
    };
    iframe.onload = () => { void runPrint(); };
    setTimeout(() => { void runPrint(); }, 800);
  };

  const { data, isLoading } = useQuery({
    queryKey: ["print-slots-shift", shiftId],
    enabled: open && !!shiftId,
    queryFn: async () => {
      const [shiftR, invR, cardsR, ratesR, checksR, cashlessR, transfersR, expensesR, tipsCdR] = await Promise.all([
        supabase.from("cage_slots_shifts").select("*").eq("id", shiftId).maybeSingle(),
        supabase.from("cage_slots_cash_inventory").select("*").eq("cage_slots_shift_id", shiftId),
        supabase.from("cage_slots_cards").select("*").eq("cage_slots_shift_id", shiftId).maybeSingle(),
        supabase.from("cage_slots_exchange_rates").select("*").eq("cage_slots_shift_id", shiftId),
        supabase.from("cage_slots_cash_counts").select("*").eq("cage_slots_shift_id", shiftId).order("created_at", { ascending: true }),
        (supabase as any).from("cashless_transactions").select("direction, provider, amount").eq("cage_slots_shift_id", shiftId),
        (supabase as any).from("cage_slots_transfers").select("transfer_type, amount").eq("cage_slots_shift_id", shiftId),
        supabase.from("expenses").select("amount, approved").eq("cage_slots_shift_id", shiftId),
        (supabase as any).from("cage_slots_tips_cd").select("amount, created_at").eq("cage_slots_shift_id", shiftId),
      ]);
      return {
        shift: shiftR.data,
        inventory: invR.data || [],
        cards: cardsR.data,
        rates: ratesR.data || [],
        checks: checksR.data || [],
        cashless: cashlessR.data || [],
        transfers: transfersR.data || [],
        expenses: expensesR.data || [],
        tipsCd: tipsCdR.data || [],
      };
    },
  });

  const props = useMemo(() => {
    if (!data?.shift) return null;
    const { shift, inventory, cards, rates, checks, cashless, transfers, expenses, tipsCd } = data as any;

    // Rates map
    const rateMap: Record<string, number> = { TZS: 1 };
    rates.forEach((r: any) => { rateMap[r.currency_code] = Number(r.rate_to_tzs || 0); });

    // Opener / Closer per-currency native amounts
    const buildByCurrency = (type: "opening" | "closing") => {
      const out: Record<string, number> = { TZS: 0, USD: 0, EUR: 0, GBP: 0, KES: 0, OTHER_TZS: 0 };
      inventory.filter((r: any) => r.inventory_type === type).forEach((r: any) => {
        const code = String(r.currency_code || "").toUpperCase();
        const nativeAmount = Number(r.denomination || 0) * Number(r.quantity || 0);
        if (code in out) out[code] += nativeAmount;
        else out.OTHER_TZS += nativeAmount * Number(r.rate_to_tzs || 0);
      });
      return out;
    };
    const openerByCurrency = buildByCurrency("opening");
    const closerByCurrency = buildByCurrency("closing");

    const cashTotalTzs = (type: "opening" | "closing") =>
      inventory.filter((r: any) => r.inventory_type === type)
        .reduce((s: number, r: any) => s + Number(r.total_tzs || 0), 0);
    const openerCashTotalTzs = cashTotalTzs("opening");
    const closerCashTotalTzs = cashTotalTzs("closing");

    // Opening snapshot (first check with is_opening) — banks + mobile carry-over
    const openingCheck = checks.find((c: any) => (c.denominations as any)?.is_opening);
    const closingCheck = [...checks].reverse().find((c: any) => !(c.denominations as any)?.is_opening) || null;

    const readBank = (raw: any) => {
      const tzs = Number(raw?.tzs || 0);
      const usd = Number(raw?.usd || 0);
      const totalTzs = tzs + usd * Number(rateMap.USD || 0);
      return { tzs, usd, totalTzs };
    };
    const openerBank = readBank((openingCheck?.denominations as any)?.bank);
    const closerBank = readBank((closingCheck?.denominations as any)?.bank);

    const collectProviderSnap = (raw: any): Record<string, number> => {
      const out: Record<string, number> = { MPESA: 0, TIGO: 0, HALOTEL: 0, AIRTEL: 0 };
      if (!raw || typeof raw !== "object") return out;
      Object.entries(raw).forEach(([k, v]) => {
        const key = PROV_KEY_FROM_SNAPSHOT_KEY(k);
        if (key && key in out) out[key] += Number(v || 0);
      });
      return out;
    };

    const openerCashlessByProvider = collectProviderSnap((openingCheck?.denominations as any)?.mobile);
    // End Day per provider — STRICTLY the cashier's manual entry in the
    // "End Day" block (shifts.cashless_final_providers, or the snapshot in
    // the closing check's denominations.cashless_final_providers when the
    // dedicated column is empty for legacy shifts). NEVER falls back to the
    // running mobile snapshot or to NET (IN-OUT).
    // A saved value of `{ Mpesa: 0, Tigo: 0, ... }` is treated as filled
    // (manager confirmed zeros) — we print zeros, we do NOT hide the block.
    const hasKeys = (v: any) => v && typeof v === "object" && Object.keys(v).length > 0;
    const finalProvRaw =
      (hasKeys((shift as any).cashless_final_providers) && (shift as any).cashless_final_providers)
      || (hasKeys((closingCheck?.denominations as any)?.cashless_final_providers) && (closingCheck?.denominations as any).cashless_final_providers)
      || null;
    const closerCashlessByProvider: Record<string, number> = finalProvRaw
      ? collectProviderSnap(finalProvRaw)
      : {}; // empty → report renders "—" per provider
    const sum = (obj: Record<string, number>) => Object.values(obj).reduce((s, v) => s + Number(v || 0), 0);
    const openerCashlessTotalTzs = sum(openerCashlessByProvider);
    const closerCashlessTotalTzs = Number(
      (shift as any).cashless_final ?? (finalProvRaw ? sum(closerCashlessByProvider) : 0)
    );

    // Cashless deposit/withdraw (per-provider) for the shift
    const deposit: Record<string, number> = { MPESA: 0, TIGO: 0, HALOTEL: 0, AIRTEL: 0 };
    const withdraw: Record<string, number> = { MPESA: 0, TIGO: 0, HALOTEL: 0, AIRTEL: 0 };
    const addProviders = (target: Record<string, number>, raw: any) => {
      if (!raw || typeof raw !== "object") return;
      Object.entries(raw).forEach(([key, value]) => {
        const normalized = PROV_KEY_FROM_SNAPSHOT_KEY(key);
        if (normalized && normalized in target) target[normalized] += Number(value || 0);
      });
    };
    cashless.forEach((t: any) => {
      const k = PROVIDER_NORMALIZE(t.provider);
      const amt = Number(t.amount || 0);
      if (!(k in deposit)) return;
      if (t.direction === "IN") deposit[k] += amt;
      else if (t.direction === "OUT") withdraw[k] += amt;
    });
    const hasCashlessTransactions = Object.values(deposit).some(Boolean) || Object.values(withdraw).some(Boolean);
    if (!hasCashlessTransactions) {
      addProviders(deposit, (shift as any).cashless_in_providers || (closingCheck?.denominations as any)?.cashless_in_providers);
      addProviders(withdraw, (shift as any).cashless_out_providers || (closingCheck?.denominations as any)?.cashless_out_providers);
    }
    const fallbackCashlessIn = Number((closingCheck?.denominations as any)?.totals?.cashless_in || 0);
    const fallbackCashlessOut = Number((closingCheck?.denominations as any)?.totals?.cashless_out || 0);

    // Transfers
    const tx = { fill: 0, collection: 0, lg_in: 0, lg_out: 0 } as Record<string, number>;
    transfers.forEach((t: any) => {
      tx[t.transfer_type] = (tx[t.transfer_type] || 0) + Number(t.amount || 0);
    });

    const casinoExpenses = expenses
      .filter((e: any) => e.approved)
      .reduce((s: number, e: any) => s + Number(e.amount || 0), 0);

    const cardDepositTzs = 5000;
    const missCardCount = cards
      ? Number(cards.closing_card_count || 0) - Number(cards.opening_card_count || 0)
      : 0;

    return {
      casinoName: activeCasino?.name || "Casino",
      businessDate: shift.business_date,
      shiftType: shift.shift_type,
      cardsOpener: Number(cards?.opening_card_count ?? 0),
      cardsCloser: cards?.closing_card_count != null ? Number(cards.closing_card_count) : null,
      systemShiftResult: Number(shift.system_shift_result || 0),
      openerByCurrency,
      closerByCurrency,
      openerCashTotalTzs,
      closerCashTotalTzs,
      openerBankTzs: openerBank.tzs,
      openerBankUsd: openerBank.usd,
      openerBankTotalTzs: openerBank.totalTzs,
      closerBankTzs: closerBank.tzs,
      closerBankUsd: closerBank.usd,
      closerBankTotalTzs: closerBank.totalTzs,
      openerCashlessByProvider,
      closerCashlessByProvider,
      openerCashlessTotalTzs,
      closerCashlessTotalTzs,
      cashFlowFill: tx.fill,
      cashFlowCredit: tx.collection,
      cashDeskCardsFill: 0,
      cashDeskCardsCredit: 0,
      missCards: missCardCount,  // signed: + surplus / − deficit
      casinoExpenses,
      tipsCollection: (tipsCd || []).reduce((s: number, t: any) => s + Number(t.amount || 0), 0),
      tipsCollectionDay: (tipsCd || []).filter((t: any) => tipsBucketOf(t.created_at) === "day").reduce((s: number, t: any) => s + Number(t.amount || 0), 0),
      tipsCollectionEvening: (tipsCd || []).filter((t: any) => tipsBucketOf(t.created_at) === "evening").reduce((s: number, t: any) => s + Number(t.amount || 0), 0),
      // Shift Balance is stored in the closing check totals; fallback chain:
      // shifts.balance (rarely populated) → closing check totals.shift_balance → totals.balance → 0
      aceBalance: Number(
        shift.balance ??
        (closingCheck?.denominations as any)?.totals?.shift_balance ??
        (closingCheck?.denominations as any)?.totals?.balance ??
        0
      ),
      cashlessDepositByProvider: deposit,
      cashlessWithdrawByProvider: withdraw,
      cashlessDepositTotalTzs: Object.values(deposit).reduce((sum, value) => sum + Number(value || 0), 0) || fallbackCashlessIn,
      cashlessWithdrawTotalTzs: Object.values(withdraw).reduce((sum, value) => sum + Number(value || 0), 0) || fallbackCashlessOut,
      // Immutable audit snapshot — manual End-Day values exactly as entered
      // on the closing check, regardless of any later edits to shifts.cashless_final_providers.
      manualInputAtCloseByProvider: hasKeys((closingCheck?.denominations as any)?.cashless_final_providers)
        ? collectProviderSnap((closingCheck?.denominations as any).cashless_final_providers)
        : null,
    };
  }, [data, activeCasino]);

  useEffect(() => {
    if (!open) return;
    document.body.classList.add("reprint-shift-open");
    document.body.classList.add("slots-print-open");
    const styleEl = ensureSlotsPortraitPrintStyle();
    return () => {
      document.body.classList.remove("reprint-shift-open");
      document.body.classList.remove("slots-print-open");
      if (styleEl.parentNode) styleEl.parentNode.removeChild(styleEl);
    };
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Slots Shift Report — Print Preview</DialogTitle>
        </DialogHeader>

        {isLoading || !props ? (
          <div className="text-center text-muted-foreground py-10 text-sm">Loading…</div>
        ) : (
          <>
            <div className="border border-border rounded-md overflow-auto bg-white print:hidden max-h-[55vh]">
              <div className="origin-top-left scale-[0.5] w-[200%]">
                <SlotsConsolidatedReport {...props} />
              </div>
            </div>

            <PrintPortal>
              <div className="slots-print-area hidden print:block">
                <SlotsConsolidatedReport {...props} />
              </div>
            </PrintPortal>

            <DialogFooter className="print:hidden">
              <Button variant="outline" onClick={onClose} className="gap-1.5">
                <X className="w-4 h-4" /> Close
              </Button>
              <Button onClick={printSlotsReport} className="gap-1.5">
                <Printer className="w-4 h-4" /> Print
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default PrintSlotsShiftDialog;
