// ============================================================
// INTER-CASINO transfers — paired wallet movements.
// Sender writes `transfer_out` (negative) immediately;
// the receiving casino confirms and a `transfer_in` (positive)
// is written to the chosen wallet. Reject / cancel reverses.
// ============================================================
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCasino } from "@/lib/casino-context";
import { invalidateFinance } from "@/lib/fin-invalidate";
import { toast } from "sonner";

export type InterCasinoStatus = "pending" | "accepted" | "rejected" | "cancelled";

export type InterCasinoTransfer = {
  id: string;
  from_casino_id: string;
  from_wallet_id: string;
  to_casino_id: string;
  to_wallet_id: string | null;
  amount: number;
  currency: string;
  business_date: string;
  note: string | null;
  status: InterCasinoStatus;
  resolution_note: string | null;
  created_at: string;
  accepted_at: string | null;
  from_casino?: { name: string; slug: string } | null;
  to_casino?: { name: string; slug: string } | null;
  from_wallet?: { name: string; currency: string } | null;
  to_wallet?: { name: string; currency: string } | null;
};

export const useInterCasinoTransfers = () => {
  const { activeCasinoId, isSummaryMode } = useCasino();
  return useQuery({
    queryKey: ["inter-casino-transfers", isSummaryMode ? "all" : activeCasinoId],
    queryFn: async () => {
      let q = (supabase as any)
        .from("fin_inter_casino_transfers")
        .select(
          "*, from_casino:casinos!fin_inter_casino_transfers_from_casino_id_fkey(name, slug), to_casino:casinos!fin_inter_casino_transfers_to_casino_id_fkey(name, slug), from_wallet:fin_wallets!fin_inter_casino_transfers_from_wallet_id_fkey(name, currency), to_wallet:fin_wallets!fin_inter_casino_transfers_to_wallet_id_fkey(name, currency)",
        )
        .order("business_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(300);
      if (!isSummaryMode && activeCasinoId) {
        q = q.or(`from_casino_id.eq.${activeCasinoId},to_casino_id.eq.${activeCasinoId}`);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as InterCasinoTransfer[];
    },
    enabled: isSummaryMode || !!activeCasinoId,
  });
};

const useFinanceInvalidate = () => {
  const qc = useQueryClient();
  return () => {
    invalidateFinance(qc);
    qc.invalidateQueries({ queryKey: ["inter-casino-transfers"] });
  };
};

export const useSendInterCasino = () => {
  const invalidate = useFinanceInvalidate();
  return useMutation({
    mutationFn: async (input: {
      from_wallet_id: string;
      to_casino_id: string;
      amount: number;
      business_date: string;
      note?: string;
    }) => {
      const { data, error } = await (supabase as any).rpc("fin_inter_casino_send", {
        _from_wallet_id: input.from_wallet_id,
        _to_casino_id: input.to_casino_id,
        _amount: input.amount,
        _business_date: input.business_date,
        _note: input.note ?? null,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      toast.success("Transfer sent — awaiting confirmation");
      invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });
};

export const useAcceptInterCasino = () => {
  const invalidate = useFinanceInvalidate();
  return useMutation({
    mutationFn: async (input: { transfer_id: string; to_wallet_id: string }) => {
      const { error } = await (supabase as any).rpc("fin_inter_casino_accept", {
        _transfer_id: input.transfer_id,
        _to_wallet_id: input.to_wallet_id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Transfer received");
      invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });
};

export const useResolveInterCasino = () => {
  const invalidate = useFinanceInvalidate();
  return useMutation({
    mutationFn: async (input: { transfer_id: string; action: "rejected" | "cancelled"; reason?: string }) => {
      const { error } = await (supabase as any).rpc("fin_inter_casino_resolve", {
        _transfer_id: input.transfer_id,
        _action: input.action,
        _reason: input.reason ?? null,
      });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      toast.success(vars.action === "rejected" ? "Transfer rejected" : "Transfer cancelled");
      invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });
};
