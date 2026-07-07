// ============================================================
// CAGE SLOTS — hooks (queries + mutations)
// Mirrors patterns from Live Game Cage (use-shift.ts) but for slots only.
// ============================================================
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { liveQueryOptions, liveQueryOptionsWithFallback } from "@/lib/live-query-options";
import { logAction } from "@/lib/logging";
import { toast } from "sonner";
import { offlineMutation } from "@/lib/offline-mutation";
import { useEffectiveBusinessDate } from "@/hooks/use-business-day-closure";

export type SlotsShiftType = "day" | "night";
export type SlotsStatus = "draft" | "open" | "ready_for_review" | "approved" | "closed" | "reversed";
export type SlotsInventoryType = "opening" | "closing";
export type SlotsCountType = "opening" | "check" | "closing";

// ============ Settings ============
export const useCageSlotsSettings = () => {
  const { casinoId } = useAuth();
  return useQuery({
    queryKey: ["cage-slots-settings", casinoId],
    queryFn: async () => {
      if (!casinoId) return null;
      const { data, error } = await supabase
        .from("cage_slots_settings")
        .select("*")
        .eq("casino_id", casinoId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!casinoId,
    ...liveQueryOptions(),
  });
};

// ============ Active shift ============
export const useActiveCageSlotsShift = () => {
  const { casinoId } = useAuth();
  return useQuery({
    queryKey: ["cage-slots-active-shift", casinoId],
    queryFn: async () => {
      if (!casinoId) return null;
      const { data, error } = await supabase
        .from("cage_slots_shifts")
        .select("*")
        .eq("casino_id", casinoId)
        .in("status", ["open", "ready_for_review"])
        .order("opened_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!casinoId,
    ...liveQueryOptions(),
  });
};

// ============ Shift detail ============
export const useCageSlotsShift = (shiftId: string | undefined) => {
  return useQuery({
    queryKey: ["cage-slots-shift", shiftId],
    queryFn: async () => {
      if (!shiftId) return null;
      const { data, error } = await supabase
        .from("cage_slots_shifts")
        .select("*")
        .eq("id", shiftId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!shiftId,
    refetchInterval: 15_000,
  });
};

// ============ History ============
export const useCageSlotsHistory = (limit = 60) => {
  const { casinoId } = useAuth();
  return useQuery({
    queryKey: ["cage-slots-history", casinoId, limit],
    queryFn: async () => {
      if (!casinoId) return [];
      const { data, error } = await supabase
        .from("cage_slots_shifts")
        .select("*")
        .eq("casino_id", casinoId)
        .order("business_date", { ascending: false })
        .order("opened_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data || [];
    },
    enabled: !!casinoId,
  });
};

// ============ Children: exchange rates ============
export const useSlotsRates = (shiftId: string | undefined) => {
  return useQuery({
    queryKey: ["cage-slots-rates", shiftId],
    queryFn: async () => {
      if (!shiftId) return [];
      const { data, error } = await supabase
        .from("cage_slots_exchange_rates")
        .select("*")
        .eq("cage_slots_shift_id", shiftId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!shiftId,
  });
};

// ============ Children: cash inventory ============
export const useSlotsInventory = (shiftId: string | undefined) => {
  return useQuery({
    queryKey: ["cage-slots-inventory", shiftId],
    queryFn: async () => {
      if (!shiftId) return [];
      const { data, error } = await supabase
        .from("cage_slots_cash_inventory")
        .select("*")
        .eq("cage_slots_shift_id", shiftId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!shiftId,
  });
};

// ============ Children: cards ============
export const useSlotsCards = (shiftId: string | undefined) => {
  return useQuery({
    queryKey: ["cage-slots-cards", shiftId],
    queryFn: async () => {
      if (!shiftId) return null;
      const { data, error } = await supabase
        .from("cage_slots_cards")
        .select("*")
        .eq("cage_slots_shift_id", shiftId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!shiftId,
  });
};

// ============ Carry-over: last closed slots shift's closing card count ============
// Used to prefill opening cards when opening a new slots shift, analog of
// chip carry-over in Live Game cage.
export const useLastClosedSlotsCards = () => {
  const { casinoId } = useAuth();
  return useQuery({
    queryKey: ["cage-slots-last-closed-cards", casinoId],
    queryFn: async () => {
      if (!casinoId) return null;
      const { data: lastShifts, error: e1 } = await supabase
        .from("cage_slots_shifts")
        .select("id, closed_at, opened_at")
        .eq("casino_id", casinoId)
        .in("status", ["closed", "approved", "ready_for_review"])
        .order("closed_at", { ascending: false, nullsFirst: false })
        .order("opened_at", { ascending: false })
        .limit(5);
      if (e1) throw e1;
      const ids = (lastShifts || []).map((s: any) => s.id);
      if (!ids.length) return null;
      const { data: cardsRows, error: e2 } = await supabase
        .from("cage_slots_cards")
        .select("cage_slots_shift_id, closing_card_count, card_deposit_value_tzs")
        .in("cage_slots_shift_id", ids);
      if (e2) throw e2;
      for (const s of (lastShifts || [])) {
        const c = (cardsRows || []).find((r: any) => r.cage_slots_shift_id === s.id);
        if (c && c.closing_card_count != null) {
          return {
            closing_card_count: Number(c.closing_card_count) || 0,
            card_deposit_value_tzs: Number(c.card_deposit_value_tzs) || 0,
          };
        }
      }
      return null;
    },
    enabled: !!casinoId,
    staleTime: 30_000,
  });
};

// ============ Children: cash counts ============
export const useSlotsCashCounts = (shiftId: string | undefined) => {
  return useQuery({
    queryKey: ["cage-slots-cash-counts", shiftId],
    queryFn: async () => {
      if (!shiftId) return [];
      // Limit to the most recent 50 snapshots — UI only ever needs the latest
      // few; unbounded fetch dragged Cage Slots open by seconds on cold cache.
      const { data, error } = await supabase
        .from("cage_slots_cash_counts")
        .select("*")
        .eq("cage_slots_shift_id", shiftId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
    enabled: !!shiftId,
    staleTime: 5_000,
  });
};

// ============ Children: comments ============
export const useSlotsComments = (shiftId: string | undefined) => {
  return useQuery({
    queryKey: ["cage-slots-comments", shiftId],
    queryFn: async () => {
      if (!shiftId) return [];
      const { data, error } = await supabase
        .from("cage_slots_comments")
        .select("*")
        .eq("cage_slots_shift_id", shiftId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!shiftId,
  });
};

// ============ Children: cashless (scoped to shift) ============
export const useSlotsCashless = (shiftId: string | undefined) => {
  return useQuery({
    queryKey: ["cage-slots-cashless", shiftId],
    queryFn: async () => {
      if (!shiftId) return [];
      const { data, error } = await (supabase as any)
        .from("cashless_transactions")
        .select("*, players(first_name,last_name)")
        .eq("cage_slots_shift_id", shiftId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!shiftId,
  });
};

// ============ Cashless aggregation across many slots shifts (for History) ============
export type SlotsCashlessAgg = {
  in: number; out: number; net: number;
  providers: Record<string, { in: number; out: number }>;
};
export const useSlotsCashlessAggByShift = (shiftIds: string[]) => {
  const key = shiftIds.slice().sort().join(",");
  return useQuery({
    queryKey: ["cage-slots-cashless-agg", key],
    queryFn: async () => {
      const out: Record<string, SlotsCashlessAgg> = {};
      if (!shiftIds.length) return out;
      const { data, error } = await (supabase as any)
        .from("cashless_transactions")
        .select("cage_slots_shift_id, direction, provider, amount")
        .in("cage_slots_shift_id", shiftIds);
      if (error) throw error;
      (data || []).forEach((t: any) => {
        const sid = t.cage_slots_shift_id;
        if (!sid) return;
        const a = (out[sid] ||= { in: 0, out: 0, net: 0, providers: {} });
        const p = String(t.provider || "").toUpperCase();
        const amt = Number(t.amount || 0);
        const pv = (a.providers[p] ||= { in: 0, out: 0 });
        if (t.direction === "IN") { a.in += amt; pv.in += amt; }
        else if (t.direction === "OUT") { a.out += amt; pv.out += amt; }
      });
      Object.values(out).forEach(a => { a.net = a.in - a.out; });
      return out;
    },
    enabled: shiftIds.length > 0,
    staleTime: 30_000,
  });
};

// ============ Closing totals across many shifts (for History fallbacks) ============
export type SlotsClosingTotals = {
  shift_balance: number | null;
  cashless_in: number;
  cashless_out: number;
};
export const useSlotsClosingTotalsByShift = (shiftIds: string[]) => {
  const key = shiftIds.slice().sort().join(",");
  return useQuery({
    queryKey: ["cage-slots-closing-totals", key],
    queryFn: async () => {
      const out: Record<string, SlotsClosingTotals> = {};
      if (!shiftIds.length) return out;
      const { data, error } = await supabase
        .from("cage_slots_cash_counts")
        .select("cage_slots_shift_id, denominations, created_at")
        .in("cage_slots_shift_id", shiftIds)
        .order("created_at", { ascending: false });
      if (error) throw error;
      // Pick latest non-opening (closing/review) per shift
      const seen = new Set<string>();
      (data || []).forEach((r: any) => {
        const sid = r.cage_slots_shift_id;
        if (!sid || seen.has(sid)) return;
        const d = (r.denominations as any) || {};
        if (d.is_opening) return;
        const t = (d.totals as any) || {};
        seen.add(sid);
        out[sid] = {
          shift_balance: t.shift_balance ?? t.balance ?? null,
          cashless_in: Number(t.cashless_in || 0),
          cashless_out: Number(t.cashless_out || 0),
        };
      });
      return out;
    },
    enabled: shiftIds.length > 0,
    staleTime: 30_000,
  });
};

// ============ Mutation: open shift ============
export const useOpenSlotsShift = () => {
  const qc = useQueryClient();
  const { casinoId, user } = useAuth();
  const { data: businessDate } = useEffectiveBusinessDate();

  return useMutation({
    mutationFn: async (input: {
      shift_type: SlotsShiftType;
      exchange_rates: Record<string, number>;
      opening_cash: Array<{ currency: string; denomination: number; quantity: number }>;
      opening_card_count: number;
      card_deposit_value_tzs: number;
    }) => {
      if (!casinoId || !user) throw new Error("Not authenticated");
      const bd = businessDate || new Date().toISOString().slice(0, 10);

      const { data: shift, error: e1 } = await supabase
        .from("cage_slots_shifts")
        .insert({
          casino_id: casinoId,
          business_date: bd,
          shift_type: input.shift_type,
          cashier_id: user.id,
          opened_by: user.id,
          status: "open",
          client_uuid: crypto.randomUUID(),
        } as any)
        .select()
        .single();
      if (e1) {
        if (e1.message?.includes("uq_cage_slots_one_open_per_slot")) {
          throw new Error("A slots shift is already open for this date/type");
        }
        throw e1;
      }

      // Rates
      const rateRows = Object.entries(input.exchange_rates).map(([code, rate]) => ({
        cage_slots_shift_id: shift.id,
        casino_id: casinoId,
        currency_code: code,
        rate_to_tzs: rate,
      }));
      if (rateRows.length) {
        const { error } = await supabase.from("cage_slots_exchange_rates").insert(rateRows as any);
        if (error) throw error;
      }

      // Opening cash inventory
      const invRows = input.opening_cash
        .filter(r => r.quantity > 0)
        .map(r => ({
          cage_slots_shift_id: shift.id,
          casino_id: casinoId,
          inventory_type: "opening" as SlotsInventoryType,
          currency_code: r.currency,
          denomination: r.denomination,
          quantity: r.quantity,
          rate_to_tzs: input.exchange_rates[r.currency] || (r.currency === "TZS" ? 1 : 0),
          created_by: user.id,
        }));
      if (invRows.length) {
        const { error } = await supabase.from("cage_slots_cash_inventory").insert(invRows as any);
        if (error) throw error;
      }

      // Opening cards (single 1:1 row)
      {
        const { error } = await supabase.from("cage_slots_cards").insert({
          cage_slots_shift_id: shift.id,
          casino_id: casinoId,
          opening_card_count: input.opening_card_count,
          card_deposit_value_tzs: input.card_deposit_value_tzs,
        } as any);
        if (error) throw error;
      }

      // Carry-over banks/mobile from the previous slots shift's last check.
      // These balances persist physically across shifts; if we don't capture
      // them as opening baseline, every mid-shift check reports a false
      // +balance equal to whatever sits on bank/mobile accounts.
      let carryBanks: any = { tzs: 0, usd: 0 };
      let carryMobile: any = {};
      try {
        const { data: prev } = await supabase
          .from("cage_slots_cash_counts")
          .select("denominations")
          .eq("casino_id", casinoId)
          .neq("cage_slots_shift_id", shift.id)
          .order("created_at", { ascending: false })
          .limit(20);
        const last = (prev || []).find((r: any) => {
          const d = r.denominations || {};
          return d.bank || d.mobile;
        }) as any;
        if (last) {
          carryBanks = last.denominations?.bank || carryBanks;
          carryMobile = last.denominations?.mobile || carryMobile;
        }
      } catch { /* non-fatal */ }

      const carryBanksTzs = (Number(carryBanks?.tzs) || 0)
        + (Number(carryBanks?.usd) || 0) * (input.exchange_rates["USD"] || 0);
      const carryMobileTzs: number = Object.values(carryMobile || {})
        .reduce<number>((s, v) => s + (Number(v) || 0), 0);

      // Opening cash check snapshot (seed) — cash + carry-over bank/mobile.
      // Cards are a plastic counter, NOT money — excluded from opening TZS total.
      const openingTotal = invRows.reduce((s, r) => s + r.denomination * r.quantity * r.rate_to_tzs, 0)
        + carryBanksTzs + carryMobileTzs;
      try {
        await supabase.from("cage_slots_cash_counts").insert({
          cage_slots_shift_id: shift.id,
          casino_id: casinoId,
          count_type: "check" as SlotsCountType,
          counted_by: user.id,
          denominations: {
            cash: input.opening_cash,
            cards: { count: input.opening_card_count, value_tzs: input.card_deposit_value_tzs },
            bank: carryBanks,
            mobile: carryMobile,
            rateMap: input.exchange_rates,
            totals: { total_tzs: openingTotal, is_opening: true },
            is_opening: true,
          } as any,
          total_tzs: openingTotal,
          note: "Opening snapshot",
        } as any);
      } catch (e) {
        console.error("seed opening check failed", e);
      }

      await logAction(casinoId, "system", "CAGE_SLOTS_SHIFT_OPENED", { shift_id: shift.id, shift_type: input.shift_type });
      return shift;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cage-slots-active-shift"] });
      qc.invalidateQueries({ queryKey: ["cage-slots-history"] });
      toast.success("Slots shift opened");
    },
    onError: (e: any) => toast.error(e.message),
  });
};

// ============ Mutation: update system result ============
export const useUpdateSlotsSystemResult = () => {
  const qc = useQueryClient();
  const { casinoId } = useAuth();
  return useMutation({
    mutationFn: async (input: { shift_id: string; system_shift_result: number }) => {
      const { error } = await supabase
        .from("cage_slots_shifts")
        .update({ system_shift_result: input.system_shift_result } as any)
        .eq("id", input.shift_id);
      if (error) throw error;
      if (casinoId) {
        await logAction(casinoId, "edit", "CAGE_SLOTS_SYSTEM_RESULT_SET", {
          shift_id: input.shift_id, value: input.system_shift_result,
        });
      }
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["cage-slots-shift", vars.shift_id] });
      qc.invalidateQueries({ queryKey: ["cage-slots-active-shift"] });
    },
    onError: (e: any) => toast.error(e.message),
  });
};

// ============ Mutation: set closing cash inventory row ============
export const useUpsertSlotsInventory = () => {
  const qc = useQueryClient();
  const { casinoId, user } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      shift_id: string;
      inventory_type: SlotsInventoryType;
      currency: string;
      denomination: number;
      quantity: number;
      rate_to_tzs: number;
    }) => {
      if (!casinoId || !user) throw new Error("Not authenticated");
      const payload = {
        cage_slots_shift_id: input.shift_id,
        casino_id: casinoId,
        inventory_type: input.inventory_type,
        currency_code: input.currency,
        denomination: input.denomination,
        quantity: input.quantity,
        rate_to_tzs: input.rate_to_tzs,
        created_by: user.id,
      } as any;
      const { error } = await supabase
        .from("cage_slots_cash_inventory")
        .upsert(payload, {
          onConflict: "cage_slots_shift_id,inventory_type,currency_code,denomination",
        });
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["cage-slots-inventory", vars.shift_id] });
      qc.invalidateQueries({ queryKey: ["cage-slots-shift", vars.shift_id] });
    },
    onError: (e: any) => toast.error(e.message),
  });
};

// ============ Mutation: update cards (closing) ============
export const useUpdateSlotsCards = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      shift_id: string;
      closing_card_count: number;
    }) => {
      const { error } = await supabase
        .from("cage_slots_cards")
        .update({ closing_card_count: input.closing_card_count } as any)
        .eq("cage_slots_shift_id", input.shift_id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["cage-slots-cards", vars.shift_id] });
      qc.invalidateQueries({ queryKey: ["cage-slots-shift", vars.shift_id] });
    },
    onError: (e: any) => toast.error(e.message),
  });
};

// ============ Mutation: cash check snapshot ============
export const useCreateSlotsCashCount = () => {
  const qc = useQueryClient();
  const { casinoId, user } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      shift_id: string;
      count_type: SlotsCountType;
      denominations: Record<string, any>;
      total_tzs: number;
      note?: string;
    }) => {
      if (!casinoId || !user) throw new Error("Not authenticated");
      const { error } = await supabase.from("cage_slots_cash_counts").insert({
        cage_slots_shift_id: input.shift_id,
        casino_id: casinoId,
        count_type: input.count_type,
        denominations: input.denominations as any,
        total_tzs: input.total_tzs,
        counted_by: user.id,
        note: input.note || null,
      } as any);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["cage-slots-cash-counts", vars.shift_id] });
      toast.success("Cash check recorded");
    },
    onError: (e: any) => toast.error(e.message),
  });
};

