/**
 * Bank Statement Import — data hooks.
 *
 * All financial mutations are DB-authoritative RPCs:
 *   fin_bank_import_create_batch / _update_row / _ignore_row /
 *   _confirm_row / _confirm_batch / _delete_batch
 * The client never writes expenses or fin_wallet_tx directly.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { invalidateFinance } from "@/lib/fin-invalidate";
import type { ParsedStatementRow } from "@/lib/bank-statement-parser";

export type BankBatch = {
  id: string;
  casino_id: string;
  wallet_id: string;
  filename: string;
  file_hash: string | null;
  currency: string;
  status: "in_review" | "partially_confirmed" | "confirmed" | "abandoned";
  opening_balance: number | null;
  closing_balance: number | null;
  period_from: string | null;
  period_to: string | null;
  row_count: number;
  total_debit: number;
  total_credit: number;
  uploaded_by: string | null;
  confirmed_at: string | null;
  created_at: string;
};

export type BankRow = {
  id: string;
  batch_id: string;
  row_index: number;
  tx_date: string;
  description: string;
  reference: string | null;
  debit: number;
  credit: number;
  signed_amount: number;
  currency: string;
  proposed_kind: "expense" | "income" | "unclassified";
  fin_category_id: string | null;
  matched_expense_id: string | null;
  matched_wallet_tx_id: string | null;
  is_duplicate: boolean;
  status: "pending" | "matched" | "duplicate" | "ignored" | "confirmed" | "error";
  expense_id: string | null;
  wallet_tx_id: string | null;
  note: string | null;
  error_text: string | null;
};

export const useBankBatches = (casinoId?: string, walletId?: string) =>
  useQuery({
    queryKey: ["bank-import-batches", casinoId, walletId ?? "all"],
    queryFn: async (): Promise<BankBatch[]> => {
      let q = supabase
        .from("fin_bank_statement_batches")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (casinoId) q = q.eq("casino_id", casinoId);
      if (walletId) q = q.eq("wallet_id", walletId);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as BankBatch[];
    },
    enabled: !!casinoId,
    staleTime: 30_000,
  });

export const useBankRows = (batchId?: string | null) =>
  useQuery({
    queryKey: ["bank-import-rows", batchId],
    queryFn: async (): Promise<BankRow[]> => {
      const { data, error } = await supabase
        .from("fin_bank_statement_rows")
        .select("*")
        .eq("batch_id", batchId!)
        .order("row_index");
      if (error) throw error;
      return (data || []) as BankRow[];
    },
    enabled: !!batchId,
    staleTime: 10_000,
  });

const useRefresh = () => {
  const qc = useQueryClient();
  return (batchId?: string | null) => {
    qc.invalidateQueries({ queryKey: ["bank-import-batches"] });
    qc.invalidateQueries({ queryKey: ["bank-import-rows", batchId] });
    invalidateFinance(qc);
    qc.invalidateQueries({ queryKey: ["expenses-approvals"] });
  };
};

export const useCreateBankBatch = () => {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (input: {
      casinoId: string;
      walletId: string;
      filename: string;
      fileHash: string;
      rows: ParsedStatementRow[];
      opening: number | null;
      closing: number | null;
    }) => {
      const { data, error } = await supabase.rpc("fin_bank_import_create_batch", {
        p_casino_id: input.casinoId,
        p_wallet_id: input.walletId,
        p_filename: input.filename,
        p_file_hash: input.fileHash,
        p_rows: input.rows as unknown as never,
        p_opening: input.opening,
        p_closing: input.closing,
      });
      if (error) throw error;
      return data as unknown as string;
    },
    onSuccess: (id) => refresh(id),
  });
};

export const useUpdateBankRow = () => {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (input: {
      rowId: string;
      batchId: string;
      finCategoryId?: string | null;
      description?: string | null;
      proposedKind?: string | null;
    }) => {
      const { error } = await supabase.rpc("fin_bank_import_update_row", {
        p_row_id: input.rowId,
        p_fin_category_id: input.finCategoryId ?? null,
        p_description: input.description ?? null,
        p_proposed_kind: input.proposedKind ?? null,
      });
      if (error) throw error;
    },
    onSuccess: (_d, v) => refresh(v.batchId),
  });
};

export const useIgnoreBankRow = () => {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (input: { rowId: string; batchId: string; note?: string }) => {
      const { error } = await supabase.rpc("fin_bank_import_ignore_row", {
        p_row_id: input.rowId,
        p_note: input.note ?? null,
      });
      if (error) throw error;
    },
    onSuccess: (_d, v) => refresh(v.batchId),
  });
};

export const useConfirmBankRow = () => {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (input: { rowId: string; batchId: string }) => {
      const { data, error } = await supabase.rpc("fin_bank_import_confirm_row", { p_row_id: input.rowId });
      if (error) throw error;
      return data as unknown as { result: string; expense_id?: string };
    },
    onSuccess: (_d, v) => refresh(v.batchId),
  });
};

export const useConfirmBankBatch = () => {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (batchId: string) => {
      const { data, error } = await supabase.rpc("fin_bank_import_confirm_batch", { p_batch_id: batchId });
      if (error) throw error;
      return data as unknown as { created: number; reconciled: number; skipped: number; errors: number };
    },
    onSuccess: (_d, batchId) => refresh(batchId),
  });
};

export const useDeleteBankBatch = () => {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (batchId: string) => {
      const { error } = await supabase.rpc("fin_bank_import_delete_batch", { p_batch_id: batchId });
      if (error) throw error;
    },
    onSuccess: (_d, batchId) => refresh(batchId),
  });
};
