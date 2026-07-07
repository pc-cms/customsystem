import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { offlineMutation } from "@/lib/offline-mutation";
import { toast } from "sonner";
import { formatNumberSpaces } from "@/lib/currency";
import type { Tables } from "@/integrations/supabase/types";
import type { SafeCageTransferInsert } from "@/lib/safe-inserts";
import { liveQueryOptions } from "@/lib/live-query-options";

export type CageTransferType = "add_float" | "collection" | "fill" | "credit" | "slots_out" | "slots_in";
export type CageTransferDirection = "cash_in" | "cash_out" | "chip_to_table" | "chip_from_table";

export type CageTransferRow = Tables<"cage_transfers">;

const DIRECTION_FOR_TYPE: Record<CageTransferType, CageTransferDirection> = {
  add_float: "cash_in",
  collection: "cash_out",
  fill: "chip_to_table",
  credit: "chip_from_table",
  slots_out: "cash_out",
  slots_in: "cash_in",
};

const LABELS: Record<CageTransferType, string> = {
  add_float: "Add Float",
  collection: "Collection",
  fill: "Fill",
  credit: "Credit",
  slots_out: "Slots Cage Out",
  slots_in: "Slots Cage In",
};

export const useCageTransfers = (shiftId?: string) => {
  const { casinoId } = useAuth();
  return useQuery({
    queryKey: ["cage-transfers", casinoId, shiftId],
    queryFn: async () => {
      if (!casinoId || !shiftId) return [] as CageTransferRow[];
      const { data, error } = await supabase
        .from("cage_transfers")
        .select("*")
        .eq("casino_id", casinoId)
        .eq("shift_id", shiftId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CageTransferRow[];
    },
    enabled: !!casinoId && !!shiftId,
    ...liveQueryOptions(),
  });
};

export const useCreateCageTransfer = () => {
  const qc = useQueryClient();
  const { casinoId, user } = useAuth();

  return useMutation({
    mutationFn: async (input: {
      transfer_type: CageTransferType;
      shift_id: string;
      amount: number;
      table_id?: string | null;
      chips?: Record<string, number> | null;
      note?: string;
      approved_by: string; // manager id (= operator_id when no override required)
    }) => {
      if (!casinoId || !user) throw new Error("Not authenticated");

      const payload: SafeCageTransferInsert = {
        casino_id: casinoId,
        shift_id: input.shift_id,
        transfer_type: input.transfer_type,
        direction: DIRECTION_FOR_TYPE[input.transfer_type],
        table_id: input.table_id ?? null,
        amount: input.amount,
        chips: input.chips ?? null,
        note: input.note ?? "",
        operator_id: user.id,
        approved_by: input.approved_by,
      };

      const result = await offlineMutation({
        table: "cage_transfers",
        operation: "insert",
        payload,
        meta: { transfer_type: input.transfer_type, amount: input.amount },
      });

      if (result.error) throw new Error(result.error);
      return { offline: result.offline };
    },
    onSuccess: (_data, vars) => {
      toast.success(`${LABELS[vars.transfer_type]} recorded: TZS ${formatNumberSpaces(vars.amount)}`);
      qc.invalidateQueries({ queryKey: ["cage-transfers"] });
      qc.invalidateQueries({ queryKey: ["chip-inventory"] });
    },
    onError: (e: Error) => {
      toast.error(e.message);
    },
  });
};

export const cageTransferLabel = (t: CageTransferType) => LABELS[t];