// ============ Mutation: submit for review (closing check) ============
export const useSubmitSlotsForReview = () => {
  const qc = useQueryClient();
  const { casinoId, user } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      shift_id: string;
      closing_total_tzs: number;
      closing_denominations: Record<string, any>;
      cashier_note?: string;
    }) => {
      if (!casinoId || !user) throw new Error("Not authenticated");
      // Persist closing snapshot as a "check" so it appears in cash checks history
      const closingTotal = Number(input.closing_total_tzs) || 0;
      await supabase.from("cage_slots_cash_counts").insert({
        cage_slots_shift_id: input.shift_id,
        casino_id: casinoId,
        count_type: "check" as SlotsCountType,
        denominations: {
          ...input.closing_denominations,
          is_closing: true,
          totals: { ...(input.closing_denominations.totals || {}), total_tzs: closingTotal, is_closing: true },
        } as any,
        total_tzs: closingTotal,
        counted_by: user.id,
        note: "Closing snapshot",
      } as any);

      const { error } = await supabase
        .from("cage_slots_shifts")
        .update({
          status: "ready_for_review",
          submitted_at: new Date().toISOString(),
          cashier_note: input.cashier_note || null,
          cashless_in_providers: input.closing_denominations.cashless_in_providers || {},
          cashless_out_providers: input.closing_denominations.cashless_out_providers || {},
          cashless_final_providers: input.closing_denominations.cashless_final_providers || {},
          cashless_final: Number(input.closing_denominations.totals?.cashless_final) || 0,
        } as any)
        .eq("id", input.shift_id);
      if (error) throw error;

      await logAction(casinoId, "system", "CAGE_SLOTS_SHIFT_SUBMITTED", { shift_id: input.shift_id });
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["cage-slots-active-shift"] });
      qc.invalidateQueries({ queryKey: ["cage-slots-shift", vars.shift_id] });
      qc.invalidateQueries({ queryKey: ["cage-slots-history"] });
      toast.success("Submitted for manager review");
    },
    onError: (e: any) => toast.error(e.message),
  });
};

