/**
 * Finance module hooks — all CRUD against fin_* tables.
 * Strictly per-casino isolated; categories are global.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useCasino } from "@/lib/casino-context";
import { toast } from "sonner";

/* =====================  CATEGORIES (global)  ===================== */
export const useFinCategories = () =>
  useQuery({
    queryKey: ["fin-categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fin_categories")
        .select("*")
        .order("group_code")
        .order("sort_order");
      if (error) throw error;
      return data;
    },
    staleTime: 1000 * 60 * 60 * 24, // 24h — categories rarely change
  });

export const useUpsertFinCategory = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: any) => {
      const { error } = await supabase.from("fin_categories").upsert(input);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fin-categories"] });
      toast.success("Category saved");
    },
    onError: (e: any) => toast.error(e.message),
  });
};

/** Rename an existing category by id (partial update — safe vs upsert). */
export const useRenameFinCategory = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; name: string }) => {
      const { error } = await supabase
        .from("fin_categories")
        .update({ name: input.name })
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fin-categories"] });
      qc.invalidateQueries({ queryKey: ["fin-monthly-report"] });
      toast.success("Category renamed");
    },
    onError: (e: any) => toast.error(e.message),
  });
};

/** Soft-archive a category (is_active=false). Keeps historical expenses/budgets intact. */
export const useArchiveFinCategory = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("fin_categories")
        .update({ is_active: false })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fin-categories"] });
      qc.invalidateQueries({ queryKey: ["fin-monthly-report"] });
      toast.success("Category archived");
    },
    onError: (e: any) => toast.error(e.message),
  });
};

/** Create a new category inside a group. sort_order = max+1 in that group. */
export const useCreateFinCategory = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { group_code: string; group_name: string; name: string; is_income?: boolean }) => {
      const { data: existing } = await supabase
        .from("fin_categories")
        .select("sort_order")
        .eq("group_code", input.group_code)
        .order("sort_order", { ascending: false })
        .limit(1);
      const nextSort = (existing?.[0]?.sort_order ?? 0) + 10;
      const { error } = await supabase.from("fin_categories").insert({
        group_code: input.group_code,
        group_name: input.group_name,
        name: input.name.trim(),
        sort_order: nextSort,
        is_income: input.is_income ?? false,
        is_active: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fin-categories"] });
      qc.invalidateQueries({ queryKey: ["fin-monthly-report"] });
      toast.success("Category added");
    },
    onError: (e: any) => toast.error(e.message),
  });
};

/** Rename a whole group (updates group_name on all categories sharing group_code). */
export const useRenameFinGroup = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { group_code: string; name: string }) => {
      const { error } = await supabase
        .from("fin_categories")
        .update({ group_name: input.name.trim() })
        .eq("group_code", input.group_code);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fin-categories"] });
      qc.invalidateQueries({ queryKey: ["fin-monthly-report"] });
      toast.success("Section renamed");
    },
    onError: (e: any) => toast.error(e.message),
  });
};


/** Inline-edit a single fin_budget cell (year+month+category+currency). */
export const useUpsertFinBudgetCell = () => {
  const qc = useQueryClient();
  const { activeCasinoId } = useCasino();
  return useMutation({
    mutationFn: async (input: {
      year: number;
      month: number; // 1..12
      category_id: string;
      currency: "TZS" | "USD";
      planned_amount: number;
    }) => {
      if (!activeCasinoId) throw new Error("No casino");
      const { error } = await supabase.from("fin_budget").upsert(
        {
          casino_id: activeCasinoId,
          year: input.year,
          month: input.month,
          category_id: input.category_id,
          currency: input.currency,
          planned_amount: input.planned_amount,
        },
        { onConflict: "casino_id,year,month,category_id,currency" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fin-monthly-report"] });
      qc.invalidateQueries({ queryKey: ["fin-budget"] });
      toast.success("Plan updated");
    },
    onError: (e: any) => toast.error(e.message),
  });
};


/* =====================  WALLETS (per casino)  ===================== */
export const useFinWallets = () => {
  const { activeCasinoId, isSummaryMode } = useCasino();
  return useQuery({
    queryKey: ["fin-wallets", isSummaryMode ? "all" : activeCasinoId],
    queryFn: async () => {
      let q = supabase.from("fin_wallets").select("*, casinos(name, slug)").order("sort_order");
      if (!isSummaryMode && activeCasinoId) q = q.eq("casino_id", activeCasinoId);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
    enabled: isSummaryMode || !!activeCasinoId,
    staleTime: 1000 * 60 * 60 * 6, // 6h — wallets are configuration
  });
};

export const useUpsertFinWallet = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: any) => {
      const payload: any = {
        id: input.id,
        casino_id: input.casino_id,
        name: input.name,
        kind: input.kind,
        currency: input.currency,
        is_active: input.is_active ?? true,
        sort_order: input.sort_order ?? 0,
      };
      // Starting Float fields (editable by manager/finance_manager/super_admin)
      if (input.starting_float_amount !== undefined)
        payload.starting_float_amount = Number(input.starting_float_amount) || 0;
      if (input.starting_float_date !== undefined)
        payload.starting_float_date = input.starting_float_date || null;
      if (input.starting_float_note !== undefined)
        payload.starting_float_note = input.starting_float_note || null;
      const { error } = await supabase.from("fin_wallets").upsert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fin-wallets"] });
      qc.invalidateQueries({ queryKey: ["fin-wallet-balances"] });
      qc.invalidateQueries({ queryKey: ["fin-balance-snapshot"] });
      toast.success("Wallet saved");
    },
    onError: (e: any) => toast.error(e.message),
  });
};

