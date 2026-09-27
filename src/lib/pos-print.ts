/**
 * Lightweight 80mm browser printing for POS: bartender tickets + EFD entry slip.
 * No hardware agent — uses a hidden iframe and window.print().
 */
import { supabase } from "@/integrations/supabase/client";
import { formatNumberSpaces } from "@/lib/currency";
import { fmtDate, fmtDateTime } from "@/lib/format-date";
import type { PosZReport } from "@/hooks/use-pos-shift";

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

function print80mm(body: string) {
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument!;
  doc.open();
  doc.write(`<!doctype html><html><head><style>
    @page { size: 80mm auto; margin: 3mm; }
    body { font-family: ui-monospace, monospace; font-size: 12px; width: 74mm; margin: 0; }
    h1 { font-size: 15px; margin: 0 0 4px; text-align: center; }
    .row { display: flex; justify-content: space-between; }
    .big { font-size: 14px; font-weight: bold; }
    hr { border: 0; border-top: 1px dashed #000; margin: 4px 0; }
    .mod { padding-left: 10px; }
  </style></head><body>${body}</body></html>`);
  doc.close();
  setTimeout(() => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    setTimeout(() => iframe.remove(), 2000);
  }, 150);
}

/** Print a bartender ticket if casino bar_output_mode is printer or both. */
export async function maybePrintBarTicket(orderId: string) {
  try {
    const { data: o } = await supabase
      .from("pos_orders")
      .select("id, casino_id, created_at, notes, ordered_by_employee_id, tab:pos_tabs(player_name, walkin_label), items:pos_order_items(id, item_name, qty, mods:pos_order_item_modifiers(modifier_name_snapshot))")
      .eq("id", orderId)
      .maybeSingle();
    if (!o) return;
    const { data: set } = await supabase
      .from("pos_casino_settings" as any)
      .select("bar_output_mode")
      .eq("casino_id", (o as any).casino_id)
      .maybeSingle();
    const mode = (set as any)?.bar_output_mode ?? "screen";
    if (mode === "screen") return;
    let waiter = "";
    if ((o as any).ordered_by_employee_id) {
      const { data: emps } = await supabase.rpc("pos_employee_names" as any, { _ids: [(o as any).ordered_by_employee_id] });
      waiter = ((emps ?? []) as any[])[0]?.full_name ?? "";
    }
    const tab = (o as any).tab;
    const items = ((o as any).items ?? []) as any[];
    print80mm(`
      <h1>BAR ORDER</h1>
      <div class="row"><span>#${esc(String(o.id).slice(0, 6).toUpperCase())}</span><span>${esc(fmtDateTime(o.created_at))}</span></div>
      <div class="big">${esc(tab?.player_name || tab?.walkin_label || "Guest")}</div>
      <div>Waiter: ${esc(waiter || "—")}</div><hr/>
      ${items.map((it) => `<div class="big">${esc(it.qty)} × ${esc(it.item_name)}</div>${(it.mods ?? []).map((m: any) => `<div class="mod">+ ${esc(m.modifier_name_snapshot)}</div>`).join("")}`).join("")}
      ${(o as any).notes ? `<hr/><div>Note: ${esc((o as any).notes)}</div>` : ""}
    `);
  } catch {
    /* printing is best-effort; order is already sent */
  }
}

/** EFD entry summary: Money sales only (credits/free shown separately). VAT informational. */
export function printEfdSlip(z: PosZReport, casinoName?: string | null) {
  const t = z.totals ?? ({} as any);
  const money = Number(t.money ?? t.cash ?? 0);
  const rate = z.vat_rate ?? 18;
  const vat = Math.round((money * rate) / (100 + rate));
  const n = (v: number) => formatNumberSpaces(Math.round(v || 0));
  print80mm(`
    <h1>EFD ENTRY SUMMARY</h1>
    <div style="text-align:center">Paid Bar Shift Slip</div><hr/>
    <div class="row"><span>Casino</span><span>${esc(casinoName ?? z.casino_name ?? "")}</span></div>
    <div class="row"><span>Business date</span><span>${esc(z.business_date ? fmtDate(z.business_date) : "")}</span></div>
    <div class="row"><span>Shift</span><span>${esc(z.shift_type ?? "")} · ${esc(fmtDateTime(z.opened_at))}</span></div><hr/>
    <div class="row big"><span>MONEY SALES</span><span>${n(money)} TZS</span></div>
    <div class="row"><span>VAT rate</span><span>${rate}%</span></div>
    <div class="row"><span>VAT included (info)</span><span>${n(vat)}</span></div><hr/>
    <div>Not for EFD (reconciliation only):</div>
    <div class="row"><span>Credits</span><span>${n(Number(t.credits ?? 0))}</span></div>
    <div class="row"><span>Free</span><span>${n(Number(t.free ?? 0))}</span></div>
    <div class="row"><span>Retail value</span><span>${n(Number(t.retail_tzs ?? t.gross_tzs ?? 0))}</span></div>
  `);
}
