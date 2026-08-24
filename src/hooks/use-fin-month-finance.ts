/**
 * Month finance — single source of truth for the monthly profit block.
 *
 * Everything (income, budget, unplanned expenses, liabilities movement, float,
 * collections, cash position, profit and manager bonus) is computed server-side
 * by the RPC `fin_month_finance`, so no page owns a competing formula.
 * See docs/FINANCE-FORMULAS.md and src/lib/finance-formulas.ts.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { liveQueryOptionsWithFallback } from "@/lib/live-query-options";
import { toast } from "sonner";

export type UnplannedItem = {
  id: string;
  business_date: string;
  description: string;
  label: string;
  amount: number;
  currency: string;
  amount_tzs: number;
  paid: boolean;
  paid_at: string | null;
  paid_business_date: string | null;
  wallet_id: string | null;
  expense_id: string | null;
  voided_at: string | null;
  reversal_of: string | null;
  note: string | null;
};

export type LiabilityItem = {
  id: string;
  creditor: string;
  description: string | null;
  amount: number;
  currency: string;
  amount_tzs: number;
  business_date: string;
  due_date: string | null;
  source: string;
  transfer_id: string | null;
  voided_at: string | null;
  paid_tzs: number;
  outstanding_tzs: number;
  status: "outstanding" | "partial" | "paid";
};

export type LiabilityPayment = {
  id: string;
  liability_id: string;
  amount_tzs: number;
  business_date: string;
  wallet_id: string | null;
  note: string | null;
};

export type MonthFinance = {
  period: { start: string; end: string; year: number; month: number };
  status: "open" | "closed";
  closed_at: string | null;
  closed_by: string | null;
  usd_rate: number;
  total_income: number;
  budget: number;
  expenses_actual: number;
  collections: number;
  unplanned: {
    total: number;
    paid: number;
    unpaid: number;
    paid_cash_effect: number;
    /** Σ rows NOT represented inside Actual Expenses (expense_id IS NULL). */
    not_in_actual: number;
    items: UnplannedItem[];
  };
  liabilities: {
    opening_tzs: number;
    new_tzs: number;
    repaid_tzs: number;
    closing_tzs: number;
    items: LiabilityItem[];
    payments: LiabilityPayment[];
  };
  /** Repayments that moved cash here (transfer-linked ones excluded — already in transfers). */
  liability_payments_cash: number;
  liability_payments_total: number;
  float: { opening_tzs: number; add_tzs: number; current_tzs: number };
  profit: number;
  /** Approved bonus — the default, or the audited override when one exists. */
  manager_bonus: number;
  /** Lifecycle default: OPEN → 5% × (Income − Budget); CLOSED → 5% × (Income − Actual Expenses). */
  manager_bonus_default?: number;
  manager_bonus_override?: {
    id: string;
    old_amount: number;
    new_amount: number;
    reason: string;
    created_by: string | null;
    created_at: string;
  } | null;
  /** Σ Tips & Bonuses + JP + Card Balance + Miss Chips + Miss Cards. */
  deposits?: number;
  cash_position: number;
  available_for_collection: number;
  snapshot: Record<string, unknown> | null;
};


const EMPTY_MONTH = (year: number, month: number): MonthFinance => ({
  period: { start: "", end: "", year, month },
  status: "open",
  closed_at: null,
  closed_by: null,
  usd_rate: 0,
  total_income: 0,
  budget: 0,
  expenses_actual: 0,
  collections: 0,
  unplanned: { total: 0, paid: 0, unpaid: 0, paid_cash_effect: 0, not_in_actual: 0, items: [] },
  liabilities: { opening_tzs: 0, new_tzs: 0, repaid_tzs: 0, closing_tzs: 0, items: [], payments: [] },
  liability_payments_cash: 0,
  liability_payments_total: 0,
  float: { opening_tzs: 0, add_tzs: 0, current_tzs: 0 },
  profit: 0,
  manager_bonus: 0,
  manager_bonus_default: 0,
  manager_bonus_override: null,
  deposits: 0,
  cash_position: 0,
  available_for_collection: 0,
  snapshot: null,
});


