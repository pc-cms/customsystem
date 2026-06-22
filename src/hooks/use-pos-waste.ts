/**
 * POS Waste / spoilage / operational-movement recording.
 * Uses the pos_record_waste RPC so cost snapshots are captured server-side.
 */
import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type WasteReason = "waste" | "spoilage" | "staff_consumption" | "damage" | "tasting";

export const WASTE_REASON_LABELS: Record<WasteReason, string> = {
  waste: "Waste",
  spoilage: "Spoilage",
  staff_consumption: "Staff consumption",
  damage: "Damage / breakage",
  tasting: "Tasting / QA",
};

export function usePosRecordWaste() {
  return useMutation({
    mutationFn: async (input: {
      item_id: string;
      qty: number;
      reason: WasteReason;
      notes?: string | null;
    }) => {
      const { data, error } = await (supabase as any).rpc("pos_record_waste", {
        _item_id: input.item_id,
        _qty: input.qty,
        _reason: input.reason,
        _notes: input.notes ?? null,
      });
      if (error) throw error;
      return data as string;
    },
  });
}

export function usePosBackfillCostSnapshots(casinoId: string | null) {
  return useMutation({
    mutationFn: async (params: {
      from?: string | null;
      to?: string | null;
      dryRun: boolean;
    }) => {
      const { data, error } = await (supabase as any).rpc("pos_backfill_cost_snapshots", {
        _casino_id: casinoId,
        _from_date: params.from || null,
        _to_date: params.to || null,
        _dry_run: params.dryRun,
      });
      if (error) throw error;
      return (data ?? []) as Array<{
        movement_id: string;
        item_id: string;
        old_unit_cost: number;
        new_unit_cost: number;
        old_cost_tzs: number;
        new_cost_tzs: number;
        backfilled: boolean;
      }>;
    },
  });
}
