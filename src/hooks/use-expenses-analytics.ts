import { useMemo } from "react";

interface Expense {
  id: string;
  category: string;
  amount: number;
  player_id: string | null;
  player_name?: string | null;
  description?: string | null;
  approved: boolean;
  created_at: string;
  source?: string | null;
  cage_type?: string | null;
  cage_slots_shift_id?: string | null;
  players?: { id?: string; first_name: string; last_name: string } | null;
}

export type ExpenseTarget = "all" | "casino" | "player";
export type ExpenseStatus = "all" | "approved" | "pending";
export type ExpenseSourceFilter = "all" | "live_game" | "slots" | "office";

const resolveSource = (e: Expense): "live_game" | "slots" | "office" => {
  const s = (e.source || "").toLowerCase();
  if (s === "office" || s === "slots" || s === "live_game") return s;
  if (e.cage_slots_shift_id || e.cage_type === "slots") return "slots";
  return "live_game";
};

export interface ExpenseFilters {
  from?: string;
  to?: string;
  categories?: string[];
  /** Filter by fin_categories.id (unified category system). */
  finCategoryIds?: string[];
  target?: ExpenseTarget;
  status?: ExpenseStatus;
  source?: ExpenseSourceFilter;
  search?: string;
}

export const useExpenseAnalytics = (
  expenses: Expense[],
  filters?: ExpenseFilters,
) => {
  return useMemo(() => {
    let filtered = expenses;

    if (filters?.from) {
      filtered = filtered.filter((e) => e.created_at >= `${filters.from}T00:00:00`);
    }
    if (filters?.to) {
      filtered = filtered.filter((e) => e.created_at <= `${filters.to}T23:59:59`);
    }
    if (filters?.categories && filters.categories.length > 0) {
      const set = new Set(filters.categories);
      filtered = filtered.filter((e) => set.has(e.category));
    }
    if (filters?.finCategoryIds && filters.finCategoryIds.length > 0) {
      const set = new Set(filters.finCategoryIds);
      filtered = filtered.filter((e: any) => e.fin_category_id && set.has(e.fin_category_id));
    }
    if (filters?.target && filters.target !== "all") {
      filtered = filtered.filter((e) =>
        filters.target === "player" ? !!e.player_id || !!e.player_name : !e.player_id && !e.player_name,
      );
    }
    if (filters?.status && filters.status !== "all") {
      filtered = filtered.filter((e) =>
        filters.status === "approved" ? e.approved : !e.approved,
      );
    }
    if (filters?.source && filters.source !== "all") {
      filtered = filtered.filter((e) => resolveSource(e) === filters.source);
    }
    if (filters?.search?.trim()) {
      const q = filters.search.trim().toLowerCase();
      filtered = filtered.filter((e) => {
        const pname = e.players
          ? `${e.players.first_name} ${e.players.last_name}`
          : e.player_name || "";
        return (
          pname.toLowerCase().includes(q) ||
          (e.description || "").toLowerCase().includes(q)
        );
      });
    }

    const totalAmount = filtered.reduce((s, e) => s + Number(e.amount), 0);
    const approvedAmount = filtered.filter((e) => e.approved).reduce((s, e) => s + Number(e.amount), 0);
    const pendingAmount = filtered.filter((e) => !e.approved).reduce((s, e) => s + Number(e.amount), 0);
    const pendingCount = filtered.filter((e) => !e.approved).length;

    // By category
    const byCategory: Record<string, { total: number; count: number }> = {};
    filtered.forEach((e) => {
      if (!byCategory[e.category]) byCategory[e.category] = { total: 0, count: 0 };
      byCategory[e.category].total += Number(e.amount);
      byCategory[e.category].count += 1;
    });

    // By source
    const bySource: Record<string, { total: number; count: number }> = {
      live_game: { total: 0, count: 0 },
      slots: { total: 0, count: 0 },
      office: { total: 0, count: 0 },
    };
    filtered.forEach((e) => {
      const s = resolveSource(e);
      bySource[s].total += Number(e.amount);
      bySource[s].count += 1;
    });


    // By player (only those linked to a player)
    const byPlayer: Record<string, { name: string; total: number; count: number }> = {};
    filtered
      .filter((e) => e.player_id && e.players)
      .forEach((e) => {
        const pid = e.player_id!;
        if (!byPlayer[pid]) {
          byPlayer[pid] = {
            name: `${e.players!.first_name} ${e.players!.last_name}`,
            total: 0,
            count: 0,
          };
        }
        byPlayer[pid].total += Number(e.amount);
        byPlayer[pid].count += 1;
      });

    const topPlayers = Object.entries(byPlayer)
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 10);

    // Bar charges (POS auto-generated) — break down per player
    const barCharges = filtered.filter((e) => e.category === "bar_charge");
    const barChargeTotal = barCharges.reduce((s, e) => s + Number(e.amount), 0);
    const barChargeCount = barCharges.length;

    const barByPlayer: Record<
      string,
      { player_id: string | null; name: string; total: number; count: number; last_at: string }
    > = {};
    barCharges.forEach((e) => {
      const key = e.player_id || `name:${e.player_name || "—"}`;
      const name = e.players
        ? `${e.players.first_name} ${e.players.last_name}`
        : e.player_name || "—";
      if (!barByPlayer[key]) {
        barByPlayer[key] = {
          player_id: e.player_id,
          name,
          total: 0,
          count: 0,
          last_at: e.created_at,
        };
      }
      barByPlayer[key].total += Number(e.amount);
      barByPlayer[key].count += 1;
      if (e.created_at > barByPlayer[key].last_at) barByPlayer[key].last_at = e.created_at;
    });
    const barChargesByPlayer = Object.values(barByPlayer).sort((a, b) => b.total - a.total);

    return {
      filtered,
      totalAmount,
      approvedAmount,
      pendingAmount,
      pendingCount,
      byCategory,
      bySource,
      topPlayers,
      barChargeTotal,
      barChargeCount,
      barChargesByPlayer,
    };
  }, [
    expenses,
    filters?.from,
    filters?.to,
    filters?.categories?.join(","),
    filters?.finCategoryIds?.join(","),
    filters?.target,
    filters?.status,
    filters?.source,
    filters?.search,
  ]);
};
