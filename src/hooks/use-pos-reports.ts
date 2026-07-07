/**
 * POS Reports — aggregated views over pos_tabs, pos_orders, pos_order_items,
 * scoped by casino + business date range.
 */
import { useQuery } from "@tanstack/react-query";
import { liveQueryOptions, liveQueryOptionsWithFallback } from "@/lib/live-query-options";
import { supabase } from "@/integrations/supabase/client";
import type { PaymentSplit } from "@/hooks/use-pos-tabs";

export type PosReportRange = { from: string; to: string }; // YYYY-MM-DD inclusive

export type WaiterRow = {
  waiter_user_id: string;
  waiter_name: string;
  bills: number;
  voided: number;
  gross_tzs: number;
  cash: number;
  card: number;
  comp_player: number;
  comp_house: number;
  player_charge: number;
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
        .select("id, status, total_tzs, payment_split, opened_by_user_id, business_date")
        .eq("casino_id", casinoId!)
        .gte("business_date", range.from)
        .lte("business_date", range.to);
      if (tabsErr) throw tabsErr;

      const closed = (tabs ?? []).filter(t => t.status === "closed");
      const voided = (tabs ?? []).filter(t => t.status === "voided");

      // Resolve waiter names
      const userIds = Array.from(new Set(closed.map(t => t.opened_by_user_id).filter(Boolean)));
      let nameMap = new Map<string, string>();
      if (userIds.length > 0) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("user_id, full_name")
          .in("user_id", userIds);
        (profs ?? []).forEach((p: any) => nameMap.set(p.user_id, p.full_name || "—"));
      }

      // Totals + by waiter
      const wMap = new Map<string, WaiterRow>();
      let gross = 0, cash = 0, card = 0, cp = 0, ch = 0, pc = 0;
      for (const t of closed) {
        const ps = (t.payment_split as PaymentSplit | null) ?? {};
        const total = Number(t.total_tzs) || 0;
        gross += total;
        cash += Number(ps.cash) || 0;
        card += Number(ps.card) || 0;
        cp   += Number(ps.comp_player) || 0;
        ch   += Number(ps.comp_house) || 0;
        pc   += Number(ps.player_charge) || 0;

        const uid = t.opened_by_user_id;
        let row = wMap.get(uid);
        if (!row) {
          row = {
            waiter_user_id: uid,
            waiter_name: nameMap.get(uid) || "—",
            bills: 0, voided: 0, gross_tzs: 0,
            cash: 0, card: 0, comp_player: 0, comp_house: 0, player_charge: 0,
          };
          wMap.set(uid, row);
        }
        row.bills += 1;
        row.gross_tzs += total;
        row.cash += Number(ps.cash) || 0;
        row.card += Number(ps.card) || 0;
        row.comp_player += Number(ps.comp_player) || 0;
        row.comp_house  += Number(ps.comp_house) || 0;
        row.player_charge += Number(ps.player_charge) || 0;
      }
      for (const t of voided) {
        const uid = t.opened_by_user_id;
        let row = wMap.get(uid);
        if (!row) {
          row = {
            waiter_user_id: uid,
            waiter_name: nameMap.get(uid) || "—",
            bills: 0, voided: 0, gross_tzs: 0,
            cash: 0, card: 0, comp_player: 0, comp_house: 0, player_charge: 0,
          };
          wMap.set(uid, row);
        }
        row.voided += 1;
      }

      // Top items — restrict to orders served (non-voided) in range
      const { data: orders } = await supabase
        .from("pos_orders")
        .select("id, status, business_date")
        .eq("casino_id", casinoId!)
        .gte("business_date", range.from)
        .lte("business_date", range.to)
        .neq("status", "void");

      const orderIds = (orders ?? []).map(o => o.id);
      let topItems: TopItemRow[] = [];
      if (orderIds.length > 0) {
        // chunk if needed (in() limit safety)
        const items: any[] = [];
        const chunk = 500;
        for (let i = 0; i < orderIds.length; i += chunk) {
          const slice = orderIds.slice(i, i + chunk);
          const { data: it } = await supabase
            .from("pos_order_items")
            .select("item_id, item_name, qty, line_total_tzs")
            .in("order_id", slice);
          if (it) items.push(...it);
        }
        const im = new Map<string, TopItemRow>();
        for (const r of items) {
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
          avg_ticket: billsClosed > 0 ? Math.round(gross / billsClosed) : 0,
          cash, card, comp_player: cp, comp_house: ch, player_charge: pc,
        },
        byWaiter: Array.from(wMap.values()).sort((a, b) => b.gross_tzs - a.gross_tzs),
        topItems,
      };
    },
  });
}
