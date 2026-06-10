/**
 * ReceiptDialog — printable receipt for a single POS tab (open or closed).
 *
 * Renders an 80mm-style HTML preview and offers Print (window.print on an
 * isolated iframe so the page chrome stays untouched). No backend writes;
 * receipts are derived from the tab + orders.
 */
import { useRef } from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ResponsiveDialog, ResponsiveDialogFooter } from "@/components/ui/responsive-dialog";
import { formatNumberSpaces } from "@/lib/currency";
import { fmtDateTime } from "@/lib/format-date";
import { usePosTabOrders } from "@/hooks/use-pos-orders";
import { useCasino } from "@/lib/casino-context";
import type { PosTab } from "@/hooks/use-pos-tabs";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  tab: PosTab | null;
}

const fmtSplit = (split: any) => {
  if (!split) return [];
  const labels: Record<string, string> = {
    cash: "Cash",
    card: "Card",
    comp_player: "Comp · Player",
    comp_house: "Comp · House",
  };
  return Object.entries(split)
    .filter(([, v]) => Number(v) > 0)
    .map(([k, v]) => ({ label: labels[k] ?? k, value: Number(v) }));
};

export const ReceiptDialog = ({ open, onOpenChange, tab }: Props) => {
  const { activeCasino } = useCasino();
  const { data: orders = [] } = usePosTabOrders(tab?.id ?? null, tab?.casino_id ?? null);
  const printRef = useRef<HTMLDivElement>(null);

  if (!tab) return null;

  const label = tab.player_id ? tab.player_name || "Player" : `Walk-in · ${tab.walkin_label ?? ""}`;
  const lines = orders.filter((o) => o.status !== "void").flatMap((o) => o.items);
  const splitLines = fmtSplit(tab.payment_split);
  const isClosed = tab.status === "closed";

  const handlePrint = () => {
    if (!printRef.current) return;
    const html = printRef.current.innerHTML;
    const w = window.open("", "_blank", "width=400,height=600");
    if (!w) return;
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"/><title>Receipt</title>
<style>
  body { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 12px; margin: 0; padding: 8px; color: #000; }
  .center { text-align: center; }
  .row { display: flex; justify-content: space-between; gap: 8px; }
  .muted { color: #555; }
  .hr { border-top: 1px dashed #000; margin: 6px 0; }
  .total { font-size: 14px; font-weight: bold; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 1px 0; vertical-align: top; }
  td.qty { width: 28px; }
  td.amt { text-align: right; white-space: nowrap; }
  @media print { @page { size: 80mm auto; margin: 4mm; } }
</style></head><body>${html}</body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); w.close(); }, 250);
  };

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} title="Receipt" size="md">
      <div
        ref={printRef}
        className="bg-white text-black font-mono text-[12px] p-3 rounded border border-border max-h-[60vh] overflow-y-auto"
      >
        <div className="center">
          <div style={{ fontWeight: 700, fontSize: 14 }}>{activeCasino?.name ?? "Casino"}</div>
          <div className="muted">F&amp;B Receipt</div>
          <div className="muted">{fmtDateTime(new Date().toISOString())}</div>
        </div>
        <div className="hr" />
        <div className="row"><span>Tab</span><span>#{tab.id.slice(0, 8)}</span></div>
        <div className="row"><span>{label}</span><span className="muted">{fmtDateTime(tab.opened_at)}</span></div>
        <div className="hr" />
        <table>
          <tbody>
            {lines.length === 0 && (
              <tr><td colSpan={3} className="center muted">No items</td></tr>
            )}
            {lines.map((it) => (
              <tr key={it.id}>
                <td className="qty">{it.qty}×</td>
                <td>{it.item_name}</td>
                <td className="amt">{formatNumberSpaces(it.line_total_tzs)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="hr" />
        <div className="row total"><span>TOTAL</span><span>{formatNumberSpaces(tab.total_tzs)} TZS</span></div>
        {splitLines.length > 0 && (
          <>
            <div className="hr" />
            {splitLines.map((s) => (
              <div className="row" key={s.label}>
                <span>{s.label}</span>
                <span>{formatNumberSpaces(s.value)}</span>
              </div>
            ))}
          </>
        )}
        <div className="hr" />
        <div className="center muted">
          {isClosed ? "Thank you" : "** OPEN TAB — not a final receipt **"}
        </div>
      </div>

      <ResponsiveDialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        <Button onClick={handlePrint} className="gap-2">
          <Printer className="w-4 h-4" /> Print
        </Button>
      </ResponsiveDialogFooter>
    </ResponsiveDialog>
  );
};

export default ReceiptDialog;