/* =====================  WALLET TX / LEDGER  ===================== */
export const useFinWalletTx = (opts?: { from?: string; to?: string; walletId?: string }) => {
  const { activeCasinoId, isSummaryMode } = useCasino();
  return useQuery({
    queryKey: ["fin-wallet-tx", isSummaryMode ? "all" : activeCasinoId, opts?.from, opts?.to, opts?.walletId],
    queryFn: async () => {
      let q = supabase
        .from("fin_wallet_tx")
        .select("*, fin_wallets(name, currency, kind), fin_categories(name, group_name)")
        .order("business_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(500);
      if (!isSummaryMode && activeCasinoId) q = q.eq("casino_id", activeCasinoId);
      if (opts?.from) q = q.gte("business_date", opts.from);
      if (opts?.to) q = q.lte("business_date", opts.to);
      if (opts?.walletId) q = q.eq("wallet_id", opts.walletId);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
    enabled: isSummaryMode || !!activeCasinoId,
  });
};

export const useFinWalletBalances = () => {
  const { activeCasinoId, isSummaryMode } = useCasino();
  return useQuery({
    queryKey: ["fin-wallet-balances", isSummaryMode ? "all" : activeCasinoId],
    queryFn: async () => {
      let q = supabase.from("fin_wallet_tx").select("wallet_id, amount, casino_id");
      if (!isSummaryMode && activeCasinoId) q = q.eq("casino_id", activeCasinoId);
      const { data, error } = await q;
      if (error) throw error;
      const map = new Map<string, number>();
      (data || []).forEach((r: any) => map.set(r.wallet_id, (map.get(r.wallet_id) || 0) + Number(r.amount)));
      return map;
    },
    enabled: isSummaryMode || !!activeCasinoId,
  });
};

export const useReverseWalletTx = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { error } = await supabase.rpc("fin_reverse_tx", { p_tx_id: id, p_reason: reason });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fin-wallet-tx"] });
      qc.invalidateQueries({ queryKey: ["fin-wallet-balances"] });
      toast.success("Reversed");
    },
    onError: (e: any) => toast.error(e.message),
  });
};

