/**
 * M11 — Player Bar Analytics.
 * Aggregates F&B consumption per player from pos_tabs + pos_order_items.
 * Manual scope only: read-only aggregates scoped by casino + business date range.
 */
import { useQuery } from "@tanstack/react-query";
import { liveQueryOptions, liveQueryOptionsWithFallback } from "@/lib/live-query-options";
import { supabase } from "@/integrations/supabase/client";
import type { PaymentSplit } from "@/hooks/use-pos-tabs";

export type PosPlayerRange = { from: string; to: string };

export type PlayerSpendRow = {
  player_id: string;
  player_name: string;
  bills: number;
  gross_tzs: number;
  cash: number;
  card: number;
  comp_player: number;
  comp_house: number;
  player_charge: number;
  last_visit: string | null;
};

export type PlayerItemRow = {
  item_id: string;
  item_name: string;
  qty: number;
  revenue_tzs: number;
};

export type PlayerAnalytics = {
  totals: {
    players: number;
    bills: number;
    gross_tzs: number;
    avg_per_player: number;
  };
  rows: PlayerSpendRow[];
};

export function usePosPlayerAnalytics(
  casinoId: string | null,
  range: PosPlayerRange,
) {
  return useQuery({
    queryKey: ["pos-player-analytics", casinoId, range.from, range.to],
    enabled: !!casinoId && !!range.from && !!range.to,
    ...liveQueryOptionsWithFallback(30000),
    queryFn: async (): Promise<PlayerAnalytics> => {
      const { data: tabs, error } = await supabase
        .from("pos_tabs")
        .select("id, status, total_tzs, payment_split, player_id, business_date, opened_at")
        .eq("casino_id", casinoId!)
        .eq("status", "closed")
        .not("player_id", "is", null)
        .gte("business_date", range.from)
        .lte("business_date", range.to);
      if (error) throw error;

      const ids = Array.from(new Set((tabs ?? []).map(t => t.player_id as string)));
      const names = new Map<string, string>();
      if (ids.length > 0) {
        const { data: pls } = await supabase
          .from("players")
          .select("id, first_name, last_name")
          .in("id", ids);
        (pls ?? []).forEach((p: any) =>
          names.set(p.id, [p.first_name, p.last_name].filter(Boolean).join(" ") || "—"),
        );
      }

      const map = new Map<string, PlayerSpendRow>();
      let gross = 0, bills = 0;
      for (const t of tabs ?? []) {
        const pid = t.player_id as string;
        const ps = (t.payment_split as PaymentSplit | null) ?? {};
        const total = Number(t.total_tzs) || 0;
        gross += total;
        bills += 1;
        let row = map.get(pid);
        if (!row) {
          row = {
            player_id: pid,
            player_name: names.get(pid) ?? "—",
            bills: 0, gross_tzs: 0,
            cash: 0, card: 0, comp_player: 0, comp_house: 0, player_charge: 0,
            last_visit: null,
          };
          map.set(pid, row);
        }
        row.bills += 1;
        row.gross_tzs += total;
        row.cash += Number(ps.cash) || 0;
        row.card += Number(ps.card) || 0;
        row.comp_player += Number(ps.comp_player) || 0;
        row.comp_house += Number(ps.comp_house) || 0;
        row.player_charge += Number(ps.player_charge) || 0;
        const visit = (t.opened_at as string) ?? null;
        if (visit && (!row.last_visit || visit > row.last_visit)) row.last_visit = visit;
      }

      const rows = Array.from(map.values()).sort((a, b) => b.gross_tzs - a.gross_tzs);

      return {
        totals: {
          players: rows.length,
          bills,
          gross_tzs: gross,
          avg_per_player: rows.length > 0 ? Math.round(gross / rows.length) : 0,
        },
        rows,
      };
    },
  });
}

/** Per-player consumption — top items, scoped to date range. */
export function usePosPlayerItems(
  casinoId: string | null,
  playerId: string | null,
  range: PosPlayerRange,
) {
  return useQuery({
    queryKey: ["pos-player-items", casinoId, playerId, range.from, range.to],
    enabled: !!casinoId && !!playerId && !!range.from && !!range.to,
    ...liveQueryOptionsWithFallback(30000),
    queryFn: async (): Promise<PlayerItemRow[]> => {
      const { data: tabs } = await supabase
        .from("pos_tabs")
        .select("id")
        .eq("casino_id", casinoId!)
        .eq("status", "closed")
        .eq("player_id", playerId!)
        .gte("business_date", range.from)
        .lte("business_date", range.to);

      const tabIds = (tabs ?? []).map(t => t.id);
      if (tabIds.length === 0) return [];

      // Orders for these tabs
      const orderIds: string[] = [];
      const chunk = 200;
      for (let i = 0; i < tabIds.length; i += chunk) {
        const { data: ords } = await supabase
          .from("pos_orders")
          .select("id")
          .in("tab_id", tabIds.slice(i, i + chunk))
          .neq("status", "void");
        (ords ?? []).forEach(o => orderIds.push(o.id));
      }
      if (orderIds.length === 0) return [];

      const items: any[] = [];
      for (let i = 0; i < orderIds.length; i += chunk) {
        const { data: it } = await supabase
          .from("pos_order_items")
          .select("item_id, item_name, qty, line_total_tzs")
          .in("order_id", orderIds.slice(i, i + chunk));
        if (it) items.push(...it);
      }

      const m = new Map<string, PlayerItemRow>();
      for (const r of items) {
        const cur = m.get(r.item_id) || {
          item_id: r.item_id, item_name: r.item_name, qty: 0, revenue_tzs: 0,
        };
        cur.qty += Number(r.qty) || 0;
        cur.revenue_tzs += Number(r.line_total_tzs) || 0;
        m.set(r.item_id, cur);
      }
      return Array.from(m.values()).sort((a, b) => b.revenue_tzs - a.revenue_tzs);
    },
  });
}
