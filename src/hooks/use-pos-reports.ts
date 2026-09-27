/**
 * POS Reports — aggregated views over pos_tabs, pos_orders, pos_order_items,
 * scoped by casino + business date range.
 */
import { useQuery } from "@tanstack/react-query";
import { liveQueryOptions, liveQueryOptionsWithFallback } from "@/lib/live-query-options";
import { supabase } from "@/integrations/supabase/client";
import type { PaymentSplit } from "@/hooks/use-pos-tabs";

export type PosReportRange = { from: string; to: string }; // YYYY-MM-DD inclusive

/** By waiter = order attribution: real employee (PIN) where present, else terminal user (legacy rows). */
export type WaiterRow = {
  waiter_user_id: string; // row key: "emp:<id>" or "user:<id>"
  waiter_name: string;
  orders: number;
  voided: number;
  paid_sales_tzs: number;
  comp_orders: number;
};

export type TopItemRow = {
  item_id: string;
  item_name: string;
  qty: number;
  revenue_tzs: number;
};

export type PosReport = {
  totals: {
    bills_closed: number;
    bills_voided: number;
    void_rate: number;
    gross_tzs: number;
    avg_ticket: number;
    cash: number;
    card: number;
    comp_player: number;
    comp_house: number;
    player_charge: number;
    comp_orders: number;
    comp_items: number;
    comp_cogs_tzs: number;
  };
  byWaiter: WaiterRow[];
  topItems: TopItemRow[];
};