/* =====================  EXPENSES (extended)  ===================== */
export const useFinExpenses = (opts?: { from?: string; to?: string }) => {
  const { activeCasinoId, isSummaryMode } = useCasino();
  return useQuery({
    queryKey: ["fin-expenses", isSummaryMode ? "all" : activeCasinoId, opts?.from, opts?.to],
    queryFn: async () => {
      let q = supabase
        .from("expenses")
        .select("*, fin_categories(name, group_name), fin_wallets(name, currency)")
        .order("business_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(500);
      if (!isSummaryMode && activeCasinoId) q = q.eq("casino_id", activeCasinoId);
      if (opts?.from) q = q.gte("business_date", opts.from);
      if (opts?.to) q = q.lte("business_date", opts.to);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
    enabled: isSummaryMode || !!activeCasinoId,
  });
};

export const useCreateFinExpense = () => {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { activeCasinoId } = useCasino();
  return useMutation({
    mutationFn: async (input: {
      fin_category_id: string;
      wallet_id: string;
      amount: number;
      currency: string;
      exchange_rate: number;
      description: string;
      business_date: string;
      attachment_url?: string | null;
      is_overrun?: boolean;
      overrun_reason?: string;
    }) => {
      if (!user || !activeCasinoId) throw new Error("Not authenticated");
      const amount_tzs = input.amount * (input.exchange_rate || 1);
      // Insert expense row
      const { data: exp, error: e1 } = await supabase
        .from("expenses")
        .insert({
          casino_id: activeCasinoId,
          fin_category_id: input.fin_category_id,
          wallet_id: input.wallet_id,
          amount: input.amount,
          currency: input.currency,
          exchange_rate: input.exchange_rate,
          amount_tzs,
          description: input.description,
          business_date: input.business_date,
          attachment_url: input.attachment_url ?? null,
          is_overrun: !!input.is_overrun,
          overrun_reason: input.overrun_reason ?? null,
          created_by: user.id,
          source: "office",
          cage_type: "live_game",
          // legacy category enum — DB still requires it; pick safe default
          category: "other" as any,
        } as any)
        .select("id")
        .single();
      if (e1) throw e1;
      // Insert ledger entry
      const { error: e2 } = await supabase.from("fin_wallet_tx").insert({
        casino_id: activeCasinoId,
        wallet_id: input.wallet_id,
        kind: "expense",
        category_id: input.fin_category_id,
        amount: -input.amount,
        currency: input.currency,
        fx_rate: input.exchange_rate,
        amount_tzs: -amount_tzs,
        ref_table: "expenses",
        ref_id: exp.id,
        business_date: input.business_date,
        note: input.description,
        created_by: user.id,
      });
      if (e2) throw e2;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fin-expenses"] });
      qc.invalidateQueries({ queryKey: ["fin-wallet-tx"] });
      qc.invalidateQueries({ queryKey: ["fin-wallet-balances"] });
      toast.success("Expense recorded");
    },
    onError: (e: any) => toast.error(e.message),
  });
};

export const useVoidFinExpense = () => {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!user) throw new Error("Not authenticated");
      // Find ledger entry by ref
      const { data: txs } = await supabase
        .from("fin_wallet_tx")
        .select("id")
        .eq("ref_table", "expenses")
        .eq("ref_id", id)
        .is("reversal_of", null);
      for (const tx of txs || []) {
        await supabase.rpc("fin_reverse_tx", { p_tx_id: tx.id, p_reason: "expense voided" });
      }
      await supabase
        .from("expenses")
        .update({ voided_at: new Date().toISOString(), voided_by: user.id })
        .eq("id", id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fin-expenses"] });
      qc.invalidateQueries({ queryKey: ["fin-wallet-tx"] });
      qc.invalidateQueries({ queryKey: ["fin-wallet-balances"] });
      toast.success("Voided");
    },
    onError: (e: any) => toast.error(e.message),
  });
};