// ============ Mutation: cancel submit (manager reopens for cashier edits) ============
export const useReopenSlotsShift = () => {
  const qc = useQueryClient();
  const { casinoId, user } = useAuth();
  return useMutation({
    mutationFn: async (input: { shift_id: string }) => {
      if (!casinoId || !user) throw new Error("Not authenticated");
      const { error } = await supabase
        .from("cage_slots_shifts")
        .update({ status: "open", submitted_at: null } as any)
        .eq("id", input.shift_id);
      if (error) throw error;
      await logAction(casinoId, "system", "CAGE_SLOTS_SHIFT_REOPENED", { shift_id: input.shift_id });
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["cage-slots-active-shift"] });
      qc.invalidateQueries({ queryKey: ["cage-slots-shift", vars.shift_id] });
      toast.success("Returned to cashier for edits");
    },
    onError: (e: any) => toast.error(e.message),
  });
};


// ============ Mutation: manager approve & close ============
export const useApproveSlotsShift = () => {
  const qc = useQueryClient();
  const { casinoId, user } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      shift_id: string;
      manager_comment?: string;
      manager_id: string;
    }) => {
      if (!casinoId || !user) throw new Error("Not authenticated");
      if (input.manager_comment) {
        await supabase.from("cage_slots_comments").insert({
          cage_slots_shift_id: input.shift_id,
          casino_id: casinoId,
          comment_type: "manager_comment",
          comment_text: input.manager_comment,
          created_by: input.manager_id,
        } as any);
      }
      const { error } = await supabase
        .from("cage_slots_shifts")
        .update({
          status: "closed",
          reviewed_by: input.manager_id,
          reviewed_at: new Date().toISOString(),
          closed_by: input.manager_id,
          closed_at: new Date().toISOString(),
          manager_comment: input.manager_comment || null,
        } as any)
        .eq("id", input.shift_id);
      if (error) throw error;

      // Seed a "review" snapshot mirroring the latest closing check so it appears in history
      try {
        const { data: lastCheck } = await supabase
          .from("cage_slots_cash_counts")
          .select("denominations,total_tzs")
          .eq("cage_slots_shift_id", input.shift_id)
          .eq("count_type", "check")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        const denoms: any = (lastCheck?.denominations as any) || {};
        await supabase.from("cage_slots_cash_counts").insert({
          cage_slots_shift_id: input.shift_id,
          casino_id: casinoId,
          count_type: "check" as SlotsCountType,
          counted_by: input.manager_id,
          denominations: {
            ...denoms,
            is_review: true,
            is_opening: false,
            is_closing: false,
            totals: { ...(denoms.totals || {}), is_review: true },
          } as any,
          total_tzs: Number(lastCheck?.total_tzs) || 0,
          note: input.manager_comment ? `Manager review: ${input.manager_comment}` : "Manager review",
        } as any);
      } catch (e) {
        console.error("seed review check failed", e);
      }

      await logAction(casinoId, "system", "CAGE_SLOTS_SHIFT_CLOSED", {
        shift_id: input.shift_id, manager_id: input.manager_id,
      });
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["cage-slots-active-shift"] });
      qc.invalidateQueries({ queryKey: ["cage-slots-shift", vars.shift_id] });
      qc.invalidateQueries({ queryKey: ["cage-slots-history"] });
      toast.success("Slots shift closed");
    },
    onError: (e: any) => toast.error(e.message),
  });
};