export const fetchMonthFinance = async (
  casinoId: string,
  year: number,
  month: number,
): Promise<MonthFinance> => {
  const { data, error } = await (supabase as any).rpc("fin_month_finance", {
    p_casino_id: casinoId,
    p_year: year,
    p_month: month,
  });
  if (error) throw error;
  return { ...EMPTY_MONTH(year, month), ...((data || {}) as MonthFinance) };
};

/** Sums several casinos into one network figure (lists concatenated). */
export const mergeMonthFinance = (parts: MonthFinance[], year: number, month: number): MonthFinance => {
  if (!parts.length) return EMPTY_MONTH(year, month);
  const s = (pick: (p: MonthFinance) => number) => parts.reduce((t, p) => t + Number(pick(p) || 0), 0);
  return {
    ...EMPTY_MONTH(year, month),
    period: parts[0].period,
    status: parts.every((p) => p.status === "closed") ? "closed" : "open",
    closed_at: parts.every((p) => p.status === "closed") ? parts[0].closed_at : null,
    usd_rate: parts[0].usd_rate,
    total_income: s((p) => p.total_income),
    budget: s((p) => p.budget),
    expenses_actual: s((p) => p.expenses_actual),
    collections: s((p) => p.collections),
    unplanned: {
      total: s((p) => p.unplanned.total),
      paid: s((p) => p.unplanned.paid),
      unpaid: s((p) => p.unplanned.unpaid),
      paid_cash_effect: s((p) => p.unplanned.paid_cash_effect),
      not_in_actual: s((p) => p.unplanned.not_in_actual),
      items: parts.flatMap((p) => p.unplanned.items || []),
    },
    liabilities: {
      opening_tzs: s((p) => p.liabilities.opening_tzs),
      new_tzs: s((p) => p.liabilities.new_tzs),
      repaid_tzs: s((p) => p.liabilities.repaid_tzs),
      closing_tzs: s((p) => p.liabilities.closing_tzs),
      items: parts.flatMap((p) => p.liabilities.items || []),
      payments: parts.flatMap((p) => p.liabilities.payments || []),
    },
    liability_payments_cash: s((p) => p.liability_payments_cash),
    liability_payments_total: s((p) => p.liability_payments_total),
    float: {
      opening_tzs: s((p) => p.float.opening_tzs),
      add_tzs: s((p) => p.float.add_tzs),
      current_tzs: s((p) => p.float.current_tzs),
    },
    profit: s((p) => p.profit),
    manager_bonus: s((p) => p.manager_bonus),
    manager_bonus_default: s((p) => p.manager_bonus_default || 0),
    deposits: s((p) => p.deposits || 0),
    cash_position: s((p) => p.cash_position),
    available_for_collection: s((p) => p.available_for_collection),

    snapshot: null,
  };
};

export const useMonthFinance = (casinoId: string | null, year: number, month: number) =>
  useQuery({
    queryKey: ["fin-month-finance", casinoId, year, month],
    enabled: !!casinoId,
    queryFn: () => fetchMonthFinance(casinoId as string, year, month),
    ...liveQueryOptionsWithFallback(60000),
  });

const useFinMutation = <T,>(fn: (input: T) => Promise<unknown>, okMsg: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fin-month-finance"] });
      qc.invalidateQueries({ queryKey: ["fin-monthly-report"] });
      qc.invalidateQueries({ queryKey: ["boss-report-extras"] });
      qc.invalidateQueries({ queryKey: ["boss-monthly-report"] });
      qc.invalidateQueries({ queryKey: ["fin-balance-snapshot"] });
      qc.invalidateQueries({ queryKey: ["fin-wallets"] });
      toast.success(okMsg);
    },
    onError: (e: any) => toast.error(e?.message || "Operation failed"),
  });
};

const rpc = async (name: string, args: Record<string, unknown>) => {
  const { data, error } = await (supabase as any).rpc(name, args);
  if (error) throw error;
  return data;
};

/* ── Unplanned expenses (Dashboard TV, Floor Manager) ── */
export const useAddUnplanned = () =>
  useFinMutation<{
    casino_id: string;
    business_date: string;
    description: string;
    amount: number;
    currency?: string;
    note?: string;
  }>(
    (i) =>
      rpc("fin_unplanned_add", {
        p_casino_id: i.casino_id,
        p_business_date: i.business_date,
        p_description: i.description,
        p_amount: i.amount,
        p_currency: i.currency || "TZS",
        p_note: i.note || null,
      }),
    "Unplanned expense recorded",
  );

