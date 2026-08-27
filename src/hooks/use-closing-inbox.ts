/**
 * Closing Wallet Inbox — money balances handed over from the closed business
 * day (LIVE cashdesk + SLOTS cashdesk) into Office wallets.
 * Chips and player cards are intentionally excluded (own flows).
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { liveQueryOptions } from "@/lib/live-query-options";
import { supabase } from "@/integrations/supabase/client";
import { useCasino } from "@/lib/casino-context";
import { useAuth } from "@/lib/auth-context";
import { invalidateFinance } from "@/lib/fin-invalidate";
import { toast } from "sonner";

export type ClosingInboxRow = {
  id: string;
  section: "live" | "slots";
  source_kind: "cash" | "mobile" | "bank";
  label: string;
  currency: string;
  denomination: number | null;
  orig_count: number | null;
  orig_amount: number;
  corr_delta_count: number;
  corr_delta_amount: number;
  correction_reason: string | null;
  corrected_at: string | null;
  final_amount: number;
  wallet_id: string | null;
  wallet_name: string | null;
  wallet_auto: boolean;
  source_ref_table: string | null;
  source_ref_id: string | null;
  posted_tx_id: string | null;
};

export type ClosingInbox = {
  id: string;
  casino_id: string;
  business_date: string;
  status: "ready" | "posted";
  day_closure_id: string | null;
  posted_at: string | null;
  posted_by: string | null;
};

export type ClosingInboxPayload = { inbox: ClosingInbox | null; rows: ClosingInboxRow[] };

/** Pending (unposted) inboxes for the active casino — drives the Wallets badge. */
export function useClosingInboxPending() {
  const { activeCasinoId: casinoId } = useCasino();
  const { user } = useAuth();
  return useQuery({
    queryKey: ["closing-inbox-pending", casinoId],
    queryFn: async () => {
      if (!casinoId) return [] as { id: string; business_date: string }[];
      const { data, error } = await supabase.rpc("closing_inbox_pending" as any, {
        _casino_id: casinoId,
      });
      if (error) return [];
      return (data as any) ?? [];
    },
    enabled: !!casinoId && !!user,
    ...liveQueryOptions(),
    refetchInterval: 60_000,
  });
}

/** Full inbox payload. Omit businessDate to load the oldest pending one. */
export function useClosingInbox(businessDate?: string | null, enabled = true) {
  const { activeCasinoId: casinoId } = useCasino();
  return useQuery({
    queryKey: ["closing-inbox", casinoId, businessDate ?? "pending"],
    queryFn: async (): Promise<ClosingInboxPayload> => {
      if (!casinoId) return { inbox: null, rows: [] };
      const { data, error } = await supabase.rpc("closing_inbox_get" as any, {
        _casino_id: casinoId,
        _business_date: businessDate ?? null,
      });
      if (error) throw error;
      return (data as any) as ClosingInboxPayload;
    },
    enabled: !!casinoId && enabled,
    ...liveQueryOptions(),
  });
}

export function useSetInboxCorrection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: {
      rowId: string;
      deltaCount?: number;
      deltaAmount?: number;
      reason: string;
    }) => {
      const { data, error } = await supabase.rpc("closing_inbox_set_correction" as any, {
        _row_id: v.rowId,
        _delta_count: v.deltaCount ?? 0,
        _delta_amount: v.deltaAmount ?? 0,
        _reason: v.reason,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["closing-inbox"] });
      toast.success("Correction saved");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useSetInboxWallet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { rowId: string; walletId: string }) => {
      const { error } = await supabase.rpc("closing_inbox_set_wallet" as any, {
        _row_id: v.rowId,
        _wallet_id: v.walletId,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["closing-inbox"] }),
    onError: (e: any) => toast.error(e.message),
  });
}

/** ONE global Post All — server-side atomic + idempotent. */
export function usePostClosingInbox() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (inboxId: string) => {
      const { data, error } = await supabase.rpc("closing_inbox_post_all" as any, {
        _inbox_id: inboxId,
      });
      if (error) throw error;
      return data as any as { status: string; rows?: number };
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["closing-inbox"] });
      qc.invalidateQueries({ queryKey: ["closing-inbox-pending"] });
      invalidateFinance(qc);
      if (res?.status === "unmapped_rows") toast.error("Some rows have no destination wallet");
      else if (res?.status === "missing_reason") toast.error("Every correction needs a reason");
      else if (res?.status === "already_posted") toast.info("This inbox was already posted");
      else toast.success(`Posted ${res?.rows ?? 0} row(s) to wallets`);
    },
    onError: (e: any) => toast.error(e.message),
  });
}