export function usePosReport(casinoId: string | null, range: PosReportRange) {
  return useQuery({
    queryKey: ["pos-report", casinoId, range.from, range.to],
    enabled: !!casinoId && !!range.from && !!range.to,
    ...liveQueryOptionsWithFallback(30000),
    queryFn: async (): Promise<PosReport> => {
      // Tabs in range
      const { data: tabs, error: tabsErr } = await supabase
        .from("pos_tabs")
        .select("id, status, total_tzs, payment_split, opened_by_user_id, business_date, operation_mode")
        .eq("casino_id", casinoId!)
        .gte("business_date", range.from)
        .lte("business_date", range.to);
      if (tabsErr) throw tabsErr;

      const closed = (tabs ?? []).filter(t => t.status === "closed");
      const voided = (tabs ?? []).filter(t => t.status === "voided");

      let gross = 0, cash = 0, card = 0, cp = 0, ch = 0, pc = 0;
      for (const t of closed) {
        const ps = (t.payment_split as PaymentSplit | null) ?? {};
        gross += Number(t.total_tzs) || 0;
        cash += Number(ps.cash) || 0;
        card += Number(ps.card) || 0;
        cp   += Number(ps.comp_player) || 0;
        ch   += Number(ps.comp_house) || 0;
        pc   += Number(ps.player_charge) || 0;
      }
      const paidClosed = closed.filter((t: any) => t.operation_mode !== "complimentary").length;

      // Top items — restrict to orders served (non-voided) in range
      const { data: allOrders } = await supabase
        .from("pos_orders")
        .select("id, status, business_date, total_tzs, operation_mode, waiter_user_id, ordered_by_employee_id")
        .eq("casino_id", casinoId!)
        .gte("business_date", range.from)
        .lte("business_date", range.to);
      const orders = (allOrders ?? []).filter((o: any) => o.status !== "void");
      const compOrderIds = new Set(orders.filter((o: any) => o.operation_mode === "complimentary").map((o: any) => o.id));

      // By waiter — employee attribution with legacy fallback to terminal/profile name
      const empIds = Array.from(new Set((allOrders ?? []).map((o: any) => o.ordered_by_employee_id).filter(Boolean))) as string[];
      const legacyUserIds = Array.from(new Set((allOrders ?? []).filter((o: any) => !o.ordered_by_employee_id).map((o: any) => o.waiter_user_id).filter(Boolean))) as string[];
      const empNames = new Map<string, string>();
      if (empIds.length > 0) {
        const { data: emps } = await supabase.rpc("pos_employee_names", { _ids: empIds });
        ((emps ?? []) as any[]).forEach((e) => empNames.set(e.id, e.full_name));
      }
      const userNames = new Map<string, string>();
      if (legacyUserIds.length > 0) {
        const { data: profs } = await supabase.from("profiles").select("user_id, full_name").in("user_id", legacyUserIds);
        (profs ?? []).forEach((p: any) => userNames.set(p.user_id, p.full_name || "—"));
      }
      const wMap = new Map<string, WaiterRow>();
      for (const o of (allOrders ?? []) as any[]) {
        const key = o.ordered_by_employee_id ? `emp:${o.ordered_by_employee_id}` : `user:${o.waiter_user_id}`;
        let row = wMap.get(key);
        if (!row) {
          row = {
            waiter_user_id: key,
            waiter_name: o.ordered_by_employee_id
              ? empNames.get(o.ordered_by_employee_id) || "—"
              : `${userNames.get(o.waiter_user_id) || "—"} (terminal)`,
            orders: 0, voided: 0, paid_sales_tzs: 0, comp_orders: 0,
          };
          wMap.set(key, row);
        }
        if (o.status === "void") { row.voided += 1; continue; }
        row.orders += 1;
        if (o.operation_mode === "complimentary") row.comp_orders += 1;
        else row.paid_sales_tzs += Number(o.total_tzs) || 0;
      }

      // Complimentary COGS from inventory movement cost snapshots
      let compItems = 0, compCogs = 0;
      const compIds = Array.from(compOrderIds);
      for (let i = 0; i < compIds.length; i += 500) {
        const { data: mv } = await supabase
          .from("pos_inventory_movements")
          .select("delta, cost_tzs_snapshot")
          .in("reference_id", compIds.slice(i, i + 500));
        for (const m of (mv ?? []) as any[]) {
          const c = Math.abs(Number(m.cost_tzs_snapshot) || 0);
          compCogs += Number(m.delta) < 0 ? c : -c;
        }
      }

      const orderIds = orders.map((o: any) => o.id);
      let topItems: TopItemRow[] = [];
      if (orderIds.length > 0) {
        // chunk if needed (in() limit safety)
        const items: any[] = [];
        const chunk = 500;
        for (let i = 0; i < orderIds.length; i += chunk) {
          const slice = orderIds.slice(i, i + chunk);
          const { data: it } = await supabase
            .from("pos_order_items")
            .select("order_id, item_id, item_name, qty, line_total_tzs")
            .in("order_id", slice);
          if (it) items.push(...it);
        }
        const im = new Map<string, TopItemRow>();
        for (const r of items) {
          if (compOrderIds.has(r.order_id)) { compItems += Number(r.qty) || 0; continue; }
          const k = r.item_id;
          const cur = im.get(k) || { item_id: k, item_name: r.item_name, qty: 0, revenue_tzs: 0 };
          cur.qty += Number(r.qty) || 0;
          cur.revenue_tzs += Number(r.line_total_tzs) || 0;
          im.set(k, cur);
        }
        topItems = Array.from(im.values()).sort((a, b) => b.revenue_tzs - a.revenue_tzs).slice(0, 15);
      }

      const billsClosed = closed.length;
      const billsVoided = voided.length;
      const denom = billsClosed + billsVoided;

      return {
        totals: {
          bills_closed: billsClosed,
          bills_voided: billsVoided,
          void_rate: denom > 0 ? billsVoided / denom : 0,
          gross_tzs: gross,
          avg_ticket: paidClosed > 0 ? Math.round(gross / paidClosed) : 0,
          cash, card, comp_player: cp, comp_house: ch, player_charge: pc,
          comp_orders: compOrderIds.size,
          comp_items: compItems,
          comp_cogs_tzs: Math.round(compCogs),
        },
        byWaiter: Array.from(wMap.values()).sort((a, b) => (b.orders - a.orders) || (b.paid_sales_tzs - a.paid_sales_tzs)),
        topItems,
      };
    },
  });
}