// ============ Mutation: reverse a closed shift ============
export const useReverseSlotsShift = () => {
  const qc = useQueryClient();
  const { casinoId, user } = useAuth();
  return useMutation({
    mutationFn: async (input: { shift_id: string; reason: string; manager_id: string }) => {
      if (!casinoId || !user) throw new Error("Not authenticated");
      const { error } = await supabase
        .from("cage_slots_shifts")
        .update({ status: "reversed" } as any)
        .eq("id", input.shift_id);
      if (error) throw error;
      await supabase.from("cage_slots_comments").insert({
        cage_slots_shift_id: input.shift_id,
        casino_id: casinoId,
        comment_type: "reversal_reason",
        comment_text: input.reason,
        created_by: input.manager_id,
      } as any);
      await logAction(casinoId, "system", "CAGE_SLOTS_SHIFT_REVERSED", {
        shift_id: input.shift_id, manager_id: input.manager_id, reason: input.reason,
      });
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["cage-slots-active-shift"] });
      qc.invalidateQueries({ queryKey: ["cage-slots-shift", vars.shift_id] });
      qc.invalidateQueries({ queryKey: ["cage-slots-history"] });
      toast.success("Shift reversed");
    },
    onError: (e: any) => toast.error(e.message),
  });
};

// ============ Mutation: create cashless tied to shift ============
export const useCreateSlotsCashless = () => {
  const qc = useQueryClient();
  const { casinoId, user } = useAuth();
  const { data: businessDate } = useEffectiveBusinessDate();
  return useMutation({
    mutationFn: async (input: {
      shift_id: string;
      direction: "IN" | "OUT";
      provider: "AIRTEL" | "MPESA" | "TIGO" | "HALOTEL";
      player_id?: string | null;
      player_name: string;
      amount: number;
      reference?: string;
      note?: string;
    }) => {
      if (!casinoId || !user) throw new Error("Not authenticated");
      const bd = businessDate || new Date().toISOString().slice(0, 10);
      const { error } = await (supabase as any).from("cashless_transactions").insert({
        casino_id: casinoId,
        operator_id: user.id,
        business_date: bd,
        direction: input.direction,
        provider: input.provider,
        player_id: input.player_id ?? null,
        player_name: input.player_name,
        amount: input.amount,
        currency: "TZS",
        reference: input.reference || "",
        note: input.note || "",
        cage_type: "slots",
        cage_slots_shift_id: input.shift_id,
        source_module: "cage_slots",
      });
      if (error) throw error;
      await logAction(casinoId, "expense", "CAGE_SLOTS_CASHLESS_CREATED", {
        shift_id: input.shift_id, direction: input.direction, amount: input.amount,
      });
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["cage-slots-cashless", vars.shift_id] });
      qc.invalidateQueries({ queryKey: ["cage-slots-shift", vars.shift_id] });
    },
    onError: (e: any) => toast.error(e.message),
  });
};
