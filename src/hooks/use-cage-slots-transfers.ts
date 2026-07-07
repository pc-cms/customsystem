// ============================================================
// CAGE SLOTS — transfers (Fill, Collection, LG IN, LG OUT) +
// cross-cage approval workflow with Live Game cage.
// ============================================================
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { liveQueryOptions } from "@/lib/live-query-options";
import { toast } from "sonner";
import { formatNumberSpaces } from "@/lib/currency";
import { logAction } from "@/lib/logging";

export type SlotsTransferType = "fill" | "collection" | "lg_in" | "lg_out";
export type SlotsTransferRow = {
  id: string;
  casino_id: string;
  cage_slots_shift_id: string;
  transfer_type: SlotsTransferType;
  direction: "in" | "out";
  amount: number;
  note: string;
  operator_id: string;
  approved_by: string;
  counterpart_lg_shift_id: string | null;
  counterpart_lg_transfer_id: string | null;
  requires_approval: boolean;
  approved_at: string | null;
  approved_by_user: string | null;
  created_at: string;
};

export const SLOTS_TRANSFER_LABEL: Record<SlotsTransferType, string> = {
  fill: "Add Float",
  collection: "Collection",
  lg_in: "Cage LG IN",
  lg_out: "Live Game Out",
};

const DIRECTION_FOR_TYPE: Record<SlotsTransferType, "in" | "out"> = {
  fill: "in",
  collection: "out",
  lg_in: "in",
  lg_out: "out",
};

// ============ Query ============
export const useSlotsTransfers = (shiftId: string | undefined) => {
  return useQuery({
    queryKey: ["cage-slots-transfers", shiftId],
    queryFn: async () => {
      if (!shiftId) return [] as SlotsTransferRow[];
      const { data, error } = await (supabase as any)
        .from("cage_slots_transfers")
        .select("*")
        .eq("cage_slots_shift_id", shiftId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as SlotsTransferRow[];
    },
    enabled: !!shiftId,
    ...liveQueryOptions(),
  });
};

// ============ Create ============
export const useCreateSlotsTransfer = () => {
  const qc = useQueryClient();
  const { casinoId, user } = useAuth();

  return useMutation({
    mutationFn: async (input: {
      cage_slots_shift_id: string;
      transfer_type: SlotsTransferType;
      amount: number;
      note?: string;
      approved_by: string;            // manager id (= operator if no override)
      counterpart_lg_shift_id?: string | null;
    }) => {
      if (!casinoId || !user) throw new Error("Not authenticated");

      const requiresApproval = false;

      const nowIso = new Date().toISOString();

      // 1) Insert slots-side transfer
      const { data: slotsRow, error } = await (supabase as any)
        .from("cage_slots_transfers")
        .insert({
          casino_id: casinoId,
          cage_slots_shift_id: input.cage_slots_shift_id,
          transfer_type: input.transfer_type,
          direction: DIRECTION_FOR_TYPE[input.transfer_type],
          amount: input.amount,
          note: input.note ?? "",
          operator_id: user.id,
          approved_by: input.approved_by,
          counterpart_lg_shift_id: input.counterpart_lg_shift_id ?? null,
          requires_approval: requiresApproval,
          approved_at: nowIso,
          approved_by_user: user.id,
        })
        .select()
        .single();
      if (error) throw error;

      // NOTE: Cross-cage transfers are NO LONGER auto-mirrored to the other cage.
      // Each cashier records their own side independently to avoid phantom rows
      // and double-counting if the counterpart shift is wrong/closed.


      await logAction(casinoId, "system", "CAGE_SLOTS_TRANSFER_CREATED", {
        type: input.transfer_type, amount: input.amount, shift_id: input.cage_slots_shift_id,
      });
      return slotsRow as SlotsTransferRow;
    },
    onSuccess: (_d, vars) => {
      toast.success(`${SLOTS_TRANSFER_LABEL[vars.transfer_type]} recorded: TZS ${formatNumberSpaces(vars.amount)}`);
      qc.invalidateQueries({ queryKey: ["cage-slots-transfers"] });
      qc.invalidateQueries({ queryKey: ["cage-transfers"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

// ============ Approve a slots transfer (receiving side) ============
export const useApproveSlotsTransfer = () => {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: { id: string; counterpart_lg_id?: string | null }) => {
      if (!user) throw new Error("Not authenticated");
      const now = new Date().toISOString();
      const { error } = await (supabase as any)
        .from("cage_slots_transfers")
        .update({ approved_at: now, approved_by_user: user.id })
        .eq("id", input.id);
      if (error) throw error;
      if (input.counterpart_lg_id) {
        const { error: e2 } = await (supabase as any)
          .from("cage_transfers")
          .update({ approved_at: now, approved_by_user: user.id })
          .eq("id", input.counterpart_lg_id);
        if (e2) throw e2;
      }
    },
    onSuccess: () => {
      toast.success("Transfer approved");
      qc.invalidateQueries({ queryKey: ["cage-slots-transfers"] });
      qc.invalidateQueries({ queryKey: ["cage-transfers"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

// ============ Pending count for LG (cashier badge) ============
export const usePendingSlotsApprovals = (lgShiftId: string | undefined) => {
  return useQuery({
    queryKey: ["cage-slots-pending-for-lg", lgShiftId],
    queryFn: async () => {
      if (!lgShiftId) return 0;
      const { count, error } = await (supabase as any)
        .from("cage_slots_transfers")
        .select("id", { count: "exact", head: true })
        .eq("counterpart_lg_shift_id", lgShiftId)
        .eq("requires_approval", true)
        .is("approved_at", null);
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!lgShiftId,
    ...liveQueryOptions(),
  });
};