export const useMarkUnplannedPaid = () =>
  useFinMutation<{ id: string; wallet_id?: string | null; paid_date?: string | null }>(
    (i) =>
      rpc("fin_unplanned_mark_paid", {
        p_id: i.id,
        p_wallet_id: i.wallet_id || null,
        p_paid_date: i.paid_date || null,
      }),
    "Marked as paid",
  );

export const useReverseUnplanned = () =>
  useFinMutation<{ id: string; reason?: string }>(
    (i) => rpc("fin_unplanned_reverse", { p_id: i.id, p_reason: i.reason || null }),
    "Unplanned expense reversed",
  );

/* ── Liabilities ── */
export const useAddLiability = () =>
  useFinMutation<{
    casino_id: string;
    creditor: string;
    amount: number;
    business_date: string;
    description?: string;
    currency?: string;
    due_date?: string | null;
  }>(
    (i) =>
      rpc("fin_liability_add", {
        p_casino_id: i.casino_id,
        p_creditor: i.creditor,
        p_amount: i.amount,
        p_business_date: i.business_date,
        p_description: i.description || null,
        p_currency: i.currency || "TZS",
        p_due_date: i.due_date || null,
      }),
    "Liability created",
  );

export const usePayLiability = () =>
  useFinMutation<{
    liability_id: string;
    amount: number;
    business_date: string;
    wallet_id?: string | null;
    note?: string;
  }>(
    (i) =>
      rpc("fin_liability_pay", {
        p_liability_id: i.liability_id,
        p_amount: i.amount,
        p_business_date: i.business_date,
        p_wallet_id: i.wallet_id || null,
        p_note: i.note || null,
      }),
    "Repayment recorded",
  );

/* ── Signed float adjustment ── */
export const useAdjustFloat = () =>
  useFinMutation<{
    casino_id: string;
    wallet_id: string;
    amount: number;
    business_date?: string;
    note?: string;
  }>(
    (i) =>
      rpc("fin_adjust_float", {
        p_casino_id: i.casino_id,
        p_wallet_id: i.wallet_id,
        p_amount: i.amount,
        p_business_date: i.business_date || null,
        p_note: i.note || null,
      }),
    "Basic Float adjusted",
  );

/* ── Month close / reopen / collections ── */
export const useCloseMonthReport = () =>
  useFinMutation<{ casino_id: string; year: number; month: number; note?: string }>(
    (i) =>
      rpc("fin_close_month_report", {
        p_casino_id: i.casino_id,
        p_year: i.year,
        p_month: i.month,
        p_note: i.note || null,
      }),
    "Month closed — report snapshot locked",
  );

export const useReopenMonthReport = () =>
  useFinMutation<{ casino_id: string; year: number; month: number; reason?: string }>(
    (i) =>
      rpc("fin_reopen_month_report", {
        p_casino_id: i.casino_id,
        p_year: i.year,
        p_month: i.month,
        p_reason: i.reason || null,
      }),
    "Month reopened",
  );

export const useRecordCollection = () =>
  useFinMutation<{
    casino_id: string;
    year: number;
    month: number;
    amount: number;
    wallet_id?: string | null;
    business_date?: string | null;
    note?: string;
  }>(
    (i) =>
      rpc("fin_record_collection", {
        p_casino_id: i.casino_id,
        p_year: i.year,
        p_month: i.month,
        p_amount: i.amount,
        p_wallet_id: i.wallet_id || null,
        p_business_date: i.business_date || null,
        p_note: i.note || null,
      }),
    "Collection recorded",
  );

/* ── Manager Bonus override (closed months only, immutable audit) ── */
export const useOverrideManagerBonus = () =>
  useFinMutation<{ casino_id: string; year: number; month: number; amount: number; reason: string }>(
    (i) =>
      rpc("fin_override_manager_bonus", {
        p_casino_id: i.casino_id,
        p_year: i.year,
        p_month: i.month,
        p_amount: i.amount,
        p_reason: i.reason,
      }),
    "Manager Bonus overridden",
  );