/* =====================  DAY CLOSING  ===================== */
export const useFinDayClosing = (businessDate?: string) => {
  const { activeCasinoId } = useCasino();
  return useQuery({
    queryKey: ["fin-day-closing", activeCasinoId, businessDate],
    queryFn: async () => {
      if (!activeCasinoId || !businessDate) return null;
      const { data, error } = await supabase
        .from("fin_day_closing")
        .select("*")
        .eq("casino_id", activeCasinoId)
        .eq("business_date", businessDate)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!activeCasinoId && !!businessDate,
  });
};

export const useDayClosingList = (opts?: { from?: string; to?: string }) => {
  const { activeCasinoId } = useCasino();
  return useQuery({
    queryKey: ["fin-day-closing-list", activeCasinoId, opts?.from, opts?.to],
    queryFn: async () => {
      if (!activeCasinoId) return [];
      let q = supabase
        .from("fin_day_closing")
        .select("*")
        .eq("casino_id", activeCasinoId)
        .order("business_date", { ascending: false })
        .limit(60);
      if (opts?.from) q = q.gte("business_date", opts.from);
      if (opts?.to) q = q.lte("business_date", opts.to);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
    enabled: !!activeCasinoId,
  });
};

export const useUpsertDayClosing = () => {
  const qc = useQueryClient();
  const { activeCasinoId } = useCasino();
  return useMutation({
    mutationFn: async (input: any) => {
      if (!activeCasinoId) throw new Error("No casino");
      const payload = { ...input, casino_id: activeCasinoId };
      const { error } = await supabase
        .from("fin_day_closing")
        .upsert(payload, { onConflict: "casino_id,business_date" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fin-day-closing"] });
      qc.invalidateQueries({ queryKey: ["fin-day-closing-list"] });
      toast.success("Saved");
    },
    onError: (e: any) => toast.error(e.message),
  });
};

export const useLockDayClosing = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, varianceNote }: { id: string; varianceNote?: string | null }) => {
      const { error } = await supabase.rpc("fin_lock_day_closing", {
        p_id: id,
        p_variance_note: varianceNote ?? null,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fin-day-closing"] });
      qc.invalidateQueries({ queryKey: ["fin-day-closing-list"] });
      qc.invalidateQueries({ queryKey: ["fin-wallet-tx"] });
      qc.invalidateQueries({ queryKey: ["fin-wallet-balances"] });
      toast.success("Locked");
    },
    onError: (e: any) => toast.error(e.message),
  });
};

/** Real Cage business-day closure snapshot totals for given date. */
export const useBusinessDayClosureSnapshot = (businessDate?: string) => {
  const { activeCasinoId } = useCasino();
  return useQuery({
    queryKey: ["bdc-snapshot", activeCasinoId, businessDate],
    queryFn: async () => {
      if (!activeCasinoId || !businessDate) return null;
      const { data } = await supabase
        .from("business_day_closures")
        .select("snapshot, closed_at, closed_method")
        .eq("casino_id", activeCasinoId)
        .eq("business_date", businessDate)
        .order("closed_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!data) return null;
      const totals = (data.snapshot as any)?.totals || {};
      return {
        closedAt: data.closed_at as string,
        closedMethod: data.closed_method as string,
        tables: Number(totals.tables_result || 0),
        slots: Number(totals.slots_result || 0),
      };
    },
    enabled: !!activeCasinoId && !!businessDate,
  });
};

/* Auto-pull tables_result from shifts for given business date.
 * Business day = 07:00 EAT (UTC+3) → 04:00 UTC start. */
export const useShiftsTablesResultForDate = (businessDate?: string) => {
  const { activeCasinoId } = useCasino();
  return useQuery({
    queryKey: ["shifts-tables-result", activeCasinoId, businessDate],
    queryFn: async () => {
      if (!activeCasinoId || !businessDate) return 0;
      const start = `${businessDate}T04:00:00.000Z`;
      const d = new Date(businessDate);
      d.setUTCDate(d.getUTCDate() + 1);
      const end = `${d.toISOString().slice(0, 10)}T04:00:00.000Z`;
      const { data } = await supabase
        .from("shifts")
        .select("tables_result")
        .eq("casino_id", activeCasinoId)
        .gte("opened_at", start)
        .lt("opened_at", end);
      return (data || []).reduce((s: number, r: any) => s + Number(r.tables_result || 0), 0);
    },
    enabled: !!activeCasinoId && !!businessDate,
    staleTime: 30_000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });
};

/* Auto-pull slots system result from cage_slots_shifts for given business date. */
export const useSlotsAutoForDate = (businessDate?: string) => {
  const { activeCasinoId } = useCasino();
  return useQuery({
    queryKey: ["slots-auto-for-date", activeCasinoId, businessDate],
    queryFn: async () => {
      if (!activeCasinoId || !businessDate) return 0;
      const { data } = await supabase
        .from("cage_slots_shifts")
        .select("system_shift_result")
        .eq("casino_id", activeCasinoId)
        .eq("business_date", businessDate);
      return (data || []).reduce(
        (s: number, r: any) => s + Number(r.system_shift_result || 0),
        0,
      );
    },
    enabled: !!activeCasinoId && !!businessDate,
    staleTime: 30_000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });
};


/* =====================  MONEY CHANGE  ===================== */
export const useFinMoneyChange = (opts?: { from?: string; to?: string }) => {
  const { activeCasinoId, isSummaryMode } = useCasino();
  return useQuery({
    queryKey: ["fin-money-change", isSummaryMode ? "all" : activeCasinoId, opts?.from, opts?.to],
    queryFn: async () => {
      let q = supabase
        .from("fin_money_change")
        .select("*, fwf:fin_wallets!fin_money_change_from_wallet_id_fkey(name, currency), fwt:fin_wallets!fin_money_change_to_wallet_id_fkey(name, currency)")
        .order("business_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(200);
      if (!isSummaryMode && activeCasinoId) q = q.eq("casino_id", activeCasinoId);
      if (opts?.from) q = q.gte("business_date", opts.from);
      if (opts?.to) q = q.lte("business_date", opts.to);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
    enabled: isSummaryMode || !!activeCasinoId,
  });
};

export const useCreateMoneyChange = () => {
  const qc = useQueryClient();
  const { activeCasinoId } = useCasino();
  return useMutation({
    mutationFn: async (input: {
      to_casino_id?: string | null;
      from_wallet_id: string;
      to_wallet_id: string;
      from_amount: number;
      from_currency: string;
      to_amount: number;
      to_currency: string;
      rate: number;
      business_date: string;
      note?: string;
    }) => {
      if (!activeCasinoId) throw new Error("No casino");
      const { error } = await supabase.rpc("fin_money_change_create", {
        p_casino: activeCasinoId,
        p_to_casino: input.to_casino_id || null,
        p_from_wallet: input.from_wallet_id,
        p_to_wallet: input.to_wallet_id,
        p_from_amount: input.from_amount,
        p_from_ccy: input.from_currency,
        p_to_amount: input.to_amount,
        p_to_ccy: input.to_currency,
        p_rate: input.rate,
        p_business_date: input.business_date,
        p_note: input.note ?? "",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fin-money-change"] });
      qc.invalidateQueries({ queryKey: ["fin-wallet-tx"] });
      qc.invalidateQueries({ queryKey: ["fin-wallet-balances"] });
      toast.success("Money change recorded");
    },
    onError: (e: any) => toast.error(e.message),
  });
};

/* =====================  BUDGET  ===================== */
export const useFinBudget = (year: number, month?: number) => {
  const { activeCasinoId, isSummaryMode } = useCasino();
  return useQuery({
    queryKey: ["fin-budget", isSummaryMode ? "all" : activeCasinoId, year, month],
    queryFn: async () => {
      let q = supabase
        .from("fin_budget")
        .select("*, fin_categories(name, group_name, group_code, sort_order)")
        .eq("year", year);
      if (!isSummaryMode && activeCasinoId) q = q.eq("casino_id", activeCasinoId);
      if (month !== undefined) q = q.eq("month", month);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
    enabled: isSummaryMode || !!activeCasinoId,
  });
};

export const useUpsertFinBudget = () => {
  const qc = useQueryClient();
  const { activeCasinoId } = useCasino();
  return useMutation({
    mutationFn: async (input: {
      year: number; month: number; category_id: string; currency: string; planned_amount: number;
      overrun_limit_pct?: number;
    }) => {
      if (!activeCasinoId) throw new Error("No casino");
      const { error } = await supabase
        .from("fin_budget")
        .upsert({ ...input, casino_id: activeCasinoId }, { onConflict: "casino_id,year,month,category_id,currency" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fin-budget"] });
      toast.success("Budget saved");
    },
    onError: (e: any) => toast.error(e.message),
  });
};

export const useSetAnnualBudget = () => {
  const qc = useQueryClient();
  const { activeCasinoId } = useCasino();
  return useMutation({
    mutationFn: async (input: { year: number; category_id: string; currency: string; annual: number }) => {
      if (!activeCasinoId) throw new Error("No casino");
      const { error } = await supabase.rpc("fin_budget_set_annual", {
        p_casino: activeCasinoId,
        p_year: input.year,
        p_category: input.category_id,
        p_currency: input.currency,
        p_annual: input.annual,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fin-budget"] });
      toast.success("Annual override applied");
    },
    onError: (e: any) => toast.error(e.message),
  });
};

/* =====================  AUDIT LOG  ===================== */
export const useFinAuditLog = () => {
  const { activeCasinoId, isSummaryMode } = useCasino();
  return useQuery({
    queryKey: ["fin-audit-log", isSummaryMode ? "all" : activeCasinoId],
    queryFn: async () => {
      let q = supabase.from("fin_audit_log").select("*").order("created_at", { ascending: false }).limit(500);
      if (!isSummaryMode && activeCasinoId) q = q.eq("casino_id", activeCasinoId);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
    enabled: isSummaryMode || !!activeCasinoId,
  });
};

/* =====================  EXCEL IMPORTS  ===================== */
export const useFinExcelImports = () => {
  const { activeCasinoId } = useCasino();
  return useQuery({
    queryKey: ["fin-excel-imports", activeCasinoId],
    queryFn: async () => {
      if (!activeCasinoId) return [];
      const { data, error } = await supabase
        .from("fin_excel_imports")
        .select("*")
        .eq("casino_id", activeCasinoId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
    enabled: !!activeCasinoId,
  });
};
